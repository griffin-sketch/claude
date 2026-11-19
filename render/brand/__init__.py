"""Tourvo co-branding for free promo videos: the Tourvo logo + @gettourvo in the corner during the tour
(not over the realtor's own outro card), then the Tourvo end card.

Only listings owned by the accounts in BRAND_USERS get it (by default Griffin's own account, which makes the
free videos for realtors in exchange for the branding). Customers' videos are never touched."""
import json, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
BRAND_USERS = {u.strip() for u in os.environ.get("BRAND_USERS", "91ebe364-2cdc-46b5-a0f0-1a9d98e560f6").split(",") if u.strip()}
CARD_SECONDS = 5.0   # Tourvo end card
XFADE = 0.5          # crossfade from the video into the card
BUG_START, BUG_IN = 0.4, 0.6


def wanted(listing):
    """The free first video is always branded. Otherwise the listing's own switch wins (set on the admin page),
    then only the owner's promo listings."""
    if listing.get("paid_via") == "trial":
        return True
    if listing.get("tourvo_branding") is not None:
        return bool(listing["tourvo_branding"])
    return listing.get("user_id") in BRAND_USERS


def _probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path],
                       capture_output=True, text=True, check=True)
    j = json.loads(r.stdout)
    v = next(s for s in j["streams"] if s["codec_type"] == "video")
    num, den = v["r_frame_rate"].split("/")
    return (int(v["width"]), int(v["height"]), float(num) / float(den), float(j["format"]["duration"]),
            any(s["codec_type"] == "audio" for s in j["streams"]))


def apply(src, dst, hide_last=0.0):
    """Write the branded copy of `src` to `dst`. `hide_last`: seconds at the end (the realtor's outro) without the corner logo."""
    w, h, fps, dur, has_audio = _probe(src)
    kind = "vertical" if h > w else "wide"
    bug = os.path.join(HERE, kind, "bug.png")
    card = os.path.join(HERE, kind, "end_card.mp4")
    total = dur + CARD_SECONDS - XFADE
    bug_end = max(BUG_START + BUG_IN, dur - hide_last)
    fc = [
        f"[1:v]scale={w}:{h},format=rgba,fade=t=in:st={BUG_START}:d={BUG_IN}:alpha=1[bug]",
        f"[0:v]fps={fps:.3f},format=yuv420p[base]",
        f"[base][bug]overlay=0:0:enable='lt(t,{bug_end:.3f})':format=auto,format=yuv420p,settb=AVTB[vid]",
        f"[2:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={fps:.3f},format=yuv420p,settb=AVTB[card]",
        f"[vid][card]xfade=transition=fade:duration={XFADE}:offset={dur - XFADE:.3f}[v]",
    ]
    maps = ["-map", "[v]"]
    if has_audio:   # the realtor's music carries into the card and fades out by the end
        fc.append(f"[0:a]apad,atrim=0:{total:.3f},afade=t=out:st={max(0, total - 3):.3f}:d=3[a]")
        maps += ["-map", "[a]"]
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", src, "-loop", "1", "-t", f"{dur:.3f}", "-i", bug, "-i", card,
           "-filter_complex", ";".join(fc), *maps,
           # same playback-friendly settings as the main render: capped bitrate so phones never stutter
           "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-maxrate", "5M", "-bufsize", "10M",
           "-profile:v", "high", "-pix_fmt", "yuv420p", "-threads", "2", "-movflags", "+faststart"]
    if has_audio:
        cmd += ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
    cmd += ["-t", f"{total:.3f}", dst]
    subprocess.run(cmd, check=True)
    return dst
