import { activePlan, admin, fail, HttpError, isAdmin, planCheckout, requireUser, siteUrl } from "@/lib/server";
import { isInterval, isPlan } from "@/lib/plans";
import { MIN_PHOTOS } from "@/lib/config";

/**
 * Start making a listing's clips.
 * body: { listingId, method: "credit" | "subscribe", plan?, interval? }
 *  - credit:    spend one video: the plan's first, then free referral videos
 *  - subscribe: start a plan and use its first video on this listing (returns a Stripe Checkout URL)
 * Admin emails skip payment.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { listingId, method, plan, interval } = (await request.json()) as { listingId?: string; method?: string; plan?: string; interval?: string };
    if (!listingId) throw new HttpError(400, "Missing listing.");
    const db = admin();

    const { data: listing } = await db.from("listings").select("*").eq("id", listingId).eq("user_id", user.id).single();
    if (!listing) throw new HttpError(404, "Listing not found.");
    if (!["draft", "failed"].includes(listing.status)) throw new HttpError(409, "This listing is already in progress.");
    const { count } = await db.from("shots").select("id", { count: "exact", head: true }).eq("listing_id", listingId);
    if (!listing.address?.trim() || (count ?? 0) < MIN_PHOTOS) {
      throw new HttpError(400, `Add the street address and at least ${MIN_PHOTOS} photos first.`);
    }

    const queue = async (paid_via: string) => {
      const { error } = await db
        .from("listings")
        .update({ paid: true, paid_via, status: "queued", error: null })
        .eq("id", listingId);
      if (error) throw error;
      return Response.json({ ok: true });
    };

    if (listing.paid) return queue(listing.paid_via ?? "credit");
    if (isAdmin(user)) return queue("comp");

    if (method === "credit") {
      const { data, error } = await db.rpc("use_credit", { p_listing: listingId, p_user: user.id });
      if (error) throw error;
      if (!data) throw new HttpError(402, "You don't have any videos left. They refill when your plan renews.");
      return Response.json({ ok: true });
    }

    if (method === "subscribe") {
      if (!isPlan(plan) || !isInterval(interval)) throw new HttpError(400, "Pick a plan.");
      if (await activePlan(user.id)) throw new HttpError(409, "You already have a plan. Manage it from Billing.");
      const back = `${siteUrl(request)}/listings/${listingId}`;
      const url = await planCheckout({ user, plan, interval, listingId, successUrl: `${back}?paid=1`, cancelUrl: back });
      return Response.json({ url });
    }

    throw new HttpError(400, "Pick a way to pay.");
  } catch (e) {
    return fail(e);
  }
}
