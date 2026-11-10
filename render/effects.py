"""Per-photo effects (the Rendy-style effect library) and centered vertical framing.

An effect turns one listing photo into a Kling request:
  * "edit" effects first AI-edit the photo into a second image (an under-construction, empty-to-staged or
    dusk version), then ask Kling to animate between the two, so the clip *transforms* on screen.
  * "motion" effects only change the camera prompt (water, fire, drone reveal).

make_vertical() extends a landscape photo upward and downward with AI so a 9:16 clip shows the whole
room, centered, instead of a narrow strip.
"""
import base64, io, os, time
import requests
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

FAL = os.environ.get("FAL_KEY", "")
EDIT_MODEL = "fal-ai/nano-banana/edit"

# id -> what the realtor sees in the app; keep in sync with web/src/lib/config.ts EFFECTS
EFFECTS = {
    "none":    "Camera move only",
    "build":   "Construction build-up",
    "staging": "Virtual staging",
    "dusk":    "Day to dusk",
    "water":   "Moving water",
    "fire":    "Fireplace glow",
    "reveal":  "Drone reveal",
    "frames":  "Start & end frame",
}

KEEP = (" Keep the exact same camera position, angle, lens, framing, lighting and surroundings."
        " Photorealistic real estate photo, no people, no text.")

def kind_of(shot, index):
    """'aerial', 'exterior' or 'interior' from the realtor's room label."""
    t = f"{shot.get('label') or ''} {shot.get('sub') or ''}".lower()
    if "aerial" in t or "drone" in t: return "aerial"
    if any(w in t for w in ("exterior", "front", "yard", "pool", "patio", "back", "street", "curb", "lot", "outside")):
        return "exterior"
    if index == 0 and not t.strip(): return "exterior"
    return "interior"

# ------------------------------------------------------------------ prompts
STAGE_EDIT = {
    "aerial": ("Show this exact aerial view at the start of construction: the house is not built yet, just a graded dirt "
               "lot with a fresh concrete foundation slab, stacked lumber and pallets of materials. Streets and neighbors unchanged."),
    "exterior": ("Show this exact view of the house mid-construction: bare wooden wall framing and roof trusses standing on "
                 "the concrete slab, no siding or stucco, no roof shingles, no windows, no doors, raw dirt, lumber piles."),
    "interior": ("Show this exact room under construction: exposed wooden wall studs, bare concrete floor, no flooring, "
                 "no cabinets, no countertops, no fixtures, no appliances, no light fixtures, a few sawhorses."),
}
BUILD_MOTION = {
    "aerial": ("Fast-motion construction time-lapse seen from a drone: the house builds itself in seconds on the lot. "
               "Framing shoots up from the slab, walls and roof panels fly in and snap into place, shingles roll across the "
               "roof, siding sweeps over the walls, the lawn and driveway appear, dust swirls. Ends exactly on the finished house."),
    "exterior": ("Fast-motion construction time-lapse: the house builds itself in seconds. Walls close in over the framing, "
                 "roof panels slam into place, windows and doors fly in, siding sweeps across, the driveway pours and the lawn "
                 "rolls out, dust swirls. The camera rises slowly. Ends exactly on the finished house."),
    "interior": ("Fast-motion construction time-lapse: the room builds and finishes itself in seconds. Drywall panels fly onto "
                 "the studs, paint sweeps across, the floor slides into place piece by piece, cabinets, counters, fixtures and "
                 "lights assemble themselves, dust settles. The camera pushes forward smoothly. Ends exactly on the finished room."),
}
STAGING_EDIT = ("Virtually stage this exact room with tasteful modern furniture and decor that suits the room type "
                "(sofa, rug, coffee table and art for a living room; bed, nightstands and lamps for a bedroom; table and chairs "
                "for a dining area; stools at an island). Do not change walls, floors, windows, doors, fixtures or lighting.")
STAGING_MOTION = ("The camera glides slowly forward through the empty room while the furniture magically assembles itself and "
                  "slides into place piece by piece, rug unrolls, cushions settle. Ends exactly on the fully staged room. Photorealistic.")
DUSK_EDIT = ("Turn this exact photo into a twilight (dusk) photo: deep blue sky with a warm sunset glow on the horizon, every "
             "interior light and exterior fixture switched on with a warm glow from the windows, landscape lights on. "
             "Do not change the house, landscaping or anything else.")
DUSK_MOTION = ("Time-lapse from day to dusk: the sky slowly darkens to a deep blue twilight, warm lights flicker on in every "
               "window and fixture one by one. The camera drifts forward slowly. Ends exactly on the dusk photo. Photorealistic.")
MOTION_ONLY = {
    "water": ("Cinematic real estate video. The water in the pool, spa, fountain or view gently ripples and shimmers with "
              "realistic moving reflections and light caustics, a soft breeze. The camera drifts slowly forward. Nothing else changes."),
    "fire": ("Cinematic real estate video. A warm, realistic fire burns and flickers in the fireplace or fire pit, casting a soft "
             "moving glow on nearby walls. The camera drifts slowly forward. Nothing else in the room changes."),
    "reveal": ("Cinematic drone shot: the camera starts close and flies smoothly backward and upward, revealing the whole property "
               "and its surroundings. Continuous, stable, photorealistic."),
}
FRAMES_MOTION = ("A smooth, continuous real estate walkthrough shot: the camera physically travels through the home from the "
                 "first view to the second view, as if gliding between the rooms, with natural parallax and steady motion. "
                 "It ends exactly on the second view. Photorealistic, stable, one continuous take, no cuts, no morphing.")
NEG_FRAMES = "cut, jump cut, morphing, warping, melting walls, people, text, watermark, blur, low quality"
NEG_FX = "people, workers, hands, text, watermark, warping, melting, morphing walls, blur, low quality, cartoon"

# ------------------------------------------------------------------ fal helpers
def _h(): return {"Authorization": f"Key {FAL}", "Content-Type": "application/json"}

def data_uri(path, max_side=2048, fmt="JPEG"):
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, fmt, quality=92)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(buf.getvalue()).decode()

def png_uri(im):
    buf = io.BytesIO(); im.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

def run(model, body, timeout=240):
    """Submit to the fal queue and wait for the result (image edits take ~10-30 s)."""
    r = requests.post(f"https://queue.fal.run/{model}", json=body, headers=_h(), timeout=120); r.raise_for_status()
    q = r.json(); t0 = time.time()
    while time.time() - t0 < timeout:
        st = requests.get(q["status_url"], headers=_h(), timeout=60).json().get("status")
        if st == "COMPLETED":
            return requests.get(q["response_url"], headers=_h(), timeout=60).json()
        time.sleep(3)
    raise RuntimeError(f"{model} timed out")

def fetch(url, dest):
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for c in r.iter_content(1 << 20): f.write(c)
    return dest

def edit(src, prompt, dest):
    res = run(EDIT_MODEL, {"prompt": prompt, "image_urls": [data_uri(src)], "num_images": 1, "output_format": "jpeg"})
    return fetch(res["images"][0]["url"], dest)

# ------------------------------------------------------------------ centered vertical
EXPAND_MODEL = "fal-ai/bria/expand"

def make_vertical(src, kind, dest):
    """Landscape photo -> centered 9:16 image. The photo keeps 76% of the frame height (its sides trimmed a little)
    and Bria Expand, a model built for outpainting, adds sky or ceiling above and floor or lawn below.
    Falls back to a plain center crop if the expansion fails."""
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    W2, H2 = 1080, 1920
    if im.height >= im.width:                                     # already portrait
        ImageOps.fit(im, (W2, H2), Image.LANCZOS).save(dest, quality=93); return dest
    ph = int(H2 * 0.76); s = ph / im.height
    big = im.resize((round(im.width * s), ph), Image.LANCZOS)
    x0 = max(0, (big.width - W2) // 2); mid = big.crop((x0, 0, x0 + W2, ph))
    tmp = dest + ".mid.jpg"; mid.save(tmp, quality=94)
    try:
        res = run(EXPAND_MODEL, {"image_url": data_uri(tmp), "canvas_size": [W2, H2],
                                 "original_image_size": [W2, ph], "original_image_location": [0, (H2 - ph) // 2]})
        fetch(res["image"]["url"], dest)
        Image.open(dest).convert("RGB").resize((W2, H2)).save(dest, quality=93)
    except Exception:
        ImageOps.fit(im, (W2, H2), Image.LANCZOS).save(dest, quality=93)
    return dest

# ------------------------------------------------------------------ build the Kling request
def kling_body(effect, kind, src, tmpdir, base_prompt, stage_style="modern", stage_room="auto", end_src=None):
    """Returns (body, extra_image_path or None). src is the (already vertical, if needed) photo.
    end_src: the end frame for "frames" (already vertical, if needed)."""
    effect = effect if effect in EFFECTS else "none"
    if effect == "frames":
        if not end_src:
            effect = "none"   # no end photo picked: a normal camera move
        else:
            return {"prompt": FRAMES_MOTION, "image_url": data_uri(src), "tail_image_url": data_uri(end_src),
                    "negative_prompt": NEG_FRAMES, "cfg_scale": 0.6}, None
    if effect == "build":
        stage = edit(src, STAGE_EDIT[kind] + KEEP, os.path.join(tmpdir, "fx_stage.jpg"))
        return {"prompt": BUILD_MOTION[kind], "image_url": data_uri(stage), "tail_image_url": data_uri(src),
                "negative_prompt": NEG_FX, "cfg_scale": 0.6}, stage
    if effect == "staging":
        import staging
        staged = edit(src, staging.prompt(stage_style, stage_room), os.path.join(tmpdir, "fx_staged.jpg"))
        return {"prompt": STAGING_MOTION, "image_url": data_uri(src), "tail_image_url": data_uri(staged),
                "negative_prompt": NEG_FX, "cfg_scale": 0.6}, staged
    if effect == "dusk":
        dusk = edit(src, DUSK_EDIT, os.path.join(tmpdir, "fx_dusk.jpg"))
        return {"prompt": DUSK_MOTION, "image_url": data_uri(src), "tail_image_url": data_uri(dusk),
                "negative_prompt": NEG_FX, "cfg_scale": 0.6}, dusk
    if effect in MOTION_ONLY:
        return {"prompt": MOTION_ONLY[effect], "image_url": data_uri(src), "negative_prompt": NEG_FX, "cfg_scale": 0.7}, None
    return {"prompt": base_prompt, "image_url": data_uri(src), "cfg_scale": 0.75}, None
