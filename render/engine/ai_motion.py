#!/usr/bin/env python3
"""
KGB AI Motion: turns listing photos into real-looking camera-move clips with fal.ai,
then hands the clips to render.py for template graphics.

Setup (once, on the laptop):
  pip install fal-client
  Put your fal.ai API key in a file named  fal_key.txt  next to this script
  (or set the FAL_KEY environment variable). Never paste it into chat.

Usage:
  python ai_motion.py job.json            # generate clips -> job_ai.json
  python ai_motion.py job.json --render out.mp4   # generate, then render the video
  python ai_motion.py job.json --dry-run  # show prompts + estimated cost, spend nothing

In job.json each shot may set:
  "move":  "push" | "pull" | "orbit_left" | "orbit_right" | "rise" | "glide" | "auto"
  "ai":    false   -> keep the classic pan/zoom for this shot
Top-level optional:
  "ai_model": fal model id (default below), "ai_seconds": 5
"""
import argparse, json, os, sys, time, urllib.request, subprocess, shutil

DEFAULT_MODEL = "fal-ai/kling-video/v2.5-turbo/pro/image-to-video"
PRICE = {  # USD, from fal.ai model pages (Oct 2026); used only for the estimate
    "fal-ai/kling-video/v2.5-turbo/pro/image-to-video": lambda s: 0.35 + max(0, s - 5) * 0.07,
    "kling/v4/image-to-video": lambda s: 0.235 * s,
}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".mts"}

# Prompts are deliberately conservative: real estate video must not invent or warp anything.
BASE = ("Real estate listing video, photorealistic, steady professional gimbal camera. "
        "The room and all objects stay exactly as in the photo: same layout, walls, windows, furniture, "
        "materials and lighting. No people, no new objects, no text.")
MOVES = {
    "push":        "Slow, smooth dolly push-in toward the center of the scene.",
    "pull":        "Slow, smooth dolly pull-back revealing a little more of the space.",
    "orbit_left":  "Slow, gentle arc move to the left around the scene with subtle parallax.",
    "orbit_right": "Slow, gentle arc move to the right around the scene with subtle parallax.",
    "rise":        "Slow crane move rising upward while tilting slightly down, like a low drone shot.",
    "glide":       "Slow lateral glide from left to right with natural parallax between foreground and background.",
}
# Stronger, more cinematic moves (closer to Pika-style walkthrough footage)
BASE_BOLD = ("Cinematic real estate walkthrough video, photorealistic, smooth stabilized gimbal camera with "
             "clearly visible, continuous camera movement from the first frame to the last. The room's layout, "
             "walls, windows, furniture and materials stay exactly the same. No people, no new objects, no text.")
MOVES_BOLD = {
    "push":        "The camera glides steadily forward deep into the room, walking through the space, strong depth and parallax.",
    "pull":        "The camera moves steadily backward out of the room, revealing the space, strong depth and parallax.",
    "orbit_left":  "The camera travels forward while arcing to the left around the room, strong parallax.",
    "orbit_right": "The camera travels forward while arcing to the right around the room, strong parallax.",
    "rise":        "Drone shot: the camera flies forward toward the house while rising, smooth and continuous.",
    "glide":       "The camera tracks sideways from left to right across the scene with strong parallax between foreground and background.",
}

KEYWORDS = [  # label keyword -> default move
    (("front", "exterior", "curb", "aerial", "drone", "street", "facade", "elevation"), "rise"),
    (("pool", "yard", "patio", "backyard", "view", "outdoor", "deck", "garden"), "push"),  # forward move, not side-to-side
    (("kitchen", "island", "dining"), "push"),  # arcs reveal off-frame areas -> invented objects
    (("living", "family", "great room", "den"), "push"),
    (("bed", "suite", "primary", "master"), "orbit_left"),
    (("bath", "shower", "tub", "closet", "laundry"), "push"),
]
NEGATIVE = ("warping, morphing walls, bending lines, new windows, new doors, extra furniture, "
            "people, text, watermark, blur, distortion, flicker, low quality")

def pick_move(shot, i):
    m = (shot.get("move") or "auto").lower()
    if m in MOVES: return m
    label = (shot.get("label", "") + " " + shot.get("sub", "")).lower()
    if i == 0 and not label.strip(): return "rise"
    for words, mv in KEYWORDS:
        if any(w in label for w in words): return mv
    return ["push", "glide", "orbit_right", "pull", "orbit_left"][i % 5]

def load_key(here):
    k = os.environ.get("FAL_KEY")
    for p in (os.path.join(here, "fal_key.txt"), os.path.join(os.path.dirname(here), "fal_key.txt")):
        if not k and os.path.exists(p):
            k = open(p).read().strip()
    if not k:
        sys.exit("No fal.ai key found. Create fal_key.txt next to ai_motion.py containing your key.")
    os.environ["FAL_KEY"] = k

def data_uri(path, max_side=2048):
    """Send the photo inline (base64) instead of using fal's upload service."""
    import base64, io
    from PIL import Image, ImageOps
    try:
        import pillow_heif; pillow_heif.register_heif_opener()
    except Exception:
        pass
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=90)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

def end_frame_uri(path, move, max_side=2048):
    """Build a target last frame (a crop of the same photo) so the model is forced to
    travel to it: center crop = push-in, offset crop = glide/arc. Nothing new is invented
    because the destination is already in the photo."""
    import base64, io
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    w, h = im.size
    z = 0.68 if move in ("push", "rise", "orbit_left", "orbit_right") else 0.82
    cw, ch = w * z, h * z
    cx = {"orbit_left": 0.40, "orbit_right": 0.60, "glide": 0.62}.get(move, 0.5) * w
    cy = (0.42 if move == "rise" else 0.5) * h
    x0 = max(0, min(w - cw, cx - cw / 2)); y0 = max(0, min(h - ch, cy - ch / 2))
    crop = im.crop((x0, y0, x0 + cw, y0 + ch)).resize((w, h), Image.LANCZOS)
    if move == "pull":  # pull-back: start is the crop, so swap roles by returning the full frame
        crop = im
    crop.thumbnail((max_side, max_side), Image.LANCZOS)
    buf = io.BytesIO(); crop.save(buf, "JPEG", quality=92)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

def download(url, dest):
    with urllib.request.urlopen(url, timeout=300) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("job"); ap.add_argument("--render"); ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", help="comma list of shot numbers (1-based) to (re)generate")
    a = ap.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    base = os.path.dirname(os.path.abspath(a.job))
    job = json.load(open(a.job))
    model = job.get("ai_model", DEFAULT_MODEL)
    secs = int(job.get("ai_seconds", 5))
    only = {int(x) for x in a.only.split(",")} if a.only else None
    outdir = os.path.join(base, "ai_clips"); os.makedirs(outdir, exist_ok=True)

    todo = []
    for i, s in enumerate(job["shots"]):
        ext = os.path.splitext(s["path"])[1].lower()
        if ext in VIDEO_EXT or s.get("ai") is False: continue
        if only and (i + 1) not in only: continue
        mv = pick_move(s, i)
        todo.append((i, s, mv, f"{BASE} {MOVES[mv]}"))

    cost = sum(PRICE.get(model, lambda s: 0.0)(secs) for _ in todo)
    print(f"Model: {model}   clips: {len(todo)} x {secs}s   est. cost: ${cost:.2f}")
    for i, s, mv, p in todo:
        print(f"  shot {i+1:>2} [{mv:<11}] {s.get('label') or '(title shot)'}")
    if a.dry_run: return

    load_key(here)
    import fal_client
    from concurrent.futures import ThreadPoolExecutor

    def gen(item):
        i, s, mv, prompt = item
        dest = os.path.join(outdir, f"shot{i+1:02d}_{mv}.mp4")
        if os.path.exists(dest) and not only:
            return i, dest, "cached"
        img_url = data_uri(os.path.join(base, s["path"]))
        args = {"prompt": prompt, "duration": str(secs), "negative_prompt": NEGATIVE, "cfg_scale": 0.6}
        if model.startswith("kling/v4"):
            args = {"prompt": prompt, "duration": secs, "start_image_url": img_url, "resolution": "1080p"}
        else:
            args["image_url"] = img_url
        for attempt in range(3):
            try:
                res = fal_client.subscribe(model, arguments=args)
                download(res["video"]["url"], dest)
                return i, dest, "ok"
            except Exception as e:
                err = e; time.sleep(5 * (attempt + 1))
        return i, None, f"failed: {err}"

    with ThreadPoolExecutor(max_workers=4) as ex:
        for i, dest, status in ex.map(gen, todo):
            print(f"  shot {i+1:>2}: {status}")
            if dest:
                job["shots"][i]["original_photo"] = job["shots"][i]["path"]
                job["shots"][i]["path"] = os.path.relpath(dest, base)
                job["shots"][i].setdefault("duration", min(secs, 4.6))

    # keep already-generated clips for shots skipped by --only
    for i, s in enumerate(job["shots"]):
        if s["path"].lower().endswith(tuple(VIDEO_EXT)): continue
        for f in sorted(os.listdir(outdir)):
            if f.startswith(f"shot{i+1:02d}_"):
                s["original_photo"] = s["path"]; s["path"] = os.path.join("ai_clips", f)
                s.setdefault("duration", min(secs, 4.6))

    out_job = os.path.join(base, os.path.splitext(os.path.basename(a.job))[0] + "_ai.json")
    json.dump(job, open(out_job, "w"), indent=2)
    print("Wrote", out_job)
    if a.render:
        subprocess.check_call([sys.executable, os.path.join(here, "render.py"), out_job, a.render])
        print("Rendered", a.render)

if __name__ == "__main__":
    main()
