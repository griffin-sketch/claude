"""Auto-trim: find where an AI clip stops showing the room and starts pushing into dead space
(a closet door, a blank wall, a close-up of a toilet) or starts showing surroundings the AI made up, so the edit cuts the clip there instead of
playing it out. Griffin's rule, from his own edit of 516 W Main St: keep the start, cut the end
once the camera has zoomed into something with nothing to show.

Uses a small Claude vision call per clip (one contact sheet of the clip's frames, ~a tenth of a cent).
No ANTHROPIC_API_KEY = no trimming; the video builds exactly as before."""
import base64, io, json, os, re, subprocess

from PIL import Image, ImageDraw

KEY = os.environ.get("ANTHROPIC_API_KEY") or next((v for k, v in os.environ.items() if k.upper() == "ANTHROPIC_API_KEY"), "")
MODEL = os.environ.get("TRIM_MODEL", "claude-haiku-5-5")
STEP = 0.5          # seconds between sampled frames
MIN_KEEP = 1.5      # never cut a clip shorter than this

PROMPT = """These are frames from one AI-generated real estate walkthrough clip, in order, labeled with the time in seconds.
The camera moves through the room. Near the end, these clips often push into "dead space": the frame fills up with something
that shows the buyer nothing, like closet doors, a blank wall, a ceiling, the side of a cabinet, or a close-up of a toilet.
A video editor cuts the clip at the last moment the shot still shows the room well, before it gets lost in dead space.

Examples of how the editor cut real clips:
- Bedroom, camera pushed toward the closet: cut at 2.3 s, before the closet doors filled the frame.
- Bathroom, camera pushed into the toilet and wall: cut at 1.5 s.
- Bedroom, camera drifted toward a bare corner: cut at 2.7 s.
- Living rooms, kitchens and baths where the camera kept showing furniture, windows and finishes to the end: not cut.

Also cut when the camera starts showing made-up surroundings: the first frame is the real listing photo, so anything
the camera reveals later that was not in it (new houses, trees, streets, rooms or furniture the AI invented, warped
or melting shapes) looks fake. Cut at the last moment before the invented part becomes noticeable.
- Front exterior, camera moved and revealed surroundings that do not match the real street: cut at 3.1 s.

Only cut when the end really is dead space or invented. A shot that ends closer but still on something worth seeing (a fireplace,
a vanity, a view, a kitchen island) is not cut. Text over the picture is not part of the room; ignore it.

Answer with JSON only: {"keep_until": <seconds, or null to keep the whole clip>, "why": "<a few words>"}"""


def _frames(path, dur):
    times = [round(t * STEP, 2) for t in range(int(dur / STEP) + 1) if t * STEP <= dur - 0.05]
    out = []
    for t in times:
        r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", path, "-frames:v", "1",
                            "-vf", "scale=360:-2", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True)
        if r.stdout:
            out.append((t, Image.open(io.BytesIO(r.stdout)).convert("RGB")))
    return out


def _sheet(frames):
    cols = 5
    w, h = frames[0][1].size
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * (h + 26)), "white")
    d = ImageDraw.Draw(sheet)
    for i, (t, im) in enumerate(frames):
        x, y = (i % cols) * w, (i // cols) * (h + 26)
        d.text((x + 6, y + 6), f"{t:.1f} s", fill="black")
        sheet.paste(im, (x, y + 26))
    buf = io.BytesIO(); sheet.save(buf, "JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode()


def keep_until(path, dur, label="", session=None):
    """Seconds of the clip worth showing, or None to keep it all (also on any error)."""
    if not KEY:
        print("  trim check off: no ANTHROPIC_API_KEY on the worker", flush=True)
        return None
    if dur <= MIN_KEEP + 0.3:
        return None
    try:
        import requests
        frames = _frames(path, dur)
        if len(frames) < 3:
            return None
        body = {"model": MODEL, "max_tokens": 120, "messages": [{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": _sheet(frames)}},
            {"type": "text", "text": (f"Room: {label}\n" if label else "") + PROMPT}]}]}
        r = (session or requests).post("https://api.anthropic.com/v1/messages", json=body, timeout=60, headers={
            "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        r.raise_for_status()
        text = "".join(c.get("text", "") for c in r.json().get("content", []))
        m = re.search(r"\{.*\}", text, re.S)
        ans = json.loads(m.group(0)) if m else {}
        k = ans.get("keep_until")
        print(f"  trim check {label or 'clip'}: keep_until={k} ({ans.get('why', '')})", flush=True)
        if k is None:
            return None
        k = float(k)
        if k >= dur - 0.4:
            return None
        return max(MIN_KEEP, k)
    except Exception as e:
        print(f"  trim check skipped: {e}", flush=True)
        return None
