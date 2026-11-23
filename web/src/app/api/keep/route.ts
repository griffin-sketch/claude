import { admin, fail, HttpError, requireUser } from "@/lib/server";

/**
 * Back out of "Make changes": the listing returns to its finished videos, untouched. body: { listingId }.
 * Only while it's in review and still has the videos from the last build. (Server-side, because the database
 * only lets realtors move a listing forward through its steps.)
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { listingId } = (await request.json().catch(() => ({}))) as { listingId?: string };
    const db = admin();
    const { data: l } = await db.from("listings").select("id, status").eq("id", listingId ?? "").eq("user_id", user.id).single();
    if (!l) throw new HttpError(404, "Listing not found.");
    if (l.status !== "review") throw new HttpError(409, "This listing isn't being changed.");
    const { count } = await db.from("renders").select("id", { count: "exact", head: true }).eq("listing_id", l.id);
    if (!count) throw new HttpError(409, "There are no finished videos to go back to yet.");
    const { error } = await db.from("listings").update({ status: "done", error: null }).eq("id", l.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
