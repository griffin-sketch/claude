import { randomUUID } from "node:crypto";
import { admin, fail, HttpError, requireUser } from "@/lib/server";
import { MAX_PHOTOS } from "@/lib/config";
import { ImportError, photosFromLink, photosFromUrls } from "@/lib/photoImport";

export const maxDuration = 120;

/**
 * Bring listing photos in from elsewhere, into one of the caller's listings.
 * body: { listingId, link }       a Dropbox / Google Drive / photographer link
 *       { listingId, urls, page } image addresses the Send to Tourvo button found on a listing page
 * Both need { consent: true }: the realtor confirms the photos are hers to use.
 * Fills the listing up to its photo limit, in the photographer's order. Returns { added, more }.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as { listingId?: string; link?: string; urls?: string[]; page?: string; consent?: boolean };
    if (!body.consent) throw new HttpError(400, "Please confirm you have the right to use these photos.");
    const db = admin();

    const { data: listing } = await db.from("listings").select("id, status").eq("id", body.listingId ?? "").eq("user_id", user.id).single();
    if (!listing) throw new HttpError(404, "Listing not found.");
    if (!["draft", "failed"].includes(listing.status)) throw new HttpError(409, "Photos can only be added before the videos are made.");

    const { data: existing } = await db.from("shots").select("position").eq("listing_id", listing.id);
    const room = MAX_PHOTOS - (existing?.length ?? 0);
    if (room <= 0) throw new HttpError(409, `This listing already has ${MAX_PHOTOS} photos. Remove some to import more.`);

    let photos;
    try {
      if (body.link?.trim()) photos = await photosFromLink(body.link, room + 1);
      else if (body.urls?.length) photos = await photosFromUrls(body.urls.filter((u) => typeof u === "string"), room + 1);
      else throw new HttpError(400, "Paste a link to your photos.");
    } catch (e) {
      if (e instanceof ImportError) throw new HttpError(422, e.message);
      throw e;
    }
    if (!photos.length) throw new HttpError(422, "No listing photos found there.");
    const more = photos.length > room;   // there were more photos than room on the listing
    photos = photos.slice(0, room);

    const pos = existing?.length ? Math.max(...existing.map((s) => s.position)) + 1 : 0;
    let added = 0;
    for (let i = 0; i < photos.length; i += 4) {
      const batch = photos.slice(i, i + 4).map((p, j) => ({ p, position: pos + i + j }));
      await Promise.all(batch.map(async ({ p, position }) => {
        const path = `${user.id}/${listing.id}/${randomUUID()}.${p.ext}`;
        const up = await db.storage.from("photos").upload(path, p.data, { contentType: p.type });
        if (up.error) return;
        const { error } = await db.from("shots").insert({ listing_id: listing.id, position, photo_path: path, label: "" });
        if (error) await db.storage.from("photos").remove([path]);
        else added++;
      }));
    }
    if (!added) throw new HttpError(500, "Couldn't save the photos. Please try again.");

    // put them back in a tidy 0..n order (a failed upload can leave a gap)
    const { data: all } = await db.from("shots").select("id, position").eq("listing_id", listing.id).order("position");
    await Promise.all((all ?? []).map((s, i) => (s.position === i ? null : db.from("shots").update({ position: i }).eq("id", s.id))));

    return Response.json({ added, more });
  } catch (e) {
    return fail(e);
  }
}
