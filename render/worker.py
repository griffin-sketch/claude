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

SB = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
FAL = os.environ.get("FAL_KEY", "")
POLL = int(os.environ.get("POLL_SECONDS", "10"))
MODEL = os.environ.get("FAL_MODEL", am.DEFAULT_MODEL)
MAX_ATTEMPTS = 3
CLIP_SECONDS = 5

S = requests.Session()
S.headers.update({"apikey": KEY, "Authorization": f"Bearer {KEY}"})


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


def submit_clip(shot, index, user_id):
    """Download the photo, send it to fal.ai, and mark the shot as generating."""
    with tempfile.TemporaryDirectory() as tmp:
        src = storage_get("photos", shot["photo_path"], os.path.join(tmp, "photo" + os.path.splitext(shot["photo_path"])[1]))
        mv = am.pick_move({"label": shot["label"], "sub": shot["sub"], "move": shot.get("move") or "auto"}, index)
        prompt = f"{am.BASE_BOLD} {am.MOVES_BOLD[mv]}"
        body = {"prompt": prompt, "image_url": am.data_uri(src), "duration": str(CLIP_SECONDS),
                "negative_prompt": am.NEGATIVE, "cfg_scale": 0.75}
        r = fal_call(f"https://queue.fal.run/{MODEL}", body)
    db_patch("shots", {"id": shot["id"]}, {
        "clip_status": "generating", "move": mv, "fal_status_url": r["status_url"],
        "fal_response_url": r["response_url"], "clip_attempts": (shot.get("clip_attempts") or 0) + 1,
        "approved": False, "error": None,
    })
    log(f"  shot {index + 1}: submitted [{mv}]")


# ------------------------------------------------------------------ steps
def step_queued():
    for l in db_get("listings", status="eq.queued", order="created_at"):
        log(f"listing {l['id'][:8]} queued -> generating")
        shots = db_get("shots", listing_id=f"eq.{l['id']}", order="position")
        try:
            for i, s in enumerate(shots):
                if s["clip_status"] in ("none", "failed", "queued"):
                    submit_clip(s, i, l["user_id"])
            db_patch("listings", {"id": l["id"]}, {"status": "generating", "error": None})
        except Exception as e:
            log("  submit failed:", e)
            db_patch("listings", {"id": l["id"]}, {"status": "failed", "error": f"Could not start clips: {e}"[:400]})


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
            submit_clip(s, idx, l[0]["user_id"])
        except Exception as e:
            db_patch("shots", {"id": s["id"]}, {"clip_status": "failed", "error": str(e)[:400]})


def step_poll():
    for s in db_get("shots", clip_status="eq.generating"):
        try:
            st = fal_call(s["fal_status_url"]).get("status")
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
            res = fal_call(s["fal_response_url"])
            url = (res.get("video") or {}).get("url")
            if not url:
                raise RuntimeError(res.get("detail") or "fal.ai returned no video")
            with tempfile.TemporaryDirectory() as tmp:
                dest = os.path.join(tmp, "clip.mp4")
                with requests.get(url, stream=True, timeout=300) as r:
                    r.raise_for_status()
                    with open(dest, "wb") as f:
                        for chunk in r.iter_content(1 << 20):
                            f.write(chunk)
                path = f"{user_id}/{s['listing_id']}/{s['id']}-{s.get('clip_attempts') or 1}.mp4"
                storage_put("clips", path, dest)
            db_patch("shots", {"id": s["id"]}, {"clip_status": "ready", "clip_path": path, "error": None})
            log(f"  shot {s['position'] + 1} of {s['listing_id'][:8]}: ready")
        except Exception as e:
            log(f"  shot {s['position'] + 1}: result failed: {e}")
            if (s.get("clip_attempts") or 0) < MAX_ATTEMPTS:
                db_patch("shots", {"id": s["id"]}, {"clip_status": "redo", "error": str(e)[:400]})
            else:
                db_patch("shots", {"id": s["id"]}, {"clip_status": "failed", "error": str(e)[:400]})


def step_to_review():
    for l in db_get("listings", status="eq.generating"):
        shots = db_get("shots", listing_id=f"eq.{l['id']}")
        states = {s["clip_status"] for s in shots}
        if states & {"queued", "generating", "redo", "none"}:
            continue
        if states == {"failed"}:
            db_patch("listings", {"id": l["id"]}, {"status": "failed", "error": "No clips could be made. Try different photos."})
        else:
            db_patch("listings", {"id": l["id"]}, {"status": "review"})
            log(f"listing {l['id'][:8]} -> review")


def step_render():
    for l in db_get("listings", status="eq.rendering", order="updated_at"):
        log(f"listing {l['id'][:8]} rendering {l['formats']}")
        try:
            render_listing(l)
            db_patch("listings", {"id": l["id"]}, {"status": "done", "error": None})
            log(f"listing {l['id'][:8]} -> done")
        except Exception as e:
            traceback.print_exc()
            db_patch("listings", {"id": l["id"]}, {"status": "failed", "error": f"Video build failed: {e}"[:400]})


def render_listing(l):
    shots = db_get("shots", listing_id=f"eq.{l['id']}", order="position")
    prof = (db_get("profiles", id=f"eq.{l['user_id']}") or [{}])[0]
    with tempfile.TemporaryDirectory() as tmp:
        media = os.path.join(tmp, "media"); os.makedirs(media)
        job_shots = []
        for s in shots:
            if s["clip_status"] == "ready" and s.get("clip_path"):
                p = storage_get("clips", s["clip_path"], os.path.join(media, f"{s['id']}.mp4"))
                job_shots.append({"path": os.path.relpath(p, tmp), "label": s["label"], "sub": s["sub"], "duration": 4.6})
            else:  # clip failed: fall back to classic pan/zoom on the photo
                ext = os.path.splitext(s["photo_path"])[1] or ".jpg"
                p = storage_get("photos", s["photo_path"], os.path.join(media, f"{s['id']}{ext}"))
                job_shots.append({"path": os.path.relpath(p, tmp), "label": s["label"], "sub": s["sub"]})
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
        if outro == "branded" and not (agent["name"] or agent["phone"]):
            outro = "simple"   # no branding saved yet
        job = {
            "template": l["template"], "transition": l.get("transition") or "crossfade", "kicker": l["kicker"] or "NOW AVAILABLE", "headline": l["headline"] or "",
            "address": l["address"], "city_line": l["city_line"],
            "stats": {"beds": l.get("beds"), "baths": l.get("baths"), "sqft": l.get("sqft"),
                      "acres": l.get("acres"), "price": l.get("price")},
            "shots": job_shots, "agent": agent, "outro": outro, "music": None,
        }
        job_path = os.path.join(tmp, "job.json")
        json.dump(job, open(job_path, "w"))
        made = []
        for fmt in l["formats"] or ["16:9"]:
            out = os.path.join(tmp, f"out-{fmt.replace(':', 'x')}.mp4")
            engine.render(job_path, out, fmt=fmt)
            path = f"{l['user_id']}/{l['id']}/{fmt.replace(':', 'x')}.mp4"
            storage_put("videos", path, out)
            made.append({"listing_id": l["id"], "format": fmt, "video_path": path})
        db_delete("renders", {"listing_id": l["id"]})
        db_insert("renders", made)


def main():
    missing = [n for n, v in (("SUPABASE_URL", SB), ("SUPABASE_SERVICE_ROLE_KEY", KEY), ("FAL_KEY", FAL)) if not v]
    if missing:
        sys.exit("Missing environment variables: " + ", ".join(missing))
    log(f"worker up · model {MODEL} · polling every {POLL}s")
    while True:
        for step in (step_queued, step_redo, step_poll, step_to_review, step_render):
            try:
                step()
            except Exception as e:
                log(f"{step.__name__} error: {e}")
        time.sleep(POLL)


if __name__ == "__main__":
    main()
