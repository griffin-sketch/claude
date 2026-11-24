#!/usr/bin/env python3
"""
KGB Listing Video Engine
Renders a 16:9 1080p listing video from a job.json:

{
  "template": 1,                      # 1-10
  "kicker": "NOW AVAILABLE",          # top line on the title card (e.g. gated community name)
  "headline": "4 Bed Modern Farmhouse",   # optional; defaults to street address
  "address": "1234 Oak Hollow Dr",
  "city_line": "Austin, TX 78704",
  "stats": {"beds": 4, "baths": 3.5, "sqft": 2850, "acres": null, "price": "$875,000"},
  "shots": [{"path": "media/01.jpg", "label": "Chef's Kitchen", "sub": "Quartz island"}, ...],
  "agent": {"name": "...", "title": "...", "brokerage": "...", "phone": "...",
            "email": "...", "headshot": "media/headshot.jpg", "logo": "media/logo.png"},
  "outro": "branded" | "simple" | "none",
  "outro_kicker": "SCHEDULE YOUR SHOWING",
  "music": "media/track.mp3" | null
}

Usage: python3 render.py job.json out.mp4 [--stills DIR]
Paths in the job are relative to the job file's folder.
"""
import json, math, os, subprocess, sys, argparse, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps, ImageChops, ImageEnhance

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass

W, H, FPS = 1920, 1080, 30
VERTICAL = False

def set_format(fmt):
    """'16:9' (default, 1920x1080) or '9:16' (1080x1920 for Reels/TikTok/Shorts)."""
    global W, H, VERTICAL
    VERTICAL = fmt in ("9:16", "vertical", "reels")
    W, H = (1080, 1920) if VERTICAL else (1920, 1080)

def MW(px):
    """Max text width: the 16:9 design value, capped to the frame with side margins."""
    return min(px, W - 180) if VERTICAL else px

def BOT(px):
    """Bottom margin. On vertical, lift labels above the Reels/TikTok caption + button zone."""
    return px + 380 if VERTICAL else px
XF = 0.6            # overlap between shots, seconds (set per job by set_transition)
TRANSITION = "crossfade"

# Transition styles. overlap = seconds two shots share; ramp = speed-ramp length at each cut.
TRANSITIONS = {
    "crossfade":  dict(overlap=0.6,  ramp=0.0,  peak=1.0),   # soft dissolve (original look)
    "speed_ramp": dict(overlap=0.14, ramp=0.5,  peak=5.0),   # shot speeds up into the cut, next one lands fast then settles
    "flash":      dict(overlap=0.3,  ramp=0.0,  peak=1.0),   # quick dissolve through a soft white bloom
    "cut":        dict(overlap=0.0,  ramp=0.0,  peak=1.0),   # straight cut
}

def set_transition(name):
    global XF, TRANSITION
    TRANSITION = name if name in TRANSITIONS else "crossfade"
    XF = TRANSITIONS[TRANSITION]["overlap"]

def speed_curve(n, ramp_in, ramp_out):
    """Source position (in source frames) for each output frame 0..n, for a shot that
    starts fast and/or ends fast. Middle plays at normal speed."""
    cfg = TRANSITIONS[TRANSITION]
    R = max(1, int(cfg["ramp"] * FPS)); P = cfg["peak"]
    pos = [0.0]
    for k in range(n):
        v = 1.0
        if ramp_in and k < R:
            v = 1 + (P - 1) * (1 - k / R) ** 2
        if ramp_out and k >= n - R:
            v = max(v, 1 + (P - 1) * ((k - (n - R) + 1) / R) ** 2)
        pos.append(pos[-1] + v)
    return pos

def ramp_intensity(k, n, ramp_in, ramp_out):
    """0 in the calm middle of a shot, rising to 1 right at a speed-ramped cut."""
    R = max(1, int(TRANSITIONS[TRANSITION]["ramp"] * FPS))
    i = 0.0
    if ramp_in and k < R: i = max(i, 1 - k / R)
    if ramp_out and k >= n - R: i = max(i, (k - (n - R) + 1) / R)
    return i

def ramp_fx(img, inten):
    """Camera rushing forward: a push-in plus zoom blur, scaled by intensity."""
    if inten <= 0.02: return img
    e = inten ** 2
    z = 1 + 0.16 * e
    acc = None
    for j in range(4):
        zz = z * (1 + 0.025 * e * j)
        cw, ch = W / zz, H / zz
        x0, y0 = (W - cw) / 2, (H - ch) / 2
        a = np.asarray(img.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch)), dtype=np.float32)
        acc = a if acc is None else acc + a
    return Image.fromarray((acc / 4).astype(np.uint8))

def ramp_extra(ramp_in, ramp_out):
    """Extra source frames a ramped shot uses compared to playing at normal speed."""
    cfg = TRANSITIONS[TRANSITION]
    if cfg["ramp"] <= 0: return 0.0
    R = int(cfg["ramp"] * FPS)
    return (int(ramp_in) + int(ramp_out)) * (cfg["peak"] - 1) * R / 3
ANIM = 0.55         # in/out animation seconds
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "fonts")
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".mts"}

# ---------------------------------------------------------------- utilities
_font_cache = {}
def font(name, size):
    key = (name, int(size))
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(os.path.join(FONT_DIR, name + ".woff"), int(size))
    return _font_cache[key]

def hexrgb(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

def ease_out(p): p = max(0.0, min(1.0, p)); return 1 - (1 - p) ** 3
def ease_in(p):  p = max(0.0, min(1.0, p)); return p ** 3
def ease_io(p):
    p = max(0.0, min(1.0, p))
    return 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2

def fmt_num(n):
    if n is None or n == "": return None
    try:
        f = float(str(n).replace(",", ""))
    except ValueError:
        return str(n)
    return f"{int(f):,}" if f == int(f) else f"{f:g}"

def stats_parts(stats, upper=True):
    s = stats or {}
    parts = []
    if s.get("beds"):  parts.append(f"{fmt_num(s['beds'])} Beds")
    if s.get("baths"): parts.append(f"{fmt_num(s['baths'])} Baths")
    if s.get("sqft"):  parts.append(f"{fmt_num(s['sqft'])} Sq Ft")
    if s.get("acres"): parts.append(f"{fmt_num(s['acres'])} Acres")
    if upper: parts = [p.upper() for p in parts]
    return parts

def text_w(txt, f, track=0):
    if not txt: return 0
    if track == 0: return f.getlength(txt)
    return sum(f.getlength(c) for c in txt) + track * (len(txt) - 1)

def fit_font(name, size, txt, maxw, track=0, minsize=18):
    s = size
    while s > minsize and text_w(txt, font(name, s), track) > maxw:
        s -= 2
    return font(name, s)

def wrap(txt, f, maxw, track=0, max_lines=2):
    words, lines, cur = txt.split(), [], ""
    for w_ in words:
        t = (cur + " " + w_).strip()
        if text_w(t, f, track) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur); cur = w_
    if cur: lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines - 1] + [" ".join(lines[max_lines - 1:])]
    return lines

# ---------------------------------------------------------------- sprite builder
class Sprite:
    """A transparent canvas we draw a card / label onto. Shadow is added at the end
    and hugs only the drawn shapes (no band or scrim)."""
    def __init__(self, w, h, pad=40):
        self.pad = pad
        self.w, self.h = int(w), int(h)
        self.img = Image.new("RGBA", (self.w + 2 * pad, self.h + 2 * pad), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def text(self, x, y, txt, f, fill, track=0, anchor="l"):
        """x is left / center / right depending on anchor; y is the top of the cap line."""
        if not txt: return 0
        tw = text_w(txt, f, track)
        if anchor == "c": x = x - tw / 2
        elif anchor == "r": x = x - tw
        x += self.pad; y += self.pad
        asc = f.getmetrics()[0]
        if track == 0:
            self.d.text((x, y + asc), txt, font=f, fill=fill, anchor="ls")
        else:
            for c in txt:
                self.d.text((x, y + asc), c, font=f, fill=fill, anchor="ls")
                x += f.getlength(c) + track
        return tw

    def rect(self, x0, y0, x1, y1, fill, r=0, outline=None, width=1):
        box = [x0 + self.pad, y0 + self.pad, x1 + self.pad, y1 + self.pad]
        if r: self.d.rounded_rectangle(box, r, fill=fill, outline=outline, width=width)
        else: self.d.rectangle(box, fill=fill, outline=outline, width=width)

    def ellipse(self, x0, y0, x1, y1, fill=None, outline=None, width=1):
        self.d.ellipse([x0 + self.pad, y0 + self.pad, x1 + self.pad, y1 + self.pad],
                       fill=fill, outline=outline, width=width)

    def paste(self, im, x, y):
        self.img.alpha_composite(im, (int(x + self.pad), int(y + self.pad)))

    def finish(self, shadow=0.55, blur=7, dy=3, extra_shadow_src=None):
        """Soft drop shadow that hugs the shapes."""
        if shadow <= 0:
            return self.img
        a = self.img.getchannel("A")
        if extra_shadow_src is not None:
            a = extra_shadow_src
        sh = a.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * shadow))
        tight = a.filter(ImageFilter.GaussianBlur(2.2)).point(lambda v: int(v * shadow * 0.55))
        out = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        for m, off in ((sh, dy), (tight, 1)):
            black = Image.new("RGBA", self.img.size, (0, 0, 0, 255))
            black.putalpha(m)
            out.alpha_composite(black, (0, off))
        out.alpha_composite(self.img)
        return out

def circle_photo(path, size, ring=None, ring_w=6):
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGBA")
    im = ImageOps.fit(im, (size, size), Image.LANCZOS, centering=(0.5, 0.35))
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    im.putalpha(m)
    if ring:
        out = Image.new("RGBA", (size + ring_w * 2, size + ring_w * 2), (0, 0, 0, 0))
        big = Image.new("RGBA", ((size + ring_w * 2) * 4,) * 2, (0, 0, 0, 0))
        ImageDraw.Draw(big).ellipse([0, 0, big.width - 1, big.height - 1], fill=ring)
        out.alpha_composite(big.resize(out.size, Image.LANCZOS))
        out.alpha_composite(im, (ring_w, ring_w))
        return out
    return im

def logo_image(path, maxw, maxh):
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGBA")
    im.thumbnail((maxw, maxh), Image.LANCZOS)
    return im

# ---------------------------------------------------------------- elements
class Element:
    """An animated overlay. kind 'sprite' = static image; kind 'glass' = frosted panel
    computed per frame from the footage behind it, with a sprite drawn on top."""
    def __init__(self, sprite, x, y, t_in, t_out, motion="rise", dist=34, glass=None):
        self.sprite, self.x, self.y = sprite, x, y
        self.t_in, self.t_out, self.motion, self.dist = t_in, t_out, motion, dist
        self.glass = glass  # dict(rect=(x0,y0,x1,y1) relative to sprite origin, r, tint, edge, blur)
        self._cache = {}

    def state(self, t):
        if t < self.t_in or (self.t_out is not None and t > self.t_out + ANIM):
            return None
        pin = ease_out((t - self.t_in) / ANIM)
        pout = ease_in((t - self.t_out) / ANIM) if self.t_out is not None and t > self.t_out else 0
        op = min(pin, 1 - pout)
        k = (1 - pin) - pout * 0.6
        dx = dy = 0
        if self.motion == "rise": dy = k * self.dist
        elif self.motion == "left": dx = -k * self.dist * 2.2
        elif self.motion == "right": dx = k * self.dist * 2.2
        elif self.motion == "drop": dy = -k * self.dist
        return op, dx, dy

    def draw(self, frame, t, bg):
        st = self.state(t)
        if not st: return
        op, dx, dy = st
        if op <= 0.003: return
        x, y = int(round(self.x + dx)), int(round(self.y + dy))
        if self.glass:
            draw_glass(frame, bg, x, y, self.glass, op)
        spr = self.sprite
        if op < 0.999:
            key = round(op, 2)
            if key not in self._cache:
                s2 = spr.copy()
                s2.putalpha(spr.getchannel("A").point(lambda v: int(v * key)))
                if len(self._cache) > 64: self._cache.clear()
                self._cache[key] = s2
            spr = self._cache[key]
        frame.alpha_composite(spr, (x, y)) if 0 <= x and 0 <= y and x + spr.width <= W and y + spr.height <= H \
            else paste_clipped(frame, spr, x, y)

def paste_clipped(frame, spr, x, y):
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + spr.width), min(H, y + spr.height)
    if x1 <= x0 or y1 <= y0: return
    frame.alpha_composite(spr.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))

def draw_glass(frame, bg, ox, oy, g, op):
    x0, y0, x1, y1 = g["rect"]
    x0, y0, x1, y1 = int(x0 + ox), int(y0 + oy), int(x1 + ox), int(y1 + oy)
    cx0, cy0, cx1, cy1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if cx1 <= cx0 or cy1 <= cy0: return
    m = g.get("blur", 22)
    region = bg.crop((max(0, cx0 - m), max(0, cy0 - m), min(W, cx1 + m), min(H, cy1 + m)))
    region = region.resize((max(1, region.width // 2), max(1, region.height // 2)), Image.BILINEAR)
    region = region.filter(ImageFilter.GaussianBlur(m / 2)).resize(
        (min(W, cx1 + m) - max(0, cx0 - m), min(H, cy1 + m) - max(0, cy0 - m)), Image.BILINEAR)
    region = region.crop((cx0 - max(0, cx0 - m), cy0 - max(0, cy0 - m),
                          cx0 - max(0, cx0 - m) + (cx1 - cx0), cy0 - max(0, cy0 - m) + (cy1 - cy0))).convert("RGBA")
    if g.get("dim"): region = ImageEnhance.Brightness(region).enhance(g["dim"])
    tint = Image.new("RGBA", region.size, g["tint"])
    region = Image.alpha_composite(region, tint)
    # rounded mask in full panel coords
    mask = Image.new("L", ((x1 - x0) * 2, (y1 - y0) * 2), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, mask.width - 1, mask.height - 1], g["r"] * 2, fill=255)
    mask = mask.resize((x1 - x0, y1 - y0), Image.LANCZOS).crop((cx0 - x0, cy0 - y0, cx1 - x0, cy1 - y0))
    mask = mask.point(lambda v: int(v * op))
    region.putalpha(mask)
    frame.alpha_composite(region, (cx0, cy0))
    if g.get("edge"):
        e = Image.new("RGBA", ((x1 - x0) * 2, (y1 - y0) * 2), (0, 0, 0, 0))
        ImageDraw.Draw(e).rounded_rectangle([1, 1, e.width - 2, e.height - 2], g["r"] * 2,
                                            outline=g["edge"], width=3)
        e = e.resize((x1 - x0, y1 - y0), Image.LANCZOS)
        if op < 1: e.putalpha(e.getchannel("A").point(lambda v: int(v * op)))
        paste_clipped(frame, e, x0, y0)

# ---------------------------------------------------------------- templates
class Template:
    """Base: subclasses build sprites for title card, feature labels and outro."""
    name = "base"
    letterbox = 0
    def __init__(self, job): self.job = job; self.in_outro = False
    def headline(self):
        if self.in_outro and self.job.get("outro_headline"):   # reels can end on a different line (price reveal)
            return self.job["outro_headline"]
        return self.job.get("headline") or self.job.get("address") or ""
    def addr_line(self):
        j = self.job
        if j.get("headline") and j.get("address"):
            return ", ".join([p for p in [j.get("address"), j.get("city_line")] if p])
        return j.get("city_line") or ""
    def price(self): return (self.job.get("stats") or {}).get("price")
    def kicker(self): return self.job.get("kicker") or "NOW AVAILABLE"
    def outro_kicker(self): return self.job.get("outro_kicker") or "SCHEDULE YOUR SHOWING"
    def agent(self): return self.job.get("agent") or {}
    def branded(self): return self.job.get("outro", "branded") == "branded"
    def media(self, key):
        p = self.agent().get(key)
        return p if p and os.path.exists(p) else None

    # returns list of Elements
    def title(self, t0, t1): raise NotImplementedError
    def feature(self, i, n, shot, t0, t1): raise NotImplementedError
    def outro(self, t0): raise NotImplementedError

    # shared helper: centered stacked card
    def centered_stack(self, rows, width=None, gap=18, shadow=0.55, blur=7):
        width = width or MW(1500) + (0 if not VERTICAL else 60)
        """rows: list of ('text', txt, font, fill, track) | ('rule', w, h, fill) | ('gap', px) | ('img', Image)"""
        h = 0
        for r in rows:
            if r[0] == "text": h += r[2].getmetrics()[0] + r[2].getmetrics()[1] // 3 + gap
            elif r[0] == "rule": h += r[2] + gap + 6
            elif r[0] == "gap": h += r[1]
            elif r[0] == "img": h += r[1].height + gap
        sp = Sprite(width, h + 10)
        y = 0
        for r in rows:
            if r[0] == "text":
                _, txt, f, fill, tr = r
                sp.text(width / 2, y, txt, f, fill, tr, anchor="c")
                y += f.getmetrics()[0] + f.getmetrics()[1] // 3 + gap
            elif r[0] == "rule":
                _, rw, rh, fill = r
                y += 3
                sp.rect(width / 2 - rw / 2, y, width / 2 + rw / 2, y + rh, fill)
                y += rh + gap + 3
            elif r[0] == "gap":
                y += r[1]
            elif r[0] == "img":
                sp.paste(r[1], width / 2 - r[1].width / 2, y)
                y += r[1].height + gap
        img = sp.finish(shadow, blur)
        return img, (W - img.width) // 2, (H - img.height) // 2

# ---- 1 · Signature Gold
class T1(Template):
    name = "Signature Gold"
    GOLD = hexrgb("#FAD46C"); WHITE = hexrgb("#FFFFFF")
    def title(self, t0, t1):
        rows = [("text", self.kicker().upper(), font("poppins-600", 30), self.GOLD, 8)]
        for ln in wrap(self.headline(), font("poppins-800", 86), MW(1560)):
            rows.append(("text", ln, fit_font("poppins-800", 86, ln, MW(1560)), self.WHITE, 0))
        rows.append(("rule", 130, 4, self.GOLD))
        st = stats_parts(self.job.get("stats"))
        if st: rows.append(("text", "  ·  ".join(st), font("poppins-600", 32), self.WHITE, 3))
        if self.addr_line(): rows.append(("text", self.addr_line(), font("poppins-500", 30), hexrgb("#FFFFFF", 230), 1))
        if self.price(): rows.append(("text", self.price(), font("poppins-700", 38), self.GOLD, 2))
        img, x, y = self.centered_stack(rows)
        return [Element(img, x, y, t0, t1, "rise")]
    def feature(self, i, n, shot, t0, t1):
        main = (shot.get("label") or "").upper(); sub = (shot.get("sub") or "").upper()
        fm = fit_font("poppins-800", 54, main, MW(1300)); fs = font("poppins-600", 26)
        wm = text_w(main, fm); ws = text_w(sub, fs, 4)
        h = fm.getmetrics()[0] + (fs.getmetrics()[0] + 18 if sub else 6)
        sp = Sprite(max(wm, ws) + 40, h + 8)
        sp.rect(0, 2, 8, h + 4, self.GOLD)
        sp.text(30, 0, main, fm, self.WHITE)
        if sub: sp.text(32, fm.getmetrics()[0] + 14, sub, fs, self.GOLD, 4)
        img = sp.finish()
        return [Element(img, 110 - sp.pad, H - BOT(115) - h - sp.pad, t0, t1, "left" if i % 2 else "rise")]
    def outro(self, t0):
        a = self.agent(); rows = []
        if self.branded() and self.media("headshot"):
            rows.append(("img", circle_photo(self.media("headshot"), 210, self.GOLD, 6)))
            rows.append(("gap", 6))
        rows.append(("text", self.outro_kicker().upper(), font("poppins-600", 30), self.GOLD, 8))
        if self.branded():
            if a.get("name"): rows.append(("text", a["name"], fit_font("poppins-800", 78, a["name"], MW(1500)), self.WHITE, 0))
            rows.append(("rule", 130, 4, self.GOLD))
            if a.get("brokerage"): rows.append(("text", a["brokerage"], font("poppins-500", 32), self.WHITE, 1))
            if a.get("phone"): rows.append(("text", a["phone"], font("poppins-700", 46), self.WHITE, 2))
            if self.media("logo"): rows.append(("gap", 8)); rows.append(("img", logo_chip(self.media("logo"))))
        else:
            rows.append(("text", self.headline(), fit_font("poppins-800", 72, self.headline(), MW(1500)), self.WHITE, 0))
            rows.append(("rule", 130, 4, self.GOLD))
            if self.addr_line(): rows.append(("text", self.addr_line(), font("poppins-500", 30), self.WHITE, 1))
        img, x, y = self.centered_stack(rows)
        return [Element(img, x, y, t0, None, "rise")]

def logo_chip(path, maxw=300, maxh=110, fill=(255, 255, 255, 235), r=14, pad=18):
    lg = logo_image(path, maxw, maxh)
    chip = Image.new("RGBA", (lg.width + pad * 2, lg.height + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(chip).rounded_rectangle([0, 0, chip.width - 1, chip.height - 1], r, fill=fill)
    chip.alpha_composite(lg, (pad, pad))
    return chip

# ---- 2 · Editorial (DM Serif Display + gold hairline)
class T2(Template):
    name = "Editorial"
    GOLD = hexrgb("#D9B97A"); WHITE = hexrgb("#FFFFFF"); SOFT = hexrgb("#FFFFFF", 225)
    def title(self, t0, t1):
        rows = [("text", self.kicker().upper(), font("dmsans-500", 24), self.SOFT, 10), ("gap", 6)]
        for ln in wrap(self.headline(), font("dmserif", 100), MW(1560)):
            rows.append(("text", ln, fit_font("dmserif", 100, ln, MW(1560)), self.WHITE, 0))
        rows.append(("rule", 280, 2, self.GOLD))
        st = stats_parts(self.job.get("stats"))
        if st: rows.append(("text", "   ·   ".join(st), font("dmsans-500", 24), self.WHITE, 7))
        if self.addr_line(): rows.append(("text", self.addr_line(), font("dmsans-400", 28), self.SOFT, 1))
        if self.price(): rows.append(("text", self.price(), font("dmserif-italic", 44), self.GOLD, 0))
        img, x, y = self.centered_stack(rows, gap=20, shadow=0.5, blur=8)
        return [Element(img, x, y, t0, t1, "rise", 26)]
    def feature(self, i, n, shot, t0, t1):
        main = shot.get("label") or ""; sub = (shot.get("sub") or "").upper()
        fm = fit_font("dmserif", 64, main, MW(1300)); fs = font("dmsans-500", 22)
        wm = text_w(main, fm); ws = text_w(sub, fs, 7)
        a = fm.getmetrics()[0]
        h = a + 26 + (fs.getmetrics()[0] if sub else 0)
        sp = Sprite(max(wm, ws, 170) + 20, h + 10)
        sp.text(0, 0, main, fm, self.WHITE)
        sp.rect(2, a + 14, 172, a + 16, self.GOLD)
        if sub: sp.text(2, a + 30, sub, fs, self.WHITE, 7)
        img = sp.finish(0.5, 8)
        return [Element(img, 120 - sp.pad, H - BOT(120) - h - sp.pad, t0, t1, "rise", 24)]
    def outro(self, t0):
        a = self.agent(); rows = []
        if self.branded() and self.media("headshot"):
            rows += [("img", circle_photo(self.media("headshot"), 200, self.GOLD, 3)), ("gap", 4)]
        rows.append(("text", self.outro_kicker().upper(), font("dmsans-500", 24), self.SOFT, 10))
        if self.branded():
            if a.get("name"): rows.append(("text", a["name"], fit_font("dmserif", 90, a["name"], MW(1500)), self.WHITE, 0))
            rows.append(("rule", 260, 2, self.GOLD))
            if a.get("brokerage"): rows.append(("text", a["brokerage"].upper(), font("dmsans-500", 24), self.WHITE, 7))
            if a.get("phone"): rows.append(("text", a["phone"], font("dmserif", 50), self.WHITE, 1))
            if self.media("logo"): rows += [("gap", 8), ("img", logo_chip(self.media("logo")))]
        else:
            rows.append(("text", self.headline(), fit_font("dmserif", 86, self.headline(), MW(1500)), self.WHITE, 0))
            rows.append(("rule", 260, 2, self.GOLD))
            if self.addr_line(): rows.append(("text", self.addr_line(), font("dmsans-400", 28), self.SOFT, 1))
        img, x, y = self.centered_stack(rows, gap=20, shadow=0.5, blur=8)
        return [Element(img, x, y, t0, None, "rise", 26)]

# ---- 3 · Emerald (bold label in a filled rounded pill)
class T3(Template):
    name = "Emerald"
    EM = hexrgb("#1F8A5B"); WHITE = hexrgb("#FFFFFF")
    def pill(self, txt, f, fill, color, track=0, padx=30, h=None):
        tw = text_w(txt, f, track); a, d = f.getmetrics()
        h = h or int(a * 1.0 + 30)
        im = Image.new("RGBA", (int(tw + padx * 2), h), (0, 0, 0, 0))
        sp = Sprite(im.width, h, pad=0)
        sp.rect(0, 0, im.width - 1, h - 1, fill, r=h // 2)
        cap = f.getbbox("H")
        sp.text(padx, (h - (cap[3] - cap[1])) / 2 - cap[1], txt, f, color, track)
        return sp.img
    def title(self, t0, t1):
        rows = [("img", self.pill(self.kicker().upper(), font("poppins-700", 26), self.EM, self.WHITE, 4)), ("gap", 6)]
        for ln in wrap(self.headline(), font("poppins-800", 86), MW(1560)):
            rows.append(("text", ln, fit_font("poppins-800", 86, ln, MW(1560)), self.WHITE, 0))
        st = stats_parts(self.job.get("stats"))
        if st: rows.append(("text", "  •  ".join(st), font("poppins-600", 32), self.WHITE, 2))
        if self.addr_line(): rows.append(("text", self.addr_line(), font("poppins-500", 30), hexrgb("#FFFFFF", 235), 0))
        if self.price(): rows.append(("img", self.pill(self.price(), font("poppins-700", 32), self.WHITE, self.EM, 1)))
        img, x, y = self.centered_stack(rows)
        return [Element(img, x, y, t0, t1, "rise")]
    def feature(self, i, n, shot, t0, t1):
        main = (shot.get("label") or "").upper(); sub = shot.get("sub") or ""
        p1 = self.pill(main, fit_font("poppins-700", 42, main, MW(1300)), self.EM, self.WHITE, 1, 34, 84)
        p2 = self.pill(sub, font("poppins-600", 24), self.WHITE, self.EM, 1, 24, 48) if sub else None
        h = p1.height + (p2.height + 12 if p2 else 0)
        sp = Sprite(max(p1.width, p2.width if p2 else 0), h)
        sp.paste(p1, 0, 0)
        if p2: sp.paste(p2, 8, p1.height + 12)
        img = sp.finish(0.45, 10, 4)
        return [Element(img, 100 - sp.pad, H - BOT(110) - h - sp.pad, t0, t1, "left")]
    def outro(self, t0):
        a = self.agent(); rows = []
        if self.branded() and self.media("headshot"):
            rows += [("img", circle_photo(self.media("headshot"), 200, self.EM, 7)), ("gap", 4)]
        rows.append(("img", self.pill(self.outro_kicker().upper(), font("poppins-700", 26), self.EM, self.WHITE, 4)))
        if self.branded():
            if a.get("name"): rows.append(("text", a["name"], fit_font("poppins-800", 78, a["name"], MW(1500)), self.WHITE, 0))
            if a.get("brokerage"): rows.append(("text", a["brokerage"], font("poppins-500", 32), self.WHITE, 0))
            if a.get("phone"): rows.append(("img", self.pill(a["phone"], font("poppins-700", 38), self.WHITE, self.EM, 1, 34)))
            if self.media("logo"): rows += [("gap", 4), ("img", logo_chip(self.media("logo")))]
        else:
            rows.append(("text", self.headline(), fit_font("poppins-800", 72, self.headline(), MW(1500)), self.WHITE, 0))
            if self.addr_line(): rows.append(("text", self.addr_line(), font("poppins-500", 30), self.WHITE, 0))
        img, x, y = self.centered_stack(rows)
        return [Element(img, x, y, t0, None, "rise")]

# ---- glass helpers (4 · Frosted, 7 · Coastal Glass)
def glass_card(rows, width, padx=70, pady=56, gap=16, align="c"):
    """Build text sprite (no shadow, panel is behind) + glass rect. Returns (sprite, glass_rect)."""
    h = 0
    for r in rows:
        if r[0] == "text": h += r[2].getmetrics()[0] + r[2].getmetrics()[1] // 3 + gap
        elif r[0] == "rule": h += r[2] + gap + 6
        elif r[0] == "img": h += r[1].height + gap
        elif r[0] == "gap": h += r[1]
    h -= gap
    sp = Sprite(width, h + pady * 2, pad=0)
    y = pady
    cx = width / 2
    for r in rows:
        if r[0] == "text":
            _, txt, f, fill, tr = r
            if align == "c": sp.text(cx, y, txt, f, fill, tr, anchor="c")
            else: sp.text(padx, y, txt, f, fill, tr)
            y += f.getmetrics()[0] + f.getmetrics()[1] // 3 + gap
        elif r[0] == "rule":
            _, rw, rh, fill = r
            y += 3
            if align == "c": sp.rect(cx - rw / 2, y, cx + rw / 2, y + rh, fill)
            else: sp.rect(padx, y, padx + rw, y + rh, fill)
            y += rh + gap + 3
        elif r[0] == "img":
            im = r[1]
            sp.paste(im, cx - im.width / 2 if align == "c" else padx, y)
            y += im.height + gap
        elif r[0] == "gap":
            y += r[1]
    # subtle text shadow inside the glass for legibility
    img = sp.img
    a = img.getchannel("A").filter(ImageFilter.GaussianBlur(4)).point(lambda v: int(v * 0.28))
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    blk = Image.new("RGBA", img.size, (0, 0, 0, 255)); blk.putalpha(a)
    out.alpha_composite(blk, (0, 2)); out.alpha_composite(img)
    return out

class T4(Template):
    name = "Frosted"
    WHITE = hexrgb("#FFFFFF"); SOFT = hexrgb("#FFFFFF", 225)
    TINT = (255, 255, 255, 34); EDGE = (255, 255, 255, 110)
    def card(self, rows, width, t0, t1, motion="rise", pos="center", r=30):
        spr = glass_card(rows, width)
        if pos == "center": x, y = (W - spr.width) // 2, (H - spr.height) // 2
        else: x, y = pos
        g = dict(rect=(0, 0, spr.width, spr.height), r=r, tint=self.TINT, edge=self.EDGE, blur=26, dim=0.82)
        return [Element(spr, x, y, t0, t1, motion, 30, glass=g)]
    def title(self, t0, t1):
        rows = [("text", self.kicker().upper(), font("poppins-600", 24), self.SOFT, 8)]
        for ln in wrap(self.headline(), font("poppins-700", 72), MW(1180)):
            rows.append(("text", ln, fit_font("poppins-700", 72, ln, MW(1180)), self.WHITE, 0))
        rows.append(("rule", 90, 3, hexrgb("#FFFFFF", 200)))
        st = stats_parts(self.job.get("stats"))
        if st: rows.append(("text", "  ·  ".join(st), font("poppins-500", 28), self.WHITE, 3))
        if self.addr_line(): rows.append(("text", self.addr_line(), font("poppins-500", 26), self.SOFT, 0))
        if self.price(): rows.append(("text", self.price(), font("poppins-700", 34), self.WHITE, 1))
        return self.card(rows, MW(1320) + (120 if VERTICAL else 0), t0, t1)
    def feature(self, i, n, shot, t0, t1):
        main = shot.get("label") or ""; sub = (shot.get("sub") or "").upper()
        fm = fit_font("poppins-700", 44, main, MW(1100)); fs = font("poppins-500", 22)
        w = max(text_w(main, fm), text_w(sub, fs, 3), 120) + 100
        rows = [("text", main, fm, self.WHITE, 0), ("rule", 56, 3, hexrgb("#FFFFFF", 190))]
        if sub: rows.append(("text", sub, fs, self.SOFT, 3))
        spr = glass_card(rows, w, padx=50, pady=34, gap=12, align="l")
        g = dict(rect=(0, 0, spr.width, spr.height), r=24, tint=self.TINT, edge=self.EDGE, blur=24, dim=0.82)
        return [Element(spr, 100, H - BOT(100) - spr.height, t0, t1, "left", 30, glass=g)]
    def outro(self, t0):
        a = self.agent(); rows = []
        if self.branded() and self.media("headshot"):
            rows += [("img", circle_photo(self.media("headshot"), 180, (255, 255, 255, 200), 4))]
        rows.append(("text", self.outro_kicker().upper(), font("poppins-600", 24), self.SOFT, 8))
        if self.branded():
            if a.get("name"): rows.append(("text", a["name"], fit_font("poppins-700", 70, a["name"], MW(1100)), self.WHITE, 0))
            rows.append(("rule", 90, 3, hexrgb("#FFFFFF", 200)))
            if a.get("brokerage"): rows.append(("text", a["brokerage"], font("poppins-500", 30), self.WHITE, 0))
            if a.get("phone"): rows.append(("text", a["phone"], font("poppins-700", 42), self.WHITE, 2))
            if self.media("logo"): rows += [("gap", 6), ("img", logo_chip(self.media("logo"), 260, 90))]
        else:
            rows.append(("text", self.headline(), fit_font("poppins-700", 64, self.headline(), MW(1100)), self.WHITE, 0))
            if self.addr_line(): rows.append(("text", self.addr_line(), font("poppins-500", 26), self.SOFT, 0))
        return self.card(rows, MW(1240) + (120 if VERTICAL else 0), t0, None)

# ---- 5 · Terracotta (Bebas Neue + Montserrat, terracotta accent)
class T5(Template):
    name = "Terracotta"
    CREAM = hexrgb("#FFF7EB"); PEACH = hexrgb("#F7C092"); TERRA = hexrgb("#C66748")
    def title(self, t0, t1):
        rows = [("text", self.kicker().upper(), font("montserrat-600", 28), self.PEACH, 7)]
        for ln in wrap(self.headline().upper(), font("bebas", 140), MW(1600)):
            rows.append(("text", ln, fit_font("bebas", 140, ln, MW(1600)), self.CREAM, 3))
        rows.append(("rule", 150, 5, self.TERRA))
        st = stats_parts(self.job.get("stats"))
        if st: rows.append(("text", "  ·  ".join(st), font("montserrat-600", 28), self.PEACH, 4))
        if self.addr_line(): rows.append(("text", self.addr_line(), font("montserrat-500", 30), self.CREAM, 1))
        if self.price(): rows.append(("text", self.price(), font("bebas", 64), self.CREAM, 3))
        img, x, y = self.centered_stack(rows, gap=14, shadow=0.62, blur=8)
        return [Element(img, x, y, t0, t1, "rise")]
    def feature(self, i, n, shot, t0, t1):
        main = (shot.get("label") or "").upper(); sub = (shot.get("sub") or "").upper()
        fm = fit_font("bebas", 82, main, MW(1300)); fs = font("montserrat-600", 24)
        wm = text_w(main, fm, 2); ws = text_w(sub, fs, 4)
        cap = fm.getbbox("H")[3]
        h = cap + (fs.getmetrics()[0] + 16 if sub else 4)
        sp = Sprite(max(wm, ws) + 40, h + 10)
        sp.rect(0, 4, 9, h + 6, self.TERRA)
        sp.text(32, 0, main, fm, self.CREAM, 2)
        if sub: sp.text(34, cap + 14, sub, fs, self.PEACH, 4)
        img = sp.finish(0.62, 8)
        return [Element(img, 110 - sp.pad, H - BOT(115) - h - sp.pad, t0, t1, "left" if i % 2 else "rise")]
    def outro(self, t0):
        a = self.agent(); rows = []
        if self.branded() and self.media("headshot"):
            rows += [("img", circle_photo(self.media("headshot"), 200, self.TERRA, 6)), ("gap", 4)]
        rows.append(("text", self.outro_kicker().upper(), font("montserrat-600", 28), self.PEACH, 7))
        if self.branded():
            if a.get("name"): rows.append(("text", a["name"].upper(), fit_font("bebas", 128, a["name"].upper(), MW(1500)), self.CREAM, 3))
            rows.append(("rule", 150, 5, self.TERRA))
            if a.get("brokerage"): rows.append(("text", a["brokerage"], font("montserrat-500", 30), self.CREAM, 1))
            if a.get("phone"): rows.append(("text", a["phone"], font("montserrat-700", 42), self.CREAM, 2))
            if self.media("logo"): rows += [("gap", 6), ("img", logo_chip(self.media("logo")))]
        else:
            rows.append(("text", self.headline().upper(), fit_font("bebas", 120, self.headline().upper(), MW(1500)), self.CREAM, 3))
            rows.append(("rule", 150, 5, self.TERRA))
            if self.addr_line(): rows.append(("text", self.addr_line(), font("montserrat-500", 30), self.CREAM, 1))
        img, x, y = self.centered_stack(rows, gap=14, shadow=0.62, blur=8)
        return [Element(img, x, y, t0, None, "rise")]

# ---- 6 · Editorial II (Playfair, left-aligned magazine layout, numbered features)
class T6(Template):
    name = "Editorial II"
    IVORY = hexrgb("#FBF6EE"); SOFT = hexrgb("#FBF6EE", 220); LINE = hexrgb("#FBF6EE", 200)
    def left_block(self, rows, width=1300, gap=16):
        h = sum((r[2].getmetrics()[0] + r[2].getmetrics()[1] // 3 + gap) if r[0] == "text"
                else (r[2] + gap + 6) if r[0] == "rule" else r[1] if r[0] == "gap" else r[1].height + gap
                for r in rows)
        sp = Sprite(width, h)
        y = 0
        for r in rows:
            if r[0] == "text":
                sp.text(0, y, r[1], r[2], r[3], r[4]); y += r[2].getmetrics()[0] + r[2].getmetrics()[1] // 3 + gap
            elif r[0] == "rule":
                y += 3; sp.rect(0, y, r[1], y + r[2], r[3]); y += r[2] + gap + 3
            elif r[0] == "gap": y += r[1]
            elif r[0] == "img": sp.paste(r[1], 0, y); y += r[1].height + gap
        return sp.finish(0.5, 8), h
    def title(self, t0, t1):
        rows = [("text", self.kicker().upper(), font("montserrat-600", 22), self.SOFT, 9), ("rule", 70, 2, self.LINE), ("gap", 4)]
        for ln in wrap(self.headline(), font("playfair-400", 104), MW(1350)):
            rows.append(("text", ln, fit_font("playfair-400", 104, ln, MW(1350)), self.IVORY, 0))
        rows.append(("gap", 8))
        st = stats_parts(self.job.get("stats"))
        if st: rows.append(("text", "  |  ".join(st), font("montserrat-500", 24), self.IVORY, 5))
        if self.addr_line(): rows.append(("text", self.addr_line(), font("playfair-italic", 34), self.SOFT, 0))
        if self.price(): rows.append(("text", self.price(), font("playfair-600", 44), self.IVORY, 1))
        img, h = self.left_block(rows, MW(1400))
        return [Element(img, 130 - 40, H - BOT(140) - h - 40, t0, t1, "rise", 28)]
    def feature(self, i, n, shot, t0, t1):
        main = shot.get("label") or ""; sub = shot.get("sub") or ""
        rows = [("text", f"No. {i:02d}", font("playfair-italic", 30), self.SOFT, 0),
                ("text", main, fit_font("playfair-400", 62, main, MW(1200)), self.IVORY, 0)]
        if sub: rows.append(("text", sub.upper(), font("montserrat-500", 21), self.SOFT, 6))
        img, h = self.left_block(rows, MW(1300), 10)
        return [Element(img, 130 - 40, H - BOT(120) - h - 40, t0, t1, "rise", 22)]
    def outro(self, t0):
        a = self.agent(); rows = []
        if self.branded() and self.media("headshot"):
            rows += [("img", circle_photo(self.media("headshot"), 190, self.LINE, 2)), ("gap", 6)]
        rows += [("text", self.outro_kicker().upper(), font("montserrat-600", 22), self.SOFT, 9), ("rule", 70, 2, self.LINE), ("gap", 4)]
        if self.branded():
            if a.get("name"): rows.append(("text", a["name"], fit_font("playfair-400", 96, a["name"], MW(1300)), self.IVORY, 0))
            if a.get("brokerage"): rows.append(("text", a["brokerage"], font("playfair-italic", 34), self.SOFT, 0))
            if a.get("phone"): rows.append(("text", a["phone"], font("montserrat-600", 34), self.IVORY, 4))
            if self.media("logo"): rows += [("gap", 6), ("img", logo_chip(self.media("logo")))]
        else:
            rows.append(("text", self.headline(), fit_font("playfair-400", 90, self.headline(), MW(1300)), self.IVORY, 0))
            if self.addr_line(): rows.append(("text", self.addr_line(), font("playfair-italic", 34), self.SOFT, 0))
        img, h = self.left_block(rows, MW(1400))
        return [Element(img, 130 - 40, (H - h) // 2 - 40, t0, None, "rise", 28)]

# ---- 7 · Coastal Glass (DM Sans, navy-tinted glass, seafoam pills)
class T7(Template):
    name = "Coastal Glass"
    SEA = hexrgb("#6FCDBA"); NAVY = hexrgb("#0E243A"); WHITE = hexrgb("#FFFFFF"); MINT = hexrgb("#CFEFE7")
    TINT = (14, 36, 58, 120); EDGE = (255, 255, 255, 120)
    def pill(self, txt, f, fill, color, track=0, padx=26, h=None):
        tw = text_w(txt, f, track); h = h or int(f.getmetrics()[0] + 24)
        sp = Sprite(int(tw + padx * 2), h, pad=0)
        sp.rect(0, 0, sp.w - 1, h - 1, fill, r=h // 2)
        cap = f.getbbox("H")
        sp.text(padx, (h - (cap[3] - cap[1])) / 2 - cap[1], txt, f, color, track)
        return sp.img
    def card(self, rows, width, t0, t1, motion="rise"):
        spr = glass_card(rows, width, pady=52, gap=16)
        g = dict(rect=(0, 0, spr.width, spr.height), r=30, tint=self.TINT, edge=self.EDGE, blur=26)
        return [Element(spr, (W - spr.width) // 2, (H - spr.height) // 2, t0, t1, motion, 30, glass=g)]
    def title(self, t0, t1):
        rows = [("img", self.pill(self.kicker().upper(), font("dmsans-700", 22), self.SEA, self.NAVY, 4))]
        for ln in wrap(self.headline(), font("dmsans-700", 76), MW(1200)):
            rows.append(("text", ln, fit_font("dmsans-700", 76, ln, MW(1200)), self.WHITE, 0))
        city = self.job.get("city_line") if not self.job.get("headline") else self.addr_line()
        if city: rows.append(("text", city, font("dmsans-500", 30), self.MINT, 0))
        st = stats_parts(self.job.get("stats"), upper=False)
        if st: rows.append(("text", "   ·   ".join(st), font("dmsans-500", 28), self.WHITE, 1))
        if self.price(): rows.append(("img", self.pill(self.price(), font("dmsans-700", 30), self.WHITE, self.NAVY, 1)))
        return self.card(rows, MW(1340) + (120 if VERTICAL else 0), t0, t1)
    def feature(self, i, n, shot, t0, t1):
        main = shot.get("label") or ""; sub = shot.get("sub") or ""
        fm = fit_font("dmsans-700", 40, main, MW(1000)); fs = font("dmsans-500", 24)
        tw = max(text_w(main, fm), text_w(sub, fs))
        cd = 64; padx = 30; h = 120 if sub else 100
        w = int(padx + cd + 26 + tw + padx + 10)
        sp = Sprite(w, h, pad=0)
        cy = h / 2
        sp.ellipse(padx, cy - cd / 2, padx + cd, cy + cd / 2, fill=self.SEA)
        nf = font("dmsans-700", 30); num = str(i)
        bb = nf.getbbox(num)
        sp.text(padx + cd / 2, cy - (bb[3] - bb[1]) / 2 - bb[1], num, nf, self.NAVY, anchor="c")
        tx = padx + cd + 26
        if sub:
            sp.text(tx, cy - fm.getmetrics()[0] + 2, main, fm, self.WHITE)
            sp.text(tx, cy + 10, sub, fs, self.MINT)
        else:
            capb = fm.getbbox("H")
            sp.text(tx, cy - (capb[3] - capb[1]) / 2 - capb[1], main, fm, self.WHITE)
        g = dict(rect=(0, 0, w, h), r=26, tint=self.TINT, edge=self.EDGE, blur=24)
        return [Element(sp.img, W - 100 - w, H - BOT(100) - h, t0, t1, "right", 30, glass=g)]
    def outro(self, t0):
        a = self.agent()
        rows = [("img", self.pill(self.outro_kicker().upper(), font("dmsans-700", 22), self.SEA, self.NAVY, 4))]
        if self.branded():
            if self.media("headshot"): rows.insert(0, ("img", circle_photo(self.media("headshot"), 170, self.SEA, 5)))
            if a.get("name"): rows.append(("text", a["name"], fit_font("dmsans-700", 70, a["name"], MW(1100)), self.WHITE, 0))
            if a.get("brokerage"): rows.append(("text", a["brokerage"], font("dmsans-500", 30), self.MINT, 0))
            if a.get("phone"): rows.append(("img", self.pill(a["phone"], font("dmsans-700", 34), self.WHITE, self.NAVY, 1, 34)))
            if self.media("logo"): rows.append(("img", logo_chip(self.media("logo"), 260, 90)))
        else:
            rows.append(("text", self.headline(), fit_font("dmsans-700", 66, self.headline(), MW(1100)), self.WHITE, 0))
        if self.addr_line() or self.job.get("address"):
            rows.append(("text", ", ".join([p for p in [self.job.get("address"), self.job.get("city_line")] if p]),
                         font("dmsans-400", 24), self.MINT, 0))
        return self.card(rows, MW(1240) + (120 if VERTICAL else 0), t0, None)

# ---- 8 · Emerald Sidebar (deep green side panel, Playfair + Montserrat, champagne)
class T8(Template):
    name = "Emerald Sidebar"
    PANEL = (15, 59, 46, 214); CHAMP = hexrgb("#E8D3A3"); IVORY = hexrgb("#FBF7EF"); SOFT = hexrgb("#FBF7EF", 215)
    def __init__(self, job):
        super().__init__(job)
        # 16:9: full-height left sidebar. 9:16: full-width panel in the lower part of the frame.
        self.SW = W if VERTICAL else 640
        self.PH = 900 if VERTICAL else H
        self.PY = H - self.PH - BOT(0) if VERTICAL else 0
        self.PM = "rise" if VERTICAL else "left"
    def panel(self, rows, h=None, w=None, valign="c", padx=70):
        h = h or H
        w = w or self.SW
        img = Image.new("RGBA", (w, h), self.PANEL)
        d = ImageDraw.Draw(img)
        if VERTICAL and w == W: d.rectangle([0, 0, w, 4], fill=self.CHAMP)
        else: d.rectangle([w - 4, 0, w, h], fill=self.CHAMP)
        th = sum((r[2].getmetrics()[0] + r[2].getmetrics()[1] // 3 + r[5] if len(r) > 5 else r[2].getmetrics()[0] + r[2].getmetrics()[1] // 3 + 16)
                 if r[0] == "text" else (r[2] + 34) if r[0] == "rule" else r[1] if r[0] == "gap" else r[1].height + 18
                 for r in rows)
        y = (h - th) / 2 if valign == "c" else h - th - 70
        sp = Sprite(w, h, pad=0); sp.img = img; sp.d = d
        for r in rows:
            if r[0] == "text":
                sp.text(padx, y, r[1], r[2], r[3], r[4])
                y += r[2].getmetrics()[0] + r[2].getmetrics()[1] // 3 + (r[5] if len(r) > 5 else 16)
            elif r[0] == "rule":
                y += 16; sp.rect(padx, y, padx + r[1], y + r[2], r[3]); y += r[2] + 18
            elif r[0] == "gap": y += r[1]
            elif r[0] == "img": sp.paste(r[1], padx, y); y += r[1].height + 18
        return img
    def title(self, t0, t1):
        rows = [("text", self.kicker().upper(), font("montserrat-600", 20), self.CHAMP, 7), ("gap", 6)]
        for ln in wrap(self.headline(), font("playfair-400", 70), self.SW - 140, max_lines=4):
            rows.append(("text", ln, fit_font("playfair-400", 70, ln, self.SW - 140), self.IVORY, 0, 4))
        rows.append(("rule", 80, 2, self.CHAMP)); rows.append(("gap", 6))
        for s_ in stats_parts(self.job.get("stats")):
            rows.append(("text", s_, font("montserrat-600", 22), self.IVORY, 5, 12))
        rows.append(("gap", 10))
        for ln in wrap(self.addr_line(), font("playfair-italic", 30), self.SW - 140, 3):
            rows.append(("text", ln, font("playfair-italic", 30), self.SOFT, 0, 6))
        if self.price(): rows += [("gap", 10), ("text", self.price(), font("playfair-600", 44), self.CHAMP, 1)]
        return [Element(self.panel(rows, h=self.PH), 0, self.PY, t0, t1, self.PM, 60)]
    def feature(self, i, n, shot, t0, t1):
        main = shot.get("label") or ""; sub = (shot.get("sub") or "").upper()
        fm = fit_font("playfair-400", 52, main, MW(900)); fs = font("montserrat-600", 20)
        w = int(max(text_w(main, fm), text_w(sub, fs, 5)) + 160)
        rows = [("text", f"{i:02d}", font("montserrat-600", 20), self.CHAMP, 6, 8), ("text", main, fm, self.IVORY, 0, 10)]
        if sub: rows.append(("text", sub, fs, self.SOFT, 5))
        h = 200 if sub else 160
        return [Element(self.panel(rows, h=h, w=w, padx=60), 0, H - BOT(90) - h, t0, t1, "left", 50)]
    def outro(self, t0):
        a = self.agent(); rows = []
        if self.branded() and self.media("headshot"):
            rows += [("img", circle_photo(self.media("headshot"), 170, self.CHAMP, 3)), ("gap", 6)]
        rows += [("text", self.outro_kicker().upper(), font("montserrat-600", 20), self.CHAMP, 6), ("gap", 4)]
        if self.branded():
            for ln in wrap(a.get("name", ""), font("playfair-400", 64), self.SW - 140, 2):
                rows.append(("text", ln, fit_font("playfair-400", 64, ln, self.SW - 140), self.IVORY, 0, 4))
            rows.append(("rule", 80, 2, self.CHAMP))
            for ln in wrap(a.get("brokerage", ""), font("playfair-italic", 30), self.SW - 140, 2):
                rows.append(("text", ln, font("playfair-italic", 30), self.SOFT, 0, 6))
            if a.get("phone"): rows += [("gap", 6), ("text", a["phone"], font("montserrat-600", 32), self.IVORY, 3)]
            if self.media("logo"): rows += [("gap", 10), ("img", logo_chip(self.media("logo"), 260, 90))]
        else:
            for ln in wrap(self.headline(), font("playfair-400", 64), self.SW - 140, 3):
                rows.append(("text", ln, fit_font("playfair-400", 64, ln, self.SW - 140), self.IVORY, 0, 4))
            rows.append(("rule", 80, 2, self.CHAMP))
            for ln in wrap(self.addr_line(), font("playfair-italic", 30), self.SW - 140, 3):
                rows.append(("text", ln, font("playfair-italic", 30), self.SOFT, 0, 6))
        return [Element(self.panel(rows, h=self.PH), 0, self.PY, t0, None, self.PM, 60)]

# ---- 9 · Golden Hour Script (Great Vibes script + Montserrat caps, warm gold)
class T9(Template):
    name = "Golden Hour Script"
    GOLD = hexrgb("#F2C46D"); CREAM = hexrgb("#FFF6E6")
    def title(self, t0, t1):
        k = self.kicker(); k = k.title() if k.isupper() else k
        rows = [("text", k, fit_font("greatvibes", 96, k, MW(1500)), self.GOLD, 0), ("gap", 26)]
        for ln in wrap(self.headline().upper(), font("montserrat-700", 64), MW(1600)):
            rows.append(("text", ln, fit_font("montserrat-700", 64, ln, MW(1600), 6), self.CREAM, 6))
        st = stats_parts(self.job.get("stats"))
        if st: rows.append(("text", "  ·  ".join(st), font("montserrat-600", 26), self.GOLD, 6))
        if self.addr_line(): rows.append(("text", self.addr_line(), font("montserrat-500", 28), self.CREAM, 2))
        if self.price(): rows.append(("text", self.price(), font("greatvibes", 72), self.GOLD, 0))
        img, x, y = self.centered_stack(rows, gap=12, shadow=0.6, blur=8)
        return [Element(img, x, y, t0, t1, "rise")]
    def feature(self, i, n, shot, t0, t1):
        main = shot.get("label") or ""; sub = (shot.get("sub") or "").upper()
        fm = fit_font("greatvibes", 92, main, MW(1300)); fs = font("montserrat-600", 22)
        asc = fm.getmetrics()[0]
        desc = fm.getmetrics()[1]
        h = asc + (int(desc * 0.75) + fs.getmetrics()[0] + 6 if sub else desc // 2)
        sp = Sprite(max(text_w(main, fm), text_w(sub, fs, 6)) + 60, h + 30)
        sp.text(0, 0, main, fm, self.CREAM)
        if sub: sp.text(14, asc + int(desc * 0.75), sub, fs, self.GOLD, 6)
        img = sp.finish(0.6, 8)
        return [Element(img, 120 - sp.pad, H - BOT(110) - h - sp.pad, t0, t1, "rise", 26)]
    def outro(self, t0):
        a = self.agent(); rows = []
        if self.branded() and self.media("headshot"):
            rows += [("img", circle_photo(self.media("headshot"), 200, self.GOLD, 4))]
        k = self.outro_kicker(); k = k.capitalize() if k.isupper() else k
        rows.append(("text", k, fit_font("greatvibes", 86, k, MW(1500)), self.GOLD, 0)); rows.append(("gap", 24))
        if self.branded():
            if a.get("name"): rows.append(("text", a["name"].upper(), fit_font("montserrat-700", 62, a["name"].upper(), MW(1500), 6), self.CREAM, 6))
            if a.get("brokerage"): rows.append(("text", a["brokerage"].upper(), font("montserrat-600", 24), self.GOLD, 6))
            if a.get("phone"): rows.append(("text", a["phone"], font("montserrat-600", 40), self.CREAM, 3))
            if self.media("logo"): rows += [("gap", 6), ("img", logo_chip(self.media("logo")))]
        else:
            rows.append(("text", self.headline().upper(), fit_font("montserrat-700", 58, self.headline().upper(), MW(1500), 6), self.CREAM, 6))
            if self.addr_line(): rows.append(("text", self.addr_line(), font("montserrat-500", 28), self.CREAM, 2))
        img, x, y = self.centered_stack(rows, gap=12, shadow=0.6, blur=8)
        return [Element(img, x, y, t0, None, "rise")]

# ---- 10 · Cinema Letterbox (2.39:1 bars, Cormorant caps, wide tracking)
class T10(Template):
    name = "Cinema Letterbox"
    letterbox = 136
    def __init__(self, job):
        super().__init__(job)
        self.letterbox = 300 if VERTICAL else 136
    WHITE = hexrgb("#FFFFFF"); SOFT = hexrgb("#FFFFFF", 200); GOLD = hexrgb("#D8C49A")
    def bar_text(self, top, bottom, t0, t1):
        """Text centered in the bottom letterbox bar (top line small caps, bottom line larger)."""
        fs = font("montserrat-500", 18); fm = fit_font("cormorant-600", 44, bottom, MW(1700), 10)
        w = W - 120; h = self.letterbox
        sp = Sprite(w, h, pad=10)
        yb = H - h
        if top:
            sp.text(w / 2, 22, top, fs, self.GOLD, 9, anchor="c")
            sp.text(w / 2, 52, bottom, fm, self.WHITE, 10, anchor="c")
        else:
            cap = fm.getbbox("H")
            sp.text(w / 2, (h - (cap[3] - cap[1])) / 2 - cap[1], bottom, fm, self.WHITE, 10, anchor="c")
        img = sp.finish(0)
        return Element(img, (W - img.width) // 2, yb - 10, t0, t1, "fade", 0)
    def title(self, t0, t1):
        rows = [("text", self.kicker().upper(), font("montserrat-500", 22), self.GOLD, 12), ("gap", 4)]
        for ln in wrap(self.headline().upper(), font("cormorant-600", 100), MW(1600)):
            rows.append(("text", ln, fit_font("cormorant-600", 100, ln, MW(1600), 14), self.WHITE, 14))
        rows.append(("rule", 60, 1, self.GOLD))
        if self.addr_line(): rows.append(("text", self.addr_line().upper(), font("montserrat-500", 22), self.SOFT, 8))
        img, x, y = self.centered_stack(rows, gap=16, shadow=0.55, blur=9)
        els = [Element(img, x, y, t0, t1, "fade", 0)]
        st = stats_parts(self.job.get("stats"))
        bottom = "   ·   ".join(st + ([self.price()] if self.price() else []))
        if bottom: els.append(self.bar_text(None, bottom, t0 + 0.4, t1))
        return els
    def feature(self, i, n, shot, t0, t1):
        main = (shot.get("label") or "").upper(); sub = (shot.get("sub") or "").upper()
        return [self.bar_text(sub or f"{i:02d}", main, t0, t1)]
    def outro(self, t0):
        a = self.agent(); rows = []
        if self.branded() and self.media("headshot"):
            rows += [("img", circle_photo(self.media("headshot"), 180, self.GOLD, 2)), ("gap", 4)]
        rows += [("text", self.outro_kicker().upper(), font("montserrat-500", 22), self.GOLD, 12), ("gap", 4)]
        if self.branded():
            if a.get("name"): rows.append(("text", a["name"].upper(), fit_font("cormorant-600", 90, a["name"].upper(), MW(1500), 12), self.WHITE, 12))
            rows.append(("rule", 60, 1, self.GOLD))
            if a.get("brokerage"): rows.append(("text", a["brokerage"].upper(), font("montserrat-500", 22), self.SOFT, 8))
            if a.get("phone"): rows.append(("text", a["phone"], font("cormorant-600", 50), self.WHITE, 4))
            if self.media("logo"): rows += [("gap", 4), ("img", logo_chip(self.media("logo"), 240, 80))]
        else:
            rows.append(("text", self.headline().upper(), fit_font("cormorant-600", 86, self.headline().upper(), MW(1500), 12), self.WHITE, 12))
            rows.append(("rule", 60, 1, self.GOLD))
            if self.addr_line(): rows.append(("text", self.addr_line().upper(), font("montserrat-500", 22), self.SOFT, 8))
        img, x, y = self.centered_stack(rows, gap=16, shadow=0.55, blur=9)
        return [Element(img, x, y, t0, None, "fade", 0)]

# ---- 11 · Holiday (red, evergreen and gold, script lettering, string lights on the outro, gentle snow)
def light_string(width, sag=46, bulbs=13, size=15):
    """A sagging string of glowing Christmas bulbs, as a transparent image."""
    h = sag + size * 4
    im = Image.new("RGBA", (width, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = [(x, size + sag * (1 - ((2 * x / width) - 1) ** 2)) for x in range(0, width + 1, 6)]
    d.line(pts, fill=(34, 60, 40, 255), width=3)
    colors = [(235, 64, 52), (255, 196, 64), (64, 186, 110), (90, 160, 255), (255, 236, 200)]
    glow = Image.new("RGBA", im.size, (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
    for k in range(bulbs):
        x = width * (k + 0.5) / bulbs
        y = size + sag * (1 - ((2 * x / width) - 1) ** 2) + size * 0.9
        c = colors[k % len(colors)]
        g.ellipse([x - size * 1.6, y - size * 1.6, x + size * 1.6, y + size * 1.6], fill=c + (150,))
        d.rectangle([x - 3, y - size * 0.9, x + 3, y - size * 0.4], fill=(70, 70, 60, 255))
        d.ellipse([x - size * 0.45, y - size * 0.5, x + size * 0.45, y + size * 0.7], fill=c + (255,))
        d.ellipse([x - size * 0.15, y - size * 0.25, x + size * 0.05, y], fill=(255, 255, 255, 200))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.9))
    glow.alpha_composite(im)
    return glow

class Snow:
    """Gentle falling snow, drawn over every frame. Same flakes every render (fixed seed)."""
    def __init__(self, count=None, seed=7):
        import random
        rnd = random.Random(seed)
        n = count or (150 if not VERTICAL else 170)
        sc = W / 1920 if not VERTICAL else H / 1920
        self.f = []
        for _ in range(n):
            depth = rnd.random()   # 0 far .. 1 near: near flakes are bigger, faster, brighter
            self.f.append(dict(x=rnd.uniform(0, W), y=rnd.uniform(0, H), r=sc * (1.6 + 4.2 * depth),
                               v=sc * (35 + 85 * depth), a=int(110 + 120 * depth), sw=sc * rnd.uniform(8, 26),
                               fr=rnd.uniform(0.3, 0.9), ph=rnd.uniform(0, 6.28)))
    def draw(self, frame, t):
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for f in self.f:
            y = (f["y"] + f["v"] * t) % (H + 20) - 10
            x = (f["x"] + f["sw"] * math.sin(t * f["fr"] + f["ph"]) + 12 * t) % W
            r = f["r"]
            d.ellipse([x - r * 1.7, y - r * 1.7, x + r * 1.7, y + r * 1.7], fill=(255, 255, 255, f["a"] // 4))
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, f["a"]))
        frame.alpha_composite(layer)

class T11(Template):
    name = "Holiday"
    RED = hexrgb("#C8323C"); GREEN = hexrgb("#1F5A3A"); GOLD = hexrgb("#F2C879"); CREAM = hexrgb("#FFF8EC")
    def __init__(self, job):
        super().__init__(job)
        self.snow = Snow() if job.get("snow", True) else None
    def kicker(self):
        k = self.job.get("kicker") or ""
        return "Home for the Holidays" if not k or k.upper() == "NOW AVAILABLE" else k
    def outro_kicker(self):
        k = self.job.get("outro_kicker") or ""
        return "Happy Holidays from" if not k or k.upper() == "SCHEDULE YOUR SHOWING" else k
    def title(self, t0, t1):
        k = self.kicker(); k = k.title() if k.isupper() else k
        rows = [("text", k, fit_font("greatvibes", 104, k, MW(1500)), self.GOLD, 0), ("gap", 22)]
        for ln in wrap(self.headline().upper(), font("montserrat-700", 66), MW(1600)):
            rows.append(("text", ln, fit_font("montserrat-700", 66, ln, MW(1600), 6), self.CREAM, 6))
        rows.append(("rule", 120, 4, self.RED))
        st = stats_parts(self.job.get("stats"))
        if st: rows.append(("text", "  ·  ".join(st), font("montserrat-600", 28), self.GOLD, 6))
        if self.addr_line(): rows.append(("text", self.addr_line(), font("montserrat-500", 28), self.CREAM, 2))
        if self.price(): rows.append(("text", self.price(), font("greatvibes", 74), self.GOLD, 0))
        img, x, y = self.centered_stack(rows, gap=12, shadow=0)
        return [Element(img, x, y, t0, t1, "rise")]
    def feature(self, i, n, shot, t0, t1):
        main = shot.get("label") or ""; sub = (shot.get("sub") or "").upper()
        fm = fit_font("greatvibes", 92, main, MW(1300)); fs = font("montserrat-600", 22)
        asc, desc = fm.getmetrics()
        h = asc + (int(desc * 0.75) + fs.getmetrics()[0] + 6 if sub else desc // 2)
        sp = Sprite(max(text_w(main, fm), text_w(sub, fs, 6)) + 60, h + 30)
        sp.rect(0, asc * 0.25, 7, h, self.RED)
        sp.text(26, 0, main, fm, self.CREAM)
        if sub: sp.text(40, asc + int(desc * 0.75), sub, fs, self.GOLD, 6)
        img = sp.finish(0)
        return [Element(img, 120 - sp.pad, H - BOT(110) - h - sp.pad, t0, t1, "rise", 26)]
    def outro(self, t0):
        a = self.agent(); rows = []
        if self.branded() and self.media("headshot"):
            rows.append(("img", circle_photo(self.media("headshot"), 200, self.RED, 6)))
        k = self.outro_kicker()
        rows.append(("text", k, fit_font("greatvibes", 88, k, MW(1500)), self.GOLD, 0)); rows.append(("gap", 20))
        if self.branded():
            if a.get("name"): rows.append(("text", a["name"].upper(), fit_font("montserrat-700", 62, a["name"].upper(), MW(1500), 6), self.CREAM, 6))
            if a.get("brokerage"): rows.append(("text", a["brokerage"].upper(), font("montserrat-600", 24), self.GOLD, 6))
            if a.get("phone"): rows.append(("text", a["phone"], font("montserrat-600", 40), self.CREAM, 3))
            if self.media("logo"): rows += [("gap", 6), ("img", logo_chip(self.media("logo")))]
        else:
            rows.append(("text", self.headline().upper(), fit_font("montserrat-700", 58, self.headline().upper(), MW(1500), 6), self.CREAM, 6))
            if self.addr_line(): rows.append(("text", self.addr_line(), font("montserrat-500", 28), self.CREAM, 2))
        img, x, y = self.centered_stack(rows, gap=12, shadow=0)
        lights = light_string(W + 80)
        return [Element(lights, -40, 0, t0 - 0.3, None, "drop", 40), Element(img, x, y, t0, None, "rise")]
    def overlay(self, frame, t):
        if self.snow: self.snow.draw(frame, t)

# ---- 12 · Estate (Cormorant Garamond caps, tracked wide or italic; Montserrat body; gold hairline). No shadow.
class T12(Template):
    name = "Estate"
    GOLD = hexrgb("#D6C08E"); WHITE = hexrgb("#FFFFFF"); SOFT = hexrgb("#FFFFFF", 235)
    SERIF = "cgaramond-400"; ITAL = "cgaramond-italic"; SANS = "montserrat-500"
    def _stack(self, rows, gap=18):
        img, x, _ = self.centered_stack(rows, gap=gap, shadow=0, blur=0)
        return img, x
    def title(self, t0, t1):
        out = []
        top = (self.kicker() or "").upper()
        if top:
            img, x = self._stack([("text", top, fit_font(self.ITAL, 150, top, MW(1500)), self.WHITE, 0)])
            out.append(Element(img, x, int(H * (0.12 if VERTICAL else 0.07)), t0, t1, "rise", 26))
        j = self.job
        street = (j.get("address") or self.headline() or "").upper()
        city = (j.get("city_line") or "").upper()
        rows = [("rule", 150, 3, self.GOLD), ("gap", 6)]
        if street: rows.append(("text", street, fit_font(self.SERIF, 78, street, MW(1500), track=22), self.WHITE, 22))
        if street and city: rows.append(("gap", 8))
        if city: rows.append(("text", city, font(self.SANS, 36), self.WHITE, 9))
        st = stats_parts(j.get("stats"))
        if self.price(): st = st + [self.price()]
        if st: rows.append(("text", "   |   ".join(st).upper(), font("montserrat-400", 24), self.SOFT, 6))
        img, x = self._stack(rows, gap=16)
        out.append(Element(img, x, H - BOT(80) - img.height, t0, t1, "rise", 26))
        return out
    def feature(self, i, n, shot, t0, t1):
        main = (shot.get("label") or "").upper(); sub = (shot.get("sub") or "").upper()
        fm = fit_font(self.SERIF, 60, main, MW(1300), track=14); fs = font(self.SANS, 22)
        wm = text_w(main, fm, 14); ws = text_w(sub, fs, 6)
        a = fm.getmetrics()[0]
        h = a + 34 + (fs.getmetrics()[0] if sub else 0)
        sp = Sprite(max(wm, ws, 130) + 20, h + 10)
        sp.text(0, 0, main, fm, self.WHITE, 14)
        sp.rect(2, a + 18, 122, a + 20, self.GOLD)
        if sub: sp.text(2, a + 36, sub, fs, self.WHITE, 6)
        img = sp.finish(0)
        return [Element(img, 120 - sp.pad, H - BOT(120) - h - sp.pad, t0, t1, "rise", 24)]
    def outro(self, t0):
        a = self.agent(); rows = []
        if self.branded() and self.media("headshot"):
            rows += [("img", circle_photo(self.media("headshot"), 200, self.GOLD, 3)), ("gap", 4)]
        rows.append(("text", self.outro_kicker().upper(), font(self.SANS, 24), self.SOFT, 9))
        if self.branded():
            if a.get("name"):
                nm = a["name"].upper()
                rows.append(("text", nm, fit_font(self.ITAL, 104, nm, MW(1500)), self.WHITE, 0))
            rows.append(("rule", 150, 3, self.GOLD))
            if a.get("brokerage"): rows.append(("text", a["brokerage"].upper(), font(self.SANS, 24), self.WHITE, 8))
            if a.get("phone"): rows.append(("text", a["phone"], font(self.SERIF, 54), self.WHITE, 8))
            if self.media("logo"): rows += [("gap", 10), ("img", logo_image(self.media("logo"), 320, 120))]
        else:
            hl = self.headline().upper()
            rows.append(("text", hl, fit_font(self.ITAL, 96, hl, MW(1500)), self.WHITE, 0))
            rows.append(("rule", 150, 3, self.GOLD))
            if self.addr_line(): rows.append(("text", self.addr_line().upper(), font(self.SANS, 26), self.SOFT, 8))
        img, x = self._stack(rows, gap=20)
        return [Element(img, x, (H - img.height) // 2, t0, None, "rise", 26)]

# ---- 13 · Sunshine Coast (Florida, airy: flowing script, thin tracked caps, a soft hand-drawn wave; no boxes)
class T13(Template):
    name = "Sunshine Coast"
    WHITE = hexrgb("#FFFFFF"); SOFT = hexrgb("#FFFFFF", 235); SEA = hexrgb("#C8F4EE"); WAVE = hexrgb("#FFFFFF", 215)
    SCRIPT = "allura"; CAPS = "montserrat-500"; LIGHT = "montserrat-400"

    def _wave(self, sp, cx, y, w, amp=6, period=70, width=3, fill=None):
        # one long, gentle swell that tapers at both ends
        pts = []
        for t in range(0, int(w) + 1, 2):
            env = math.sin(math.pi * t / w)
            pts.append((cx - w / 2 + t + sp.pad, y + sp.pad + amp * env * math.sin(t / period * 2 * math.pi)))
        sp.d.line(pts, fill=fill or self.WAVE, width=width, joint="curve")

    def _stack(self, rows, w, gap=12, align="c"):
        """rows: ('text', txt, font, fill, track) | ('wave', w) | ('gap', px) | ('img', Image). Transparent, no shadow."""
        h = 0
        for r in rows:
            if r[0] == "text": h += r[2].getmetrics()[0] + r[2].getmetrics()[1] // 3 + gap
            elif r[0] == "wave": h += 22 + gap
            elif r[0] == "gap": h += r[1]
            elif r[0] == "img": h += r[1].height + gap
        sp = Sprite(w, h + 20)
        y = 0; x = w / 2 if align == "c" else 0
        for r in rows:
            if r[0] == "text":
                _, txt, f, fill, tr = r
                sp.text(x, y, txt, f, fill, tr, anchor=align)
                y += f.getmetrics()[0] + f.getmetrics()[1] // 3 + gap
            elif r[0] == "wave":
                self._wave(sp, x if align == "c" else r[1] / 2, y + 10, r[1]); y += 22 + gap
            elif r[0] == "gap": y += r[1]
            elif r[0] == "img":
                sp.paste(r[1], (x - r[1].width / 2) if align == "c" else 0, y); y += r[1].height + gap
        return sp.finish(0), sp.pad

    def title(self, t0, t1):
        w = MW(1600)
        rows = [("text", self.kicker().upper(), font("montserrat-600", 26), self.SEA, 12), ("gap", 2)]
        for ln in wrap(self.headline(), font(self.SCRIPT, 150), w - 80):
            rows.append(("text", ln, fit_font(self.SCRIPT, 150, ln, w - 80), self.WHITE, 0))
        rows += [("gap", 4), ("wave", 320), ("gap", 4)]
        st = stats_parts(self.job.get("stats"))
        if st: rows.append(("text", "   ·   ".join(st).upper(), font(self.CAPS, 27), self.WHITE, 7))
        if self.addr_line(): rows.append(("text", self.addr_line().upper(), fit_font(self.CAPS, 24, self.addr_line().upper(), w - 80, 6), self.WHITE, 6))
        if self.price(): rows.append(("text", self.price(), font("montserrat-600", 36), self.SEA, 5))
        img, _ = self._stack(rows, w)
        y = H - BOT(90) - img.height if not VERTICAL else (H - img.height) // 2
        return [Element(img, (W - img.width) // 2, y, t0, t1, "rise", 18)]

    def feature(self, i, n, shot, t0, t1):
        main = shot.get("label") or ""; sub = (shot.get("sub") or "").upper()
        if not main and not sub: return []
        fm = fit_font(self.SCRIPT, 96, main, MW(1200)); fs = font(self.CAPS, 22)
        w = int(max(text_w(main, fm), text_w(sub, fs, 7), 220)) + 30
        rows = [("text", main, fm, self.WHITE, 0), ("wave", 200)]
        if sub: rows.append(("text", sub, fs, self.WHITE, 7))
        img, pad = self._stack(rows, w, gap=6, align="l")
        return [Element(img, 110 - pad, H - BOT(90) - img.height + pad, t0, t1, "rise", 16)]

    def outro(self, t0):
        a = self.agent(); w = MW(1500); rows = []
        if self.branded() and self.media("headshot"):
            rows += [("img", circle_photo(self.media("headshot"), 200, self.WHITE, 3)), ("gap", 4)]
        rows.append(("text", self.outro_kicker().upper(), font(self.CAPS, 22), self.SEA, 12))
        if self.branded():
            if a.get("name"): rows.append(("text", a["name"], fit_font(self.SCRIPT, 140, a["name"], w - 80), self.WHITE, 0))
            rows += [("wave", 300), ("gap", 2)]
            if a.get("brokerage"): rows.append(("text", a["brokerage"].upper(), fit_font(self.LIGHT, 22, a["brokerage"].upper(), w - 80, 7), self.WHITE, 7))
            if a.get("phone"): rows.append(("text", a["phone"], font(self.LIGHT, 40), self.WHITE, 4))
            if self.media("logo"): rows += [("gap", 8), ("img", logo_image(self.media("logo"), 300, 110))]
        else:
            hl = self.headline()
            rows.append(("text", hl, fit_font(self.SCRIPT, 130, hl, w - 80), self.WHITE, 0))
            rows += [("wave", 300), ("gap", 2)]
            if self.addr_line(): rows.append(("text", self.addr_line().upper(), fit_font(self.LIGHT, 22, self.addr_line().upper(), w - 80, 6), self.SOFT, 6))
        img, _ = self._stack(rows, w, gap=14)
        return [Element(img, (W - img.width) // 2, (H - img.height) // 2, t0, None, "rise", 18)]

TEMPLATES = {1: T1, 2: T2, 3: T3, 4: T4, 5: T5, 6: T6, 7: T7, 8: T8, 9: T9, 10: T10, 11: T11, 12: T12, 13: T13}

# ---------------------------------------------------------------- footage
def probe_duration(path):
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                              "-of", "default=nw=1:nk=1", path], capture_output=True, text=True).stdout
        return float(out.strip())
    except Exception:
        return 0.0

def _crop_box(path, crop, aspect):
    """The realtor's crop ({x,y,w,h} fractions of the photo) as a pixel box on a clip, reshaped to `aspect`
    (out width / height) around the same center and height, kept inside the clip. None if unusable."""
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                            "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
        iw, ih = (int(v) for v in r.stdout.strip().split(",")[:2])
        cx = (float(crop["x"]) + float(crop["w"]) / 2) * iw
        cy = (float(crop["y"]) + float(crop["h"]) / 2) * ih
        bh = min(ih, max(64.0, float(crop["h"]) * ih))
        bw = bh * aspect
        if bw > iw:
            bw = iw; bh = bw / aspect
        x0 = min(max(0.0, cx - bw / 2), iw - bw); y0 = min(max(0.0, cy - bh / 2), ih - bh)
        bw, bh = int(bw) // 2 * 2, int(bh) // 2 * 2
        return int(x0), int(y0), bw, bh
    except Exception:
        return None

def _focus(focus):
    """(x, y) fractions of where to center a crop, from a shot's "focus" (None = the middle)."""
    try:
        return (min(1.0, max(0.0, float(focus[0]))), min(1.0, max(0.0, float(focus[1]))))
    except (TypeError, ValueError, IndexError):
        return (0.5, 0.5)

def prep_photo(path, focus=None):
    """Return an RGB image a bit larger than the frame, ready for pan/zoom. focus: where to center the crop."""
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    ar = im.width / im.height
    big = (int(W * 1.18), int(H * 1.18))
    if ar < 1.25:  # portrait or square: blurred backdrop + fitted photo
        bg = ImageOps.fit(im, big, Image.LANCZOS).filter(ImageFilter.GaussianBlur(40))
        bg = ImageEnhance.Brightness(bg).enhance(0.7)
        fg = im.copy(); fg.thumbnail((big[0], int(big[1] * 0.96)), Image.LANCZOS)
        bg.paste(fg, ((big[0] - fg.width) // 2, (big[1] - fg.height) // 2))
        return bg
    return ImageOps.fit(im, big, Image.LANCZOS, centering=_focus(focus))

MOVES = ["push", "pan_r", "pull", "pan_l", "push_up"]

class PhotoSource:
    def __init__(self, path, nframes, move, curve=None, focus=None):
        self.img = prep_photo(path, focus); self.n = nframes; self.move = move
        self.curve = curve  # optional: source position per output frame (speed ramp)
    def frame(self, k):
        if self.curve:
            span = self.curve[-1] or 1
            a, b = self.curve[k] / span, self.curve[min(k + 1, len(self.curve) - 1)] / span
            if (b - a) * span > 1.6:   # moving fast: motion blur from 3 sub-positions
                ims = [np.asarray(self.at(a + (b - a) * j / 3), dtype=np.float32) for j in range(3)]
                return Image.fromarray((sum(ims) / 3).astype(np.uint8))
            return self.at(a)
        return self.at(k / max(1, self.n - 1))
    def at(self, q):
        p = ease_io(q) * 0.85 + q * 0.15
        bw, bh = self.img.size
        if self.move == "push":     s = 1.0 - 0.12 * p; cx, cy = 0.5, 0.5
        elif self.move == "pull":   s = 0.88 + 0.12 * p; cx, cy = 0.5, 0.5
        elif self.move == "push_up": s = 1.0 - 0.10 * p; cx, cy = 0.5, 0.55 - 0.06 * p
        elif self.move == "pan_r":  s = 0.86; cx, cy = 0.42 + 0.16 * p, 0.5
        else:                       s = 0.86; cx, cy = 0.58 - 0.16 * p, 0.5
        cw, ch = bw * s, bh * s
        x0 = max(0, min(bw - cw, cx * bw - cw / 2)); y0 = max(0, min(bh - ch, cy * bh - ch / 2))
        return self.img.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))
    def close(self): pass

DRIFTS = ["push", "pan_r", "pull", "pan_l", "rise"]

class ClipSource:
    """Decodes an AI clip. Every clip also gets a slow digital camera drift (a push, pull or pan of a few
    percent), so even a take where the AI camera barely moved never looks like a still photo."""
    def __init__(self, path, start, nframes, curve=None, move="push", drift=0.07, focus=None, crop=None):
        self.n = nframes; self.curve = curve; self.move = move; self.drift = max(0.0, float(drift or 0))
        z = 1 + self.drift
        self.cw, self.ch = int(round(W * z / 2)) * 2, int(round(H * z / 2)) * 2
        need = int(curve[-1]) + 2 if curve else nframes
        fx, fy = _focus(focus)   # where to cut from when the clip is wider (or taller) than the frame
        box = _crop_box(path, crop, self.cw / self.ch) if crop else None
        if box:   # the realtor's frame from the crop tool, cut straight out of the wide clip
            bx, by, bw, bh = box
            sharp = ",unsharp=5:5:0.7:5:5:0.0" if self.cw > bw * 1.4 else ""
            vf = f"crop={bw}:{bh}:{bx}:{by},scale={self.cw}:{self.ch}:flags=lanczos{sharp},fps={FPS}"
        else:
            vf = (f"scale={self.cw}:{self.ch}:force_original_aspect_ratio=increase:flags=lanczos,"
                  f"crop={self.cw}:{self.ch}:(in_w-{self.cw})*{fx:.4f}:(in_h-{self.ch})*{fy:.4f},fps={FPS}")
        self.p = subprocess.Popen(["ffmpeg", "-v", "error", "-threads", "1", "-filter_threads", "1", "-ss", f"{start:.3f}", "-i", path, "-an",
                                   "-vf", vf, "-frames:v", str(need), "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
                                  stdout=subprocess.PIPE)
        self.last = None; self.read_n = 0
    def _read(self):
        buf = self.p.stdout.read(self.cw * self.ch * 3)
        if len(buf) == self.cw * self.ch * 3:
            self.last = Image.frombytes("RGB", (self.cw, self.ch), buf)
        if self.last is None:
            self.last = Image.new("RGB", (self.cw, self.ch), (0, 0, 0))
        self.read_n += 1
        return self.last
    def cam(self, img, k):
        """Crop a moving window out of the slightly oversized frame."""
        q = k / max(1, self.n - 1); p = ease_io(q) * 0.6 + q * 0.4
        bw, bh = img.size; smin = 1 / (1 + self.drift)
        if self.move == "push":   s = 1 - (1 - smin) * p; cx, cy = 0.5, 0.5
        elif self.move == "pull": s = smin + (1 - smin) * p; cx, cy = 0.5, 0.5
        elif self.move == "rise": s = smin; cx, cy = 0.5, 0.5 + (1 - smin) * (0.5 - p)
        else:
            s = smin; d = (1 - smin) * (p - 0.5)
            cx, cy = (0.5 + d if self.move == "pan_r" else 0.5 - d), 0.5
        w, h = bw * s, bh * s
        x0 = min(max(0.0, cx * bw - w / 2), bw - w); y0 = min(max(0.0, cy * bh - h / 2), bh - h)
        return img.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + w, y0 + h))   # lanczos keeps the detail bilinear smears
    def frame(self, k):
        if self.curve:
            # read forward to this output frame's source position; average what we pass (motion blur)
            target = int(self.curve[min(k + 1, len(self.curve) - 1)])
            got = []
            while self.read_n <= target:
                got.append(self._read())
            if not got:
                img = self.last if self.last is not None else self._read()
            elif len(got) == 1:
                img = got[0]
            else:
                got = got[-5:]
                acc = sum(np.asarray(g, dtype=np.float32) for g in got) / len(got)
                img = Image.fromarray(acc.astype(np.uint8))
        else:
            img = self._read()
        return self.cam(img, k)
    def close(self):
        try: self.p.stdout.close(); self.p.kill()
        except Exception: pass

# ---------------------------------------------------------------- grade
def make_vignette(strength=0.38):
    v = Image.radial_gradient("L").resize((W, H), Image.BILINEAR)   # 0 center -> 255 edge
    return v.point(lambda x: int(255 - max(0, x - 70) * strength)).convert("RGB")

# Color looks, so each video in a Reel pack has its own feel.
# contrast, brightness lift, saturation, (r, g, b) gains, vignette strength
GRADES = {
    "natural": (1.05, 2, 1.06, (1.00, 1.00, 1.00), 0.38),
    "warm":    (1.06, 3, 1.08, (1.05, 1.01, 0.93), 0.40),
    "punchy":  (1.14, 0, 1.18, (1.01, 1.00, 0.99), 0.48),
    "cool":    (1.07, 2, 0.98, (0.96, 1.00, 1.05), 0.36),
    "bright":  (1.00, 10, 1.04, (1.01, 1.01, 1.00), 0.18),
    "film":    (0.96, 6, 0.90, (1.03, 1.00, 0.95), 0.45),
}

class Grade:
    def __init__(self, name):
        c, lift, sat, gains, vig = GRADES.get(name or "natural", GRADES["natural"])
        self.lut = []
        for g in gains:
            self.lut += [max(0, min(255, int(((v - 128) * c + 128 + lift) * g))) for v in range(256)]
        self.sat = sat; self.vign = make_vignette(vig)
    def __call__(self, img):
        img = img.point(self.lut)
        if abs(self.sat - 1) > 0.01:
            img = ImageEnhance.Color(img).enhance(self.sat)
        return ImageChops.multiply(img, self.vign)

# ---------------------------------------------------------------- render

# ---- fast pace: short shots, cut on the beat ---------------------------------------------------
FAST_SPEED = 1.35          # camera moves play a little quicker so short shots still feel like motion
FAST_SHOT = 1.7            # target seconds per shot (snapped to the music's beat)
FAST_TITLE = 2.9           # the opening shot stays long enough to read the title

def beat_grid(music):
    """(seconds per beat, time of the first strong beat) for a music file, or None. Spectral-flux onsets +
    autocorrelation: plenty for snapping cuts to the beat of a pop/house/cinematic track."""
    import numpy as np
    try:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", music, "-t", "75", "-ac", "1", "-ar", "11025", "-f", "f32le", "-"],
                             capture_output=True, check=True).stdout
        x = np.frombuffer(raw, dtype=np.float32)
        hop, win, sr = 256, 1024, 11025
        if len(x) < sr * 8: return None
        frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop] * np.hanning(win)
        spec = np.abs(np.fft.rfft(frames, axis=1))
        mag = np.log1p(spec)
        flux = np.maximum(0, np.diff(mag, axis=0)).sum(axis=1)
        flux = (flux - flux.mean()) / (flux.std() + 1e-9)
        # the kick drum marks the beats people feel (hi-hats and house bass sit between them): sharp rises in
        # very-low-frequency energy, at a finer time step than the tempo search
        kf = np.lib.stride_tricks.sliding_window_view(x, 512)[::128] * np.hanning(512)
        low = np.abs(np.fft.rfft(kf, axis=1))[:, :8].sum(axis=1)
        kick = np.maximum(0, np.diff(low))
        kick = (kick - kick.mean()) / (kick.std() + 1e-9)
        kfps = sr / 128
        fps = sr / hop
        lags = np.arange(int(fps * 60 / 180), int(fps * 60 / 70) + 1)        # 70..180 BPM
        ac = np.array([np.dot(flux[:-l], flux[l:]) for l in lags])
        lag = lags[int(np.argmax(ac))]
        # refine to a fraction of a frame with a parabola through the peak
        k = int(np.argmax(ac))
        if 0 < k < len(ac) - 1:
            a, b, c = ac[k - 1], ac[k], ac[k + 1]
            lag = lag + 0.5 * (a - c) / (a - 2 * b + c + 1e-9)
        period = lag / fps
        klag = period * kfps
        n = int(len(kick) / klag) - 1
        best, phase = -1e9, 0.0
        for off in np.arange(0, klag, 0.5):
            idx = (off + klag * np.arange(n)).astype(int)
            v = np.maximum(kick[idx], np.maximum(kick[np.maximum(idx - 1, 0)], kick[np.minimum(idx + 1, len(kick) - 1)])).sum()
            if v > best: best, phase = v, off / kfps
        return float(period), float(phase)
    except Exception:
        return None

def fast_cuts(n_shots, music):
    """Cut times (seconds) for n shots: the first after FAST_TITLE, then every k beats (~FAST_SHOT each)."""
    grid = beat_grid(music) if music and os.path.exists(music) else None
    period, phase = grid if grid else (FAST_SHOT, 0.0)
    k = max(1, round(FAST_SHOT / period))
    if period * k < 1.25: k += 1
    step = period * k
    t = phase
    while t < FAST_TITLE: t += period              # first cut lands on a beat
    cuts = [t]
    for _ in range(n_shots - 1):
        cuts.append(cuts[-1] + step)
    if n_shots > 1 and cuts[-1] - cuts[-2] < 2.2:  # let the last room breathe before the outro
        cuts[-1] = cuts[-2] + step * 2 if step < 1.5 else cuts[-2] + step + period
    return cuts

def build_timeline(job, base):
    shots = job["shots"]
    fast = job.get("pace") == "fast"
    set_transition("cut" if fast else job.get("transition", "crossfade"))
    ramped = TRANSITIONS[TRANSITION]["ramp"] > 0
    last = len(shots) - 1
    if fast:
        return fast_timeline(job, base, shots)
    segs = []
    for i, s in enumerate(shots):
        r_in, r_out = ramped and i > 0, ramped and i < last
        path = os.path.join(base, s["path"])
        ext = os.path.splitext(path)[1].lower()
        if ext in VIDEO_EXT:
            dur_src = probe_duration(path)
            start = float(s.get("trim_start", 0))
            speed = max(0.5, min(2.5, float(s.get("speed") or 1.0)))   # 0.8 = slow motion, 1.8 = fast forward
            d = float(s.get("duration") or min(max(dur_src - start, 1.0), 6.0))
            if s.get("keep"):   # auto-trim: stop before the camera pushes into dead space
                d = min(d, max(1.2, (float(s["keep"]) - start) / speed))
            avail = max(dur_src - start, 1.0) * FPS - 2          # source frames we can use
            n = int(min(d * FPS, avail / speed - (ramp_extra(r_in, r_out) if ramped else 0)))
            d = max(1.2, n / FPS)
            segs.append(dict(kind="clip", path=path, start=start, dur=d, shot=s, r_in=r_in, r_out=r_out, speed=speed))
        else:
            d = float(s.get("duration") or (5.2 if i == 0 else 3.8))
            segs.append(dict(kind="photo", path=path, dur=d, shot=s, r_in=r_in, r_out=r_out))
    xf = int(XF * FPS)
    f = 0
    for sg in segs:
        sg["n"] = int(round(sg["dur"] * FPS))
        sg["f0"] = f
        f += sg["n"] - xf
    total_f = segs[-1]["f0"] + segs[-1]["n"]
    return segs, total_f


def fast_timeline(job, base, shots):
    """Fast pace: every shot is short and every cut lands on the beat. Uses each clip's opening seconds
    (sped up a little), so it needs no new clips."""
    music = job.get("music")
    music = music if music and os.path.isabs(music) else (os.path.join(base, music) if music else None)
    cuts = fast_cuts(len(shots), music)
    segs, prev_f = [], 0
    for i, s in enumerate(shots):
        f_end = int(round(cuts[i] * FPS))
        n = max(int(1.0 * FPS), f_end - prev_f)
        d = n / FPS
        path = os.path.join(base, s["path"])
        if os.path.splitext(path)[1].lower() in VIDEO_EXT:
            start = float(s.get("trim_start", 0))
            src = max(probe_duration(path) - start, 1.0) - 2 / FPS
            if s.get("keep"): src = min(src, float(s["keep"]) - start)
            speed = max(0.6, min(FAST_SPEED * float(s.get("speed") or 1.0), src / d))
            # skip a little of the slow ease-in at the clip's start, where the camera is barely moving
            start += max(0.0, min(0.6, (src - d * speed) * 0.35))
            segs.append(dict(kind="clip", path=path, start=start, dur=d, shot=s, r_in=False, r_out=False, speed=speed, n=n, f0=prev_f))
        else:
            segs.append(dict(kind="photo", path=path, dur=d, shot=s, r_in=False, r_out=False, n=n, f0=prev_f))
        if i > 0: s["sub"] = ""          # one short label per shot; no time to read a second line
        prev_f += n
    return segs, prev_f

def render(job_path, out_path, stills_dir=None, preview=None, fmt=None):
    job = json.load(open(job_path))
    set_format(fmt or job.get("format", "16:9"))
    base = os.path.dirname(os.path.abspath(job_path))
    ag = job.setdefault("agent", {})
    for k in ("headshot", "logo"):
        if ag.get(k): ag[k] = os.path.join(base, ag[k])
    tpl = TEMPLATES[int(job.get("template", 1))](job)
    segs, body_f = build_timeline(job, base)
    outro_mode = job.get("outro", "branded")
    outro_f = int(5.0 * FPS) if outro_mode in ("branded", "simple") else 0
    total_f = body_f + outro_f
    xf = int(XF * FPS)

    # overlays
    els = []
    s0 = segs[0]
    els += tpl.title(0.35, (s0["f0"] + s0["n"] - xf) / FPS - ANIM - 0.25)
    nfeat = len(segs) - 1
    for i, sg in enumerate(segs[1:], start=1):
        if not (sg["shot"].get("label") or sg["shot"].get("sub")): continue
        t0 = sg["f0"] / FPS + XF * 0.6
        if sg["shot"].get("label_delay"):   # transforming shots: wait until the room has changed
            t0 = sg["f0"] / FPS + sg["n"] / FPS * float(sg["shot"]["label_delay"])
        t1 = (sg["f0"] + sg["n"] - (xf if i < len(segs) - 1 else 0)) / FPS - ANIM - 0.15
        if i == len(segs) - 1 and outro_f: t1 = (sg["f0"] + sg["n"]) / FPS - ANIM - 0.1
        els += tpl.feature(i, nfeat, sg["shot"], t0, t1)
    if outro_f:
        tpl.in_outro = True
        els += tpl.outro(body_f / FPS + 0.55)
        tpl.in_outro = False

    grade = Grade(job.get("grade"))
    drift = float(job.get("drift", 0.07))
    sources = {}
    def get_src(i):
        if i not in sources:
            sg = segs[i]
            curve = speed_curve(sg["n"], sg.get("r_in"), sg.get("r_out")) if (sg.get("r_in") or sg.get("r_out")) else None
            sp = sg.get("speed", 1.0)
            if sp != 1.0:
                curve = [v * sp for v in (curve or range(sg["n"] + 1))]
            focus = (sg.get("shot") or {}).get("focus")
            if sg["kind"] == "photo": sources[i] = PhotoSource(sg["path"], sg["n"], MOVES[i % len(MOVES)], curve, focus)
            else:
                mv = sg["shot"].get("drift_move") or DRIFTS[(i + int(job.get("drift_offset", 0))) % len(DRIFTS)]
                sources[i] = ClipSource(sg["path"], sg["start"], sg["n"], curve, mv, drift, focus,
                                        (sg.get("shot") or {}).get("crop"))
        return sources[i]

    frames_to_do = range(total_f) if preview is None else preview
    enc = None
    if out_path:
        music = job.get("music")
        music = os.path.join(base, music) if music else None
        total_s = total_f / FPS
        cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
               "-r", str(FPS), "-i", "-"]
        if music and os.path.exists(music):
            cmd += ["-stream_loop", "-1", "-i", music]
            # even out loudness across tracks (and customer uploads), then fade in and out
            af = (f"aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:{total_s:.3f},"
                  f"afade=t=in:d=0.4,afade=t=out:st={max(0, total_s - 2.5):.3f}:d=2.5")
        else:
            cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
            af = f"atrim=0:{total_s:.3f}"
        cmd += ["-filter_complex", f"[0:v]noise=alls=3:allf=t,format=yuv420p[v];[1:a]{af}[a]",
                "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-maxrate", "8M", "-bufsize", "16M", "-threads", "2", "-x264-params", "rc-lookahead=15:sliced-threads=0",
                "-profile:v", "high", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                "-t", f"{total_s:.3f}", "-movflags", "+faststart", out_path]
        enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    last_bg = None; frozen = None; frozen_blur = None
    for fi in frames_to_do:
        t = fi / FPS
        if fi < body_f:
            active = [i for i, sg in enumerate(segs) if sg["f0"] <= fi < sg["f0"] + sg["n"]]
            bg = None
            for i in active:
                fr = get_src(i).frame(fi - segs[i]["f0"])
                if segs[i].get("r_in") or segs[i].get("r_out"):
                    fr = ramp_fx(fr, ramp_intensity(fi - segs[i]["f0"], segs[i]["n"], segs[i].get("r_in"), segs[i].get("r_out")))
                if bg is None: bg = fr
                else:
                    a = (fi - segs[i]["f0"] + 1) / (xf + 1)
                    bg = Image.blend(bg, fr, ease_io(a))
                    if TRANSITION == "flash":  # soft white bloom peaking mid-dissolve
                        bg = Image.blend(bg, Image.new("RGB", (W, H), (255, 252, 246)), 0.6 * math.sin(math.pi * a))
            for i in list(sources):
                if fi >= segs[i]["f0"] + segs[i]["n"] - 1 and i not in active[-1:]:
                    sources[i].close(); del sources[i]
            bg = grade(bg)
            last_bg = bg
        else:
            if frozen is None:
                frozen = last_bg
                frozen_blur = ImageEnhance.Brightness(frozen.filter(ImageFilter.GaussianBlur(16))).enhance(0.82)
            p = ease_io((fi - body_f) / (0.9 * FPS))
            bg = Image.blend(frozen, frozen_blur, p)
            z = 1 + 0.10 * ((fi - body_f) / max(1, outro_f))    # slow push so the outro never sits still
            cw, ch = W / z, H / z
            bg = bg.resize((W, H), Image.BILINEAR, box=((W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2))
        frame = bg.convert("RGBA")
        if tpl.letterbox:
            d = ImageDraw.Draw(frame)
            d.rectangle([0, 0, W, tpl.letterbox], fill=(0, 0, 0, 255))
            d.rectangle([0, H - tpl.letterbox, W, H], fill=(0, 0, 0, 255))
        for e in els:
            e.draw(frame, t, bg)
        if hasattr(tpl, "overlay"):
            tpl.overlay(frame, t)
        # fade to black at the very end only (never fade up at the start)
        tail = total_f - fi
        if tail <= int(0.8 * FPS):
            frame = Image.blend(frame, Image.new("RGBA", (W, H), (0, 0, 0, 255)), 1 - tail / (0.8 * FPS))
        rgb = frame.convert("RGB")
        if stills_dir and (preview is not None):
            rgb.save(os.path.join(stills_dir, f"f{fi:05d}.jpg"), quality=88)
        if enc:
            enc.stdin.write(rgb.tobytes())
        if fi % 150 == 0 and preview is None:
            print(f"  frame {fi}/{total_f}", flush=True)
    for s in sources.values(): s.close()
    if enc:
        enc.stdin.close(); enc.wait()
        if enc.returncode != 0: raise SystemExit("ffmpeg encode failed")
    return segs, total_f

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("job"); ap.add_argument("out", nargs="?")
    ap.add_argument("--stills", help="save sample stills to this folder instead of encoding")
    ap.add_argument("--format", choices=["16:9", "9:16"], help="override the job's format")
    a = ap.parse_args()
    if a.stills:
        os.makedirs(a.stills, exist_ok=True)
        job = json.load(open(a.job)); base = os.path.dirname(os.path.abspath(a.job))
        segs, body_f = build_timeline(job, base)
        outro_f = 150 if job.get("outro", "branded") != "none" else 0
        picks = [0, 75] + [sg["f0"] + sg["n"] // 2 for sg in segs[1:3]] + ([body_f + 120] if outro_f else [])
        render(a.job, None, a.stills, preview=sorted(set(picks)), fmt=a.format)
    else:
        render(a.job, a.out, fmt=a.format)
