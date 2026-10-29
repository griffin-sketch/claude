import { admin, customerFor, fail, HttpError, isAdmin, PRICES, requireUser, siteUrl, stripe } from "@/lib/server";
import { MIN_PHOTOS } from "@/lib/config";

/**
 * Start making a listing's clips.
 * body: { listingId, method: "credit" | "single" | "subscribe" }
 *  - credit:    spend one of this month's 3 videos (subscribers)
 *  - single:    pay $49 for this listing (returns a Stripe Checkout URL)
 *  - subscribe: start the $80/month plan and use its first video on this listing (Checkout URL)
 * Admin emails skip payment.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { listingId, method } = (await request.json()) as { listingId?: string; method?: string };
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

    if (listing.paid) return queue(listing.paid_via ?? "single");
    if (isAdmin(user)) return queue("comp");

    if (method === "credit") {
      const { data, error } = await db.rpc("use_credit", { p_listing: listingId, p_user: user.id });
      if (error) throw error;
      if (!data) throw new HttpError(402, "You don't have any videos left this month.");
      return Response.json({ ok: true });
    }

    const base = siteUrl(request);
    const customer = await customerFor(user);
    const back = `${base}/listings/${listingId}`;

    if (method === "single") {
      const session = await stripe().checkout.sessions.create({
        mode: "payment",
        customer,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: PRICES.single.amount,
              product_data: { name: PRICES.single.name, description: `${PRICES.single.description} · ${listing.address}` },
            },
          },
        ],
        metadata: { kind: "single", listing_id: listingId, user_id: user.id },
        payment_intent_data: { metadata: { listing_id: listingId, user_id: user.id } },
        success_url: `${back}?paid=1`,
        cancel_url: back,
      });
      await db.from("listings").update({ stripe_session_id: session.id }).eq("id", listingId);
      return Response.json({ url: session.url });
    }

    if (method === "subscribe") {
      const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        customer,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: PRICES.monthly.amount,
              recurring: { interval: "month" },
              product_data: { name: PRICES.monthly.name, description: PRICES.monthly.description },
            },
          },
        ],
        metadata: { kind: "subscribe", listing_id: listingId, user_id: user.id },
        subscription_data: { metadata: { user_id: user.id } },
        success_url: `${back}?paid=1`,
        cancel_url: back,
      });
      return Response.json({ url: session.url });
    }

    throw new HttpError(400, "Pick a way to pay.");
  } catch (e) {
    return fail(e);
  }
}
