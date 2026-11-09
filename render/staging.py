"""Virtual staging: furniture styles and room types, shared by the staging video effect and staged photos.

Keep STYLES and ROOMS in sync with web/src/lib/config.ts (STAGE_STYLES, STAGE_ROOMS).
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageOps

PHOTO_MODEL = "fal-ai/nano-banana-pro/edit"   # staged photos: best quality, sold at $5 each

STYLES = {
    "modern":       "modern contemporary style: clean lines, a neutral palette of white, warm grey and natural wood, low-profile furniture, abstract art",
    "farmhouse":    "modern farmhouse style: warm whites, natural oak, linen upholstery, black metal accents, woven baskets and greenery",
    "scandinavian": "Scandinavian style: light oak, white and soft grey, cozy wool and linen textiles, simple organic shapes, no clutter",
    "coastal":      "coastal style: airy whites, sand and soft blue tones, rattan and light wood, linen, a relaxed beach-house feel",
    "luxury":       "luxury contemporary style: rich velvet and boucle, marble and brass accents, statement lighting, a refined neutral palette",
    "midcentury":   "mid-century modern style: walnut wood, tapered legs, mustard and teal accents, iconic 1960s silhouettes",
    "industrial":   "industrial loft style: cognac leather, dark metal, reclaimed wood, warm Edison-style lighting, charcoal tones",
    "transitional": "transitional style: classic silhouettes with a fresh neutral palette, upholstered pieces, warm wood, a soft patterned rug",
}

ROOMS = {
    "auto":    ("room", "furniture and decor that suit what this room is (living room, bedroom, dining room, office and so on)"),
    "living":  ("living room", "a sofa, accent chairs, a coffee table, an area rug, side tables with a lamp, wall art and plants"),
    "bedroom": ("bedroom", "a bed with layered bedding and pillows, two nightstands with lamps, an area rug, a dresser and wall art"),
    "dining":  ("dining room", "a dining table with chairs, a centerpiece, an area rug, a sideboard and wall art"),
    "kitchen": ("kitchen", "counter stools at the island or counter, a bowl of fruit, a plant and a few tasteful accessories on the counters"),
    "office":  ("home office", "a desk with a chair, a bookshelf, an area rug, a floor lamp and wall art"),
    "kids":    ("kid's bedroom", "a twin bed with cheerful bedding, a small desk, a soft rug, storage baskets and playful but tasteful art"),
    "outdoor": ("patio", "outdoor lounge seating with cushions, a small dining set, planters with greenery and an outdoor rug"),
}

KEEP = ("Keep the exact same camera position, lens, framing and perspective. Do not change the walls, paint, floors, ceiling, "
        "windows, doors, trim, built-ins, light fixtures, outlets or the view outside. ")

def prompt(style="modern", room="auto"):
    name, furniture = ROOMS.get(room, ROOMS["auto"])
    look = STYLES.get(style, STYLES["modern"])
    return (f"Virtually stage this exact empty {name} in a {look}. Add {furniture}, realistically scaled and placed on the "
            f"floor with correct perspective, contact shadows and the room's existing natural light. {KEEP}"
            "Photorealistic professional real estate photograph. No people, no text, no watermarks.")

_FONT = os.path.join(os.path.dirname(__file__), "engine", "fonts", "dmsans-700.woff")

def preview(src, dest, max_side=1400):
    """A smaller copy with a repeated diagonal TOURVO PREVIEW watermark (the clean full-size one is sold)."""
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    w, h = im.size
    size = max(18, w // 26)
    try:
        font = ImageFont.truetype(_FONT, size)
    except OSError:
        font = ImageFont.load_default()
    tile = Image.new("RGBA", (w * 2, h * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    text = "TOURVO  PREVIEW"
    tw = d.textlength(text, font=font)
    step_x, step_y = int(tw + size * 3), int(size * 4)
    for row, y in enumerate(range(0, h * 2, step_y)):
        for x in range(-step_x + (row % 2) * step_x // 2, w * 2, step_x):
            d.text((x, y), text, font=font, fill=(255, 255, 255, 70), stroke_width=1, stroke_fill=(0, 0, 0, 40))
    tile = tile.rotate(-24, resample=Image.BICUBIC)
    tile = tile.crop((w // 2, h // 2, w // 2 + w, h // 2 + h))
    out = Image.alpha_composite(im.convert("RGBA"), tile).convert("RGB")
    out.save(dest, quality=86)
    return dest
