#!/usr/bin/env python3
"""
Render worker: the server half of the listing video app. Runs forever on Railway.

Every few seconds it:
  1. sends photos of newly queued listings to fal.ai for AI camera moves
  2. re-sends any clip a realtor asked to redo
  3. checks running fal.ai jobs, and stores finished clips in Supabase Storage
  4. moves a listing to "review" once all its clips are back
  5. builds the final 16:9 / 9:16 videos for listings the realtor approved

Environment variables (set in Railway -> Variables):
  SUPABASE_URL                e.g. https://abcd1234.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   secret; bypasses row level security
  FAL_KEY                     secret; fal.ai API key
  POLL_SECONDS                optional, default 10
"""
import json, os, sys, tempfile, time, traceback, urllib.parse
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "engine"))
import ai_motion as am   # prompts, move picker, photo encoder
import render as engine  # template renderer
import reels             # the Reel pack: several cuts per listing
import effects           # per-photo effects + centered vertical framing
import notify            # customer emails (Resend)
from motion import motion_score
import staging

SB = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
FAL = os.environ.get("FAL_KEY", "")
POLL = int(os.environ.get("POLL_SECONDS", "10"))
MODEL = os.environ.get("FAL_MODEL", am.DEFAULT_MODEL)
MAX_ATTEMPTS = 3
CLIP_SECONDS = 5
# The renderer's subtle digital drift goes the same way as the AI camera move, so they never fight.
DRIFT_FOR = {"push": "push", "pull": "pull", "pan_left": "pan_l", "pan_right": "pan_r", "glide": "pan_r",
             "orbit_left": "pan_l", "orbit_right": "pan_r", "rise": "push", "descend": "push", "tilt_up": "rise"}
STATIC_BELOW = 2.5        # motion score under this = the AI camera barely moved: remake it once, pushing harder
BOOST = (" IMPORTANT: the camera must move clearly and continuously for the entire clip, a steady and noticeable"
         " dolly forward through the space with strong parallax. Never hold still.")
VERTICAL_SHOTS = 8      # photos that also get a true 9:16 clip (the Reels use these)
TRANSFORMS = {"build", "staging", "dusk"}   # effects whose room changes on screen: labels wait for the change

S = requests.Session()
S.headers.update({"apikey": KEY, "Authorization": f"Bearer {KEY}"})


_emails = {}
def user_email(user_id):
    """The customer's sign-in email, from Supabase Auth (cached)."""
    if user_id not in _emails:
        try:
            r = S.get(f"{SB}/auth/v1/admin/users/{user_id}", timeout=20)
            _emails[user_id] = (r.json() or {}).get("email") if r.ok else None
        except Exception:
            _emails[user_id] = None
    return _emails[user_id]


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ------------------------------------------------------------------ Supabase helpers
def db_get(table, **filters):
    q = {"select": "*", **{k: v for k, v in filters.items()}}
    r = S.get(f"{SB}/rest/v1/{table}", params=q, timeout=30)
    r.raise_for_status()
    return r.json()


def db_patch(table, match: dict, values: dict):
    q = {k: f"eq.{v}" for k, v in match.items()}
    r = S.patch(f"{SB}/rest/v1/{table}", params=q, json=values,
                headers={"Prefer": "return=minimal"}, timeout=30)
    r.raise_for_status()


def db_insert(table, rows):
    r = S.post(f"{SB}/rest/v1/{table}", json=rows, headers={"Prefer": "return=minimal"}, timeout=30)
    r.raise_for_status()


def db_delete(table, match: dict):
    q = {k: f"eq.{v}" for k, v in match.items()}
    r = S.delete(f"{SB}/rest/v1/{table}", params=q, timeout=30)
    r.raise_for_status()


def storage_get(bucket, path, dest):
    url = f"{SB}/storage/v1/object/{bucket}/{urllib.parse.quote(path)}"
    with S.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    return dest


def storage_put(bucket, path, src, content_type="video/mp4"):
    url = f"{SB}/storage/v1/object/{bucket}/{urllib.parse.quote(path)}"
    with open(src, "rb") as f:
        r = S.post(url, data=f, headers={"Content-Type": content_type, "x-upsert": "true"}, timeout=600)
    r.raise_for_status()


# ------------------------------------------------------------------ fal.ai helpers
def fal_call(url, body=None):
    h = {"Authorization": f"Key {FAL}", "Content-Type": "application/json"}
    r = requests.post(url, json=body, headers=h, timeout=120) if body is not None else requests.get(url, headers=h, timeout=120)
    r.raise_for_status()
    return r.json()


def submit_clip(shot, index, user_id, orient="h"):
    """Download the photo, apply its effect, send it to fal.ai, and mark that orientation as generating.
    orient "h" = the 16:9 clip (review + MLS tour); "v" = a centered 9:16 clip for the vertical videos."""
    with tempfile.TemporaryDirectory() as tmp:
        src = storage_get("photos", shot["photo_path"], os.path.join(tmp, "photo" + os.path.splitext(shot["photo_path"])[1]))
        kind = effects.kind_of(shot, index)
        if orient == "v":
            src = effects.make_vertical(src, kind, os.path.join(tmp, "vertical.jpg"))
        end_src = None
        if (shot.get("effect") == "frames") and shot.get("end_photo_path"):
            end_src = storage_get("photos", shot["end_photo_path"],
                                  os.path.join(tmp, "end" + os.path.splitext(shot["end_photo_path"])[1]))
            if orient == "v":
                end_src = effects.make_vertical(end_src, kind, os.path.join(tmp, "end_vertical.jpg"))
        custom = am.parse_custom(shot.get("move"))
        chosen = custom is not None or (shot.get("move") or "auto") in am.MOVES_BOLD   # the realtor picked the camera
        mv = am.pick_move({"label": shot["label"], "sub": shot["sub"], "move": shot.get("move") or "auto"}, index)
        cam = am.custom_prompt(custom) if custom else am.MOVES_BOLD[mv]
        fx = shot.get("effect") or "none"
        body, _ = effects.kling_body(fx, kind, src, tmp, f"{am.BASE_BOLD} {cam}",
                                     shot.get("stage_style") or "modern", shot.get("stage_room") or "auto", end_src)
        if chosen and fx not in ("none", "reveal", "frames"):
            body["prompt"] += " Camera direction: " + cam
        if (shot.get("error") or "").startswith("static") and orient == "h":
            body["prompt"] += BOOST   # the last take barely moved
            body["cfg_scale"] = max(body.get("cfg_scale", 0.6), 0.8)
        body.setdefault("negative_prompt", am.NEGATIVE)
        body["duration"] = str(CLIP_SECONDS)
        r = fal_call(f"https://queue.fal.run/{MODEL}", body)
    if orient == "v":
        db_patch("shots", {"id": shot["id"]}, {"vclip_status": "generating", "vfal_status_url": r["status_url"],
                                                "vfal_response_url": r["response_url"]})
    else:
        db_patch("shots", {"id": shot["id"]}, {
            "clip_status": "generating", "fal_status_url": r["status_url"],
            "fal_response_url": r["response_url"], "clip_attempts": (shot.get("clip_attempts") or 0) + 1,
            "approved": False, "error": None,
        })
    log(f"  shot {index + 1} [{orient}]: submitted [{shot.get('effect') or 'none'} · {shot.get('move') if custom else mv}]")


def wants_vertical(l, index):
    return index < VERTICAL_SHOTS   # every listing gets the vertical Reel pack


# ------------------------------------------------------------------ steps
def step_queued():
    for l in db_get("listings", status="eq.queued", order="created_at"):
        log(f"listing {l['id'][:8]} queued -> generating")
        shots = db_get("shots", listing_id=f"eq.{l['id']}", order="position")
        try:
            for i, s in enumerate(shots):
                if s["clip_status"] in ("none", "failed", "queued"):
                    submit_clip(s, i, l["user_id"])
                if wants_vertical(l, i) and (s.get("vclip_status") or "none") in ("none", "failed"):
                    try:
                        submit_clip(s, i, l["user_id"], "v")
                    except Exception as e:   # vertical is a bonus: the 9:16 videos fall back to cropping
                        log(f"  shot {i + 1} vertical failed: {e}")
                        db_patch("shots", {"id": s["id"]}, {"vclip_status": "failed"})
            db_patch("listings", {"id": l["id"]}, {"status": "generating", "error": None})
        except Exception as e:
            log("  submit failed:", e)
            db_patch("listings", {"id": l["id"]}, {"status": "failed", "error": f"Could not start clips: {e}"[:400]})
            notify.failed(user_email(l["user_id"]), l, "the clips could not be started")


def step_redo():
    for s in db_get("shots", clip_status="eq.redo"):
        if (s.get("clip_attempts") or 0) >= MAX_ATTEMPTS + 2:
            db_patch("shots", {"id": s["id"]}, {"clip_status": "ready", "error": "Redo limit reached"})
            continue
        l = db_get("listings", id=f"eq.{s['listing_id']}")
        if not l:
            continue
        idx = s["position"]
        log(f"listing {s['listing_id'][:8]} redo shot {idx + 1}")
        try:
            static = (s.get("error") or "").startswith("static")
            submit_clip(s, idx, l[0]["user_id"])
            if wants_vertical(l[0], idx) and not static:
                try:
                    submit_clip(s, idx, l[0]["user_id"], "v")
                except Exception as e:
                    db_patch("shots", {"id": s["id"]}, {"vclip_status": "failed"})
        except Exception as e:
            db_patch("shots", {"id": s["id"]}, {"clip_status": "failed", "error": str(e)[:400]})


def _download(url, dest):
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)


def step_poll():
    for orient, status_f, st_url, res_url, path_f in (("h", "clip_status", "fal_status_url", "fal_response_url", "clip_path"),
                                                      ("v", "vclip_status", "vfal_status_url", "vfal_response_url", "vclip_path")):
        for s in db_get("shots", **{status_f: "eq.generating"}):
            try:
                st = fal_call(s[st_url]).get("status")
            except Exception as e:
                log("  status check error:", e)
                continue
            if st != "COMPLETED":
                continue
            listing = db_get("listings", id=f"eq.{s['listing_id']}")
            if not listing:
                continue
            user_id = listing[0]["user_id"]
            try:
                res = fal_call(s[res_url])
                url = (res.get("video") or {}).get("url")
                if not url:
                    raise RuntimeError(res.get("detail") or "fal.ai returned no video")
                with tempfile.TemporaryDirectory() as tmp:
                    dest = os.path.join(tmp, "clip.mp4")
                    _download(url, dest)
                    suffix = "-v" if orient == "v" else ""
                    path = f"{user_id}/{s['listing_id']}/{s['id']}-{s.get('clip_attempts') or 1}{suffix}.mp4"
                    storage_put("clips", path, dest)
                    score = motion_score(dest)
                upd = {status_f: "ready", path_f: path}
                if orient == "h": upd["error"] = None
                if (orient == "h" and score < STATIC_BELOW and (s.get("effect") or "none") not in TRANSFORMS
                        and (s.get("clip_attempts") or 1) < MAX_ATTEMPTS and not (s.get("error") or "").startswith("static")):
                    upd.update(clip_status="redo", error=f"static take (motion {score:.1f}), remaking with a stronger move")
                db_patch("shots", {"id": s["id"]}, upd)
                log(f"  shot {s['position'] + 1} [{orient}] of {s['listing_id'][:8]}: {upd[status_f]} · motion {score:.1f}")
            except Exception as e:
                log(f"  shot {s['position'] + 1} [{orient}]: result failed: {e}")
                if orient == "v":
                    db_patch("shots", {"id": s["id"]}, {"vclip_status": "failed"})
                elif (s.get("clip_attempts") or 0) < MAX_ATTEMPTS:
                    db_patch("shots", {"id": s["id"]}, {"clip_status": "redo", "error": str(e)[:400]})
                else:
                    db_patch("shots", {"id": s["id"]}, {"clip_status": "failed", "error": str(e)[:400]})


def step_to_review():
    for l in db_get("listings", status="eq.generating"):
        shots = db_get("shots", listing_id=f"eq.{l['id']}")
        states = {s["clip_status"] for s in shots}
        if states & {"queued", "generating", "redo", "none"}:
            continue
        if any((s.get("vclip_status") or "none") == "generating" for s in shots):
            continue   # vertical clips still coming
        if states == {"failed"}:
            db_patch("listings", {"id": l["id"]}, {"status": "failed", "error": "No clips could be made. Try different photos."})
            notify.failed(user_email(l["user_id"]), l, "none of the photos could be turned into clips. Try different photos")
        else:
            db_patch("listings", {"id": l["id"]}, {"status": "review"})
            log(f"listing {l['id'][:8]} -> review")
            notify.clips_ready(user_email(l["user_id"]), l)


def step_render():
    for l in db_get("listings", status="eq.rendering", order="updated_at"):
        log(f"listing {l['id'][:8]} rendering {l['formats']}")
        try:
            render_listing(l)
            db_patch("listings", {"id": l["id"]}, {"status": "done", "error": None})
            n = len(db_get("renders", listing_id=f"eq.{l['id']}"))
            notify.pack_ready(user_email(l["user_id"]), l, n)
            log(f"listing {l['id'][:8]} -> done")
        except Exception as e:
            traceback.print_exc()
            db_patch("listings", {"id": l["id"]}, {"status": "failed", "error": f"Video build failed: {e}"[:400]})
            notify.failed(user_email(l["user_id"]), l, "the final video could not be built")


def render_listing(l):
    shots = db_get("shots", listing_id=f"eq.{l['id']}", order="position")
    prof = (db_get("profiles", id=f"eq.{l['user_id']}") or [{}])[0]
    with tempfile.TemporaryDirectory() as tmp:
        media = os.path.join(tmp, "media"); os.makedirs(media)
        job_shots = []
        vpath = {}   # horizontal clip path -> centered vertical clip path, for the 9:16 videos
        for s in shots:
            fx = s.get("effect") or "none"
            if s["clip_status"] == "ready" and s.get("clip_path"):
                p = storage_get("clips", s["clip_path"], os.path.join(media, f"{s['id']}.mp4"))
                rel = os.path.relpath(p, tmp)
                shot = {"path": rel, "label": s["label"], "sub": s["sub"], "effect": fx,
                        "duration": 5.0 if fx in TRANSFORMS else 4.6}
                if fx in TRANSFORMS: shot["label_delay"] = 0.6   # show the label once the room has transformed
                cv = am.parse_custom(s.get("move"))   # digital drift follows the AI camera
                shot["drift_move"] = am.custom_drift(cv) if cv else DRIFT_FOR.get(am.pick_move(s, s["position"]), "push")
                job_shots.append(shot)
                if s.get("vclip_status") == "ready" and s.get("vclip_path"):
                    try:
                        vp = storage_get("clips", s["vclip_path"], os.path.join(media, f"{s['id']}-v.mp4"))
                        vpath[rel] = os.path.relpath(vp, tmp)
                    except Exception as e:
                        log(f"  vertical clip download failed: {e}")
            else:  # clip failed: fall back to classic pan/zoom on the photo
                ext = os.path.splitext(s["photo_path"])[1] or ".jpg"
                p = storage_get("photos", s["photo_path"], os.path.join(media, f"{s['id']}{ext}"))
                job_shots.append({"path": os.path.relpath(p, tmp), "label": s["label"], "sub": s["sub"], "effect": "none"})
        if job_shots:
            job_shots[0]["label"] = ""; job_shots[0]["sub"] = ""   # title card sits over the first shot
        agent = {"name": prof.get("full_name") or "", "title": prof.get("title") or "",
                 "brokerage": prof.get("brokerage") or "", "phone": prof.get("phone") or ""}
        for k in ("headshot", "logo"):
            path = prof.get(f"{k}_path")
            if path:
                try:
                    dest = storage_get("branding", path, os.path.join(media, k + (os.path.splitext(path)[1] or ".png")))
                    agent[k] = os.path.relpath(dest, tmp)
                except Exception as e:
                    log(f"  {k} download failed: {e}")
        outro = l["outro"]
        if outro == "client":   # a photographer delivering the client agent's branding
            agent = {"name": l.get("client_name") or "", "title": "", "brokerage": l.get("client_brokerage") or "",
                     "phone": l.get("client_phone") or ""}
            for k in ("headshot", "logo"):
                path = l.get(f"client_{k}_path")
                if path:
                    try:
                        dest = storage_get("branding", path, os.path.join(media, "client-" + k + (os.path.splitext(path)[1] or ".png")))
                        agent[k] = os.path.relpath(dest, tmp)
                    except Exception as e:
                        log(f"  client {k} download failed: {e}")
            outro = "branded"
        if outro == "branded" and not (agent["name"] or agent["phone"]):
            outro = "simple"   # no branding saved yet
        music = None   # a track from the built-in library, or the customer's own upload
        mid = l.get("music") or "none"
        if mid == "custom" and l.get("music_path"):
            try:
                music = storage_get("photos", l["music_path"], os.path.join(media, "music" + (os.path.splitext(l["music_path"])[1] or ".mp3")))
            except Exception as e:
                log(f"  music download failed: {e}")
        elif mid != "none":
            lib = os.path.join(HERE, "engine", "music", f"{mid}.mp3")
            music = lib if os.path.exists(lib) else None
        job = {
            "template": l["template"], "transition": l.get("transition") or "crossfade", "kicker": l["kicker"] or "NOW AVAILABLE", "headline": l["headline"] or "",
            "address": l["address"], "city_line": l["city_line"],
            "stats": {"beds": l.get("beds"), "baths": l.get("baths"), "sqft": l.get("sqft"),
                      "acres": l.get("acres"), "price": l.get("price")},
            "shots": job_shots, "agent": agent, "outro": outro, "music": music,
        }
        made = []
        pack = reels.build_pack(job, l)
        for n, item in enumerate(pack, 1):
            kind, fmt = item["kind"], item["fmt"]
            j = item["job"]
            if fmt == "9:16" and vpath:   # use the true vertical clips where we have them
                j = dict(j, shots=[dict(sh, path=vpath.get(sh["path"], sh["path"])) for sh in j["shots"]])
            job_path = os.path.join(tmp, f"job-{kind}.json")
            json.dump(j, open(job_path, "w"))
            name = f"{kind}-{fmt.replace(':', 'x')}"
            out = os.path.join(tmp, f"{name}.mp4")
            log(f"  rendering {n}/{len(pack)}: {name}")
            engine.render(job_path, out, fmt=fmt)
            path = f"{l['user_id']}/{l['id']}/{name}.mp4"
            storage_put("videos", path, out)
            made.append({"listing_id": l["id"], "format": fmt, "kind": kind, "video_path": path})
        db_delete("renders", {"listing_id": l["id"]})
        db_insert("renders", made)


def step_stagings():
    """Staged photos: AI-stage each queued photo, save a clean full-size copy (sold) and a watermarked preview."""
    stale = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 600))
    for st in db_get("stagings", status="eq.processing", updated_at=f"lt.{stale}"):   # the worker restarted mid-job
        db_patch("stagings", {"id": st["id"]}, {"status": "queued"})
    for st in db_get("stagings", status="eq.queued", order="created_at", limit="4"):
        n = (st.get("attempts") or 0) + 1
        db_patch("stagings", {"id": st["id"]}, {"status": "processing", "attempts": n, "error": None})
        log(f"staging {st['id'][:8]}: {st['style']} {st['room']} (take {n})")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                src = storage_get("photos", st["source_path"], os.path.join(tmp, "src"))
                res = effects.run(staging.PHOTO_MODEL, {"prompt": staging.prompt(st["style"], st["room"]),
                                                        "image_urls": [effects.data_uri(src)], "num_images": 1,
                                                        "resolution": "2K", "output_format": "jpeg"}, timeout=300)
                full = effects.fetch(res["images"][0]["url"], os.path.join(tmp, "full.jpg"))
                prev = staging.preview(full, os.path.join(tmp, "prev.jpg"))
                full_path = f"{st['user_id']}/{st['id']}-{n}.jpg"
                storage_put("staged-full", full_path, full, "image/jpeg")
                storage_put("staged", full_path, prev, "image/jpeg")
            db_patch("stagings", {"id": st["id"]}, {"status": "ready", "result_path": full_path, "preview_path": full_path})
        except Exception as e:
            log(f"  staging {st['id'][:8]} failed: {e}")
            db_patch("stagings", {"id": st["id"]}, {"status": "failed", "error": "Staging didn't work this time. Try again."})


def main():
    missing = [n for n, v in (("SUPABASE_URL", SB), ("SUPABASE_SERVICE_ROLE_KEY", KEY), ("FAL_KEY", FAL)) if not v]
    if missing:
        sys.exit("Missing environment variables: " + ", ".join(missing))
    log(f"worker up · model {MODEL} · polling every {POLL}s")
    while True:
        for step in (step_queued, step_redo, step_poll, step_to_review, step_stagings, step_render):
            try:
                step()
            except Exception as e:
                log(f"{step.__name__} error: {e}")
        time.sleep(POLL)


if __name__ == "__main__":
    main()
