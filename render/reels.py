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
}


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


def cut(shots, dur, labels=True, trim=0.0):
    out = []
    for s in shots:
        s = dict(s)
        s["duration"] = dur
        if trim and str(s.get("path", "")).lower().endswith(".mp4"):
            s["trim_start"] = trim
        if not labels:
            s["label"] = ""; s["sub"] = ""
        out.append(s)
    if out:
        out[0]["label"] = ""; out[0]["sub"] = ""   # title card sits over the first shot
    return out


def build_pack(job, listing):
    shots = job["shots"]
    address = job.get("address") or ""
    where = address or job.get("city_line") or ""
    price = fmt_price((job.get("stats") or {}).get("price"))
    if price:  # show "$485,000", not "485000", on every video
        job = copy.deepcopy(job); job["stats"] = dict(job.get("stats") or {}, price=price)
    # Title line: the address is the headline by default; set it empty so it isn't printed twice.
    head = "" if where == address else where
    pack = []

    # 1. The full walkthrough, in every format the realtor picked.
    for fmt in listing.get("formats") or ["16:9"]:
        pack.append({"kind": "tour", "fmt": fmt, "job": job})

    if len(shots) < 3:
        return pack

    def variant(**kw):
        j = copy.deepcopy(job)
        j.update(kw)
        return j

    # 2. Teaser: fast and punchy, no labels, ends on "see the full tour".
    pack.append({"kind": "teaser", "fmt": "9:16", "job": variant(
        shots=cut(pick(shots, 5), 2.6, labels=False, trim=0.6),
        transition="speed_ramp", kicker="Wait till you see inside", headline=head,
        outro="simple", outro_kicker="See the full tour", outro_headline=where,
    )})

    # 3. Just Listed: the classic announcement with room labels and branding.
    pack.append({"kind": "just_listed", "fmt": "9:16", "job": variant(
        shots=cut(pick(shots, 7), 3.2),
        transition="flash", kicker="Just listed", headline=job.get("headline", ""),
    )})

    # 4. Guess the price: hide it on the title card, reveal it at the end.
    if price:
        stats = dict(job.get("stats") or {}); stats["price"] = None
        pack.append({"kind": "price_reveal", "fmt": "9:16", "job": variant(
            shots=cut(pick(shots, 6), 3.0), stats=stats,
            transition="crossfade", kicker="Guess the price", headline=head,
            outro="simple", outro_kicker="Listed at", outro_headline=price,
        )})

    # 5. Top features: only the rooms the realtor labeled.
    labeled = [s for s in shots[1:] if (s.get("label") or "").strip()]
    if len(labeled) >= 3:
        feats = labeled[:5]
        pack.append({"kind": "top_features", "fmt": "9:16", "job": variant(
            shots=cut([shots[0]] + feats, 3.4),
            transition="cut", kicker=f"{len(feats)} things we love", headline=head,
        )})

    # 6. Open house: only when the realtor entered a date and time.
    oh = (listing.get("open_house") or "").strip()
    if oh:
        pack.append({"kind": "open_house", "fmt": "9:16", "job": variant(
            shots=cut(pick(shots, 6), 3.0),
            transition="crossfade", kicker="Open house", headline=oh,
            outro="simple", outro_kicker="Open house", outro_headline=oh,
        )})

    return pack
