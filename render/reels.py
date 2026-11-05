"""The Reel pack: one listing becomes several short videos, each cut for a different post.

build_pack(job, listing) returns a list of dicts:
    {"kind", "fmt", "job"}   job = a render.py job (same shape as the full tour's)
"""
import copy

# Shown to the realtor in the app, in this order.
REEL_KINDS = {
    "tour":         "Full walkthrough",
    "teaser":       "15-second teaser",
    "just_listed":  "Just Listed",
    "price_reveal": "Guess the price",
    "top_features": "Top features",
    "open_house":   "Open house",
    "build_up":     "Built from the ground up",
    "staged":       "Virtually staged",
}


# Opening lines for the teaser Reel (the realtor picks one). {beds} {city} {price} fill in from the listing.
HOOKS = {
    "inside":   "Wait till you see inside",
    "pov":      "POV: you just found your dream home",
    "would":    "Would you live here?",
    "hit":      "This just hit the market",
    "tour":     "Tour this {beds}-bed home in {city}",
    "rate":     "Rate this home 1 to 10",
    "under":    "What {price} gets you in {city}",
    "backyard": "Wait for the backyard",
}

def hook_text(hid, job):
    t = HOOKS.get(hid or "", HOOKS["inside"])
    st = job.get("stats") or {}
    city = (job.get("city_line") or "").split(",")[0].strip()
    vals = {"beds": st.get("beds"), "city": city, "price": fmt_price(st.get("price"))}
    if any(f"{{{k}}}" in t and not v for k, v in vals.items()):
        return HOOKS["inside"]                      # missing detail: fall back to a hook that always works
    return t.format(**{k: (int(v) if isinstance(v, float) and v == int(v) else v) for k, v in vals.items()})


def fmt_price(p):
    if p in (None, ""):
        return ""
    s = str(p).strip()
    try:
        n = float(s.replace("$", "").replace(",", ""))
        return f"${n:,.0f}"
    except ValueError:
        return s if s.startswith("$") else s


def pick(shots, n):
    """The first (hero) shot plus n-1 more spread evenly through the rest."""
    if len(shots) <= n:
        return list(shots)
    rest = shots[1:]
    step = len(rest) / (n - 1)
    return [shots[0]] + [rest[int(i * step)] for i in range(n - 1)]


# ---------------------------------------------------------------- room roles (keep in sync with web/src/lib/pack.ts)
ROLES = [
    ("exterior", ("front", "exterior", "curb", "street", "facade", "elevation", "aerial", "drone")),
    ("outdoor", ("pool", "yard", "patio", "backyard", "deck", "garden", "view", "outdoor", "porch")),
    ("kitchen", ("kitchen", "island", "pantry")),
    ("living", ("living", "family", "great room", "den", "dining", "entry", "foyer")),
    ("bed", ("bed", "suite", "primary", "master")),
    ("bath", ("bath", "shower", "tub")),
]

def role(shot, i=1):
    t = f"{shot.get('label') or ''} {shot.get('sub') or ''}".lower()
    for r, words in ROLES:
        if any(w in t for w in words):
            return r
    return "exterior" if i == 0 else "other"

def by_roles(shots, wanted, n):
    """Hero first, then the first shot of each wanted room type, then fill with the rest in order."""
    hero, rest = shots[0], list(shots[1:])
    out = []
    for r in wanted:
        for s in rest:
            if s not in out and role(s) == r:
                out.append(s); break
    for s in rest:
        if len(out) >= n - 1: break
        if s not in out: out.append(s)
    out = out[:n - 1]
    return [hero] + out


TRANSFORM = ("build", "staging", "dusk")

def cut(shots, dur, labels=True, trim=0.0, speed=1.0):
    """dur: seconds per shot, or a list (one per shot). speed: 0.8 = slow motion, 1.3 = punchy."""
    out = []
    for k, s in enumerate(shots):
        s = dict(s)
        d = dur[min(k, len(dur) - 1)] if isinstance(dur, (list, tuple)) else dur
        s["duration"] = d
        s["speed"] = speed
        if trim and str(s.get("path", "")).lower().endswith(".mp4"):
            s["trim_start"] = trim
        if s.get("effect") in TRANSFORM:
            s.pop("trim_start", None)
            if d < 4.8:   # a short cut plays the whole transformation fast, so it always moves
                s["speed"] = min(2.2, 4.85 / d)
                s.pop("label_delay", None)
        if not labels:
            s["label"] = ""; s["sub"] = ""
        out.append(s)
    if out:
        out[0]["label"] = ""; out[0]["sub"] = ""   # title card sits over the first shot
    return out


# ---------------------------------------------------------------- the styles
# Each video in the pack has its own look: text style (template), pacing, transitions, color and order.
# template: the realtor's own pick is kept for the full walkthrough; the others rotate through ALT_TEMPLATES.
STYLES = {
    "teaser":       dict(template=3,  transition="speed_ramp", grade="punchy",  drift=0.10, speed=1.3),
    "just_listed":  dict(template=10, transition="crossfade",  grade="film",    drift=0.05, speed=0.8),
    "price_reveal": dict(template=4,  transition="cut",        grade="cool",    drift=0.08, speed=1.0),
    "top_features": dict(template=6,  transition="crossfade",  grade="bright",  drift=0.06, speed=0.85),
    "open_house":   dict(template=8,  transition="flash",      grade="warm",    drift=0.07, speed=1.0),
    "build_up":     dict(template=5,  transition="speed_ramp", grade="natural", drift=0.06, speed=1.0),
    "staged":       dict(template=7,  transition="crossfade",  grade="bright",  drift=0.05, speed=0.9),
}
ALT_TEMPLATES = [1, 2, 9, 3, 4, 6, 8, 10, 5, 7]


def build_pack(job, listing):
    shots = job["shots"]
    address = job.get("address") or ""
    where = address or job.get("city_line") or ""
    price = fmt_price((job.get("stats") or {}).get("price"))
    if price:  # show "$485,000", not "485000", on every video
        job = copy.deepcopy(job); job["stats"] = dict(job.get("stats") or {}, price=price)
    head = "" if where == address else where   # the address is the headline by default; don't print it twice
    mine = int(job.get("template") or 1)
    used = {mine}
    pack = []

    # 1. The full walkthrough: the realtor's own look, every photo in their order.
    for fmt in listing.get("formats") or ["16:9"]:
        pack.append({"kind": "tour", "fmt": fmt, "job": dict(job, grade="natural", drift=0.05)})
    if len(shots) < 3:
        return pack

    def variant(kind, n_off, **kw):
        st = dict(STYLES[kind])
        tpl = st.pop("template")
        if tpl in used:   # never repeat a text style inside one pack
            tpl = next((t for t in ALT_TEMPLATES if t not in used), tpl)
        used.add(tpl)
        speed = st.pop("speed")
        j = copy.deepcopy(job)
        j.update(st, template=tpl, drift_offset=n_off)
        j.update(kw)
        if "shots" in kw:
            j["shots"] = [dict(sh, speed=sh.get("speed", speed)) for sh in kw["shots"]]
        return j

    # 2. Teaser: fast, punchy, speed ramps, no room labels. Hook line up top, ends on "see the full tour".
    pack.append({"kind": "teaser", "fmt": "9:16", "job": variant("teaser", 1,
        shots=cut(pick(shots, 6), 2.0, labels=False, trim=0.5, speed=1.3),
        kicker=hook_text(listing.get("hook"), job), headline=head,
        outro="simple", outro_kicker="See the full tour", outro_headline=where,
    )})

    # 3. Just Listed: cinematic slow motion with letterbox bars. Front, living, kitchen, suite, outdoors.
    pack.append({"kind": "just_listed", "fmt": "9:16", "job": variant("just_listed", 2,
        shots=cut(by_roles(shots, ["living", "kitchen", "bed", "outdoor"], 5), 3.8, speed=0.8),
        kicker="Just listed", headline=job.get("headline", ""),
    )})

    # 4. Guess the price: quick cuts that speed up, interiors first, the front of the home last, then the price.
    if price:
        stats = dict(job.get("stats") or {}); stats["price"] = None
        inside = [s for s in shots[1:] if role(s) != "exterior"]
        seq = pick([shots[0]] + inside, 6)
        seq = seq[1:] + seq[:1] if len(seq) > 2 else seq     # save the front of the home for the reveal
        pack.append({"kind": "price_reveal", "fmt": "9:16", "job": variant("price_reveal", 3,
            shots=cut(seq, [3.0, 2.5, 2.1, 1.8, 1.6, 2.6]), stats=stats,
            kicker="Guess the price", headline=head,
            outro="simple", outro_kicker="Listed at", outro_headline=price,
        )})

    # 5. Top features: a numbered list of the rooms the realtor labeled, slow and bright.
    labeled = [s for s in shots[1:] if (s.get("label") or "").strip()]
    if len(labeled) >= 3:
        feats = labeled[:5]
        pack.append({"kind": "top_features", "fmt": "9:16", "job": variant("top_features", 4,
            shots=cut([shots[0]] + feats, 3.6, speed=0.85),
            kicker=f"{len(feats)} things we love", headline=head,
        )})

    # 6. Built from the ground up: every construction shot, each played through in full.
    built = [s for s in shots if s.get("effect") == "build"]
    if len(built) >= 2:
        pack.append({"kind": "build_up", "fmt": "9:16", "job": variant("build_up", 0,
            shots=cut(built, 5.0), kicker="From the ground up", headline=head,
        )})

    # 7. Virtually staged: the empty rooms furnishing themselves.
    staged = [s for s in shots if s.get("effect") == "staging"]
    if len(staged) >= 2:
        pack.append({"kind": "staged", "fmt": "9:16", "job": variant("staged", 1,
            shots=cut(staged, 5.0), kicker="Imagine living here", headline=head,
        )})

    # 8. Open house: warm, light-flash cuts, the outdoor spaces first. Only when a date is entered.
    oh = (listing.get("open_house") or "").strip()
    if oh:
        pack.append({"kind": "open_house", "fmt": "9:16", "job": variant("open_house", 2,
            shots=cut(by_roles(shots, ["outdoor", "kitchen", "living", "bed", "bath"], 6), 2.8),
            kicker="Open house", headline=oh,
            outro="simple", outro_kicker="Open house", outro_headline=oh,
        )})

    return pack
