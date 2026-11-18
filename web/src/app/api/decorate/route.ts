import { admin, fail, HttpError, requireUser } from "@/lib/server";

/** One prompt for every photo: the AI works out what the space is and decorates it to suit. */
const PROMPT =
  "Decorate this real estate photo for Christmas in a tasteful, professionally styled way that suits what the space is. " +
  "Exterior: warm white string lights along the roofline and eaves, a wreath with a red bow on the front door, lit garland around the entry, lights wrapped on small trees. " +
  "Living or family room: a decorated Christmas tree with warm white lights and red, gold and silver ornaments in an open corner with a few wrapped presents, lit garland and stockings on the mantel if there is one, festive throw pillows. " +
  "Kitchen: lit pine garland along the top of the cabinets or range hood, a small festive centerpiece on the island, keep the counters mostly clear. " +
  "Dining room: a festive table centerpiece with candles and greenery. Bedroom: a plaid throw and festive pillows on the bed, a small lit tabletop tree. " +
  "Bathroom: holiday hand towels and a small wreath, minimal. Backyard or aerial: string lights on the roofline, patio and trees. " +
  "If the room is empty, do not add furniture; only add a few decorations. " +
  "Keep the walls, paint, floors, ceiling, windows, doors, cabinets, countertops, fixtures, furniture, layout, landscaping, sky and camera angle exactly the same. " +
  "No snow, people, pets, text or signs. Photorealistic real estate photograph.";

/**
 * "Decorate for the holidays" on a listing's photos (before the clips are made).
 * body: { listingId }                -> decorate every photo not decorated yet (or { shotIds } for some)
 *       { listingId, check: true }   -> { pending } photos still being decorated
 *       { listingId, undo: shotId }  -> put a photo's original back
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as { listingId?: string; check?: boolean; undo?: string; shotIds?: string[] };
    const db = admin();
    const { data: listing } = await db.from("listings").select("id, status").eq("id", body.listingId ?? "").eq("user_id", user.id).single();
    if (!listing) throw new HttpError(404, "Listing not found.");
    const { data: shots } = await db.from("shots").select("id, photo_path, original_photo_path").eq("listing_id", listing.id);
    const ids = (shots ?? []).map((s) => s.id);
    const pendingOf = async () => {
      if (!ids.length) return 0;
      const { count } = await db.from("ai_edits").select("id", { count: "exact", head: true }).in("shot_id", ids).in("status", ["queued", "processing"]);
      return count ?? 0;
    };

    if (body.check) return Response.json({ pending: await pendingOf() });

    if (!["draft", "failed"].includes(listing.status)) throw new HttpError(409, "Photos can only be changed before the clips are made.");

    if (body.undo) {
      const sh = (shots ?? []).find((s) => s.id === body.undo);
      if (!sh?.original_photo_path) throw new HttpError(400, "That photo isn't decorated.");
      await db.from("shots").update({ photo_path: sh.original_photo_path, original_photo_path: null }).eq("id", sh.id);
      return Response.json({ ok: true });
    }

    const want = (shots ?? []).filter((s) => !s.original_photo_path && (!body.shotIds || body.shotIds.includes(s.id)));
    if (!want.length) throw new HttpError(400, "Every photo is already decorated.");
    if ((await pendingOf()) > 0) throw new HttpError(409, "Your photos are already being decorated.");
    // no more than 3 tries per photo, so a listing can't run up AI costs
    const { data: tries } = await db.from("ai_edits").select("shot_id").in("shot_id", want.map((s) => s.id));
    const n = new Map<string, number>();
    (tries ?? []).forEach((t) => n.set(t.shot_id, (n.get(t.shot_id) ?? 0) + 1));
    const go = want.filter((s) => (n.get(s.id) ?? 0) < 3);
    if (!go.length) throw new HttpError(429, "You've decorated these photos as many times as we allow.");
    const { error } = await db.from("ai_edits").insert(go.map((s) => ({ user_id: user.id, source_path: s.photo_path, prompt: PROMPT, shot_id: s.id })));
    if (error) throw new HttpError(500, error.message.includes("shot_id") ? "Holiday decor isn't set up yet (migration 0018)." : "Couldn't start decorating.");
    return Response.json({ started: go.length });
  } catch (e) {
    return fail(e);
  }
}
