import type Stripe from "stripe";
import { admin, PRICES, stripe } from "@/lib/server";

/**
 * Stripe → app. Set up in Stripe → Developers → Webhooks with this URL:
 *   https://YOUR-DOMAIN/api/stripe/webhook
 * Events: checkout.session.completed, invoice.paid,
 *         customer.subscription.updated, customer.subscription.deleted
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Missing STRIPE_WEBHOOK_SECRET", { status: 500 });
  const body = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, sig, secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckout(event.data.object as Stripe.Checkout.Session);
        break;
      case "invoice.paid":
        await onInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await onSubscriptionChange(event.data.object as Stripe.Subscription, event.type);
        break;
    }
    return Response.json({ received: true });
  } catch (e) {
    console.error("webhook error", event.type, e);
    return new Response("Webhook handler failed", { status: 500 }); // Stripe retries
  }
}

/** Subscription period end, wherever this API version keeps it. */
function periodEnd(sub: Stripe.Subscription): string | null {
  const s = sub as unknown as { current_period_end?: number; items?: { data?: { current_period_end?: number }[] } };
  const ts = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

async function onCheckout(session: Stripe.Checkout.Session) {
  const db = admin();
  const kind = session.metadata?.kind;
  const listingId = session.metadata?.listing_id;
  const userId = session.metadata?.user_id;
  if (!userId) return;

  if (kind === "single" && listingId && session.payment_status === "paid") {
    const { data: l } = await db.from("listings").select("status, paid").eq("id", listingId).single();
    if (!l || l.paid) return;
    await db
      .from("listings")
      .update({
        paid: true,
        paid_via: "single",
        stripe_session_id: session.id,
        status: ["draft", "failed"].includes(l.status) ? "queued" : l.status,
        error: null,
      })
      .eq("id", listingId);
    return;
  }

  if (kind === "subscribe" && session.subscription) {
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    const sub = await stripe().subscriptions.retrieve(subId);
    const end = periodEnd(sub);
    const { data: prof } = await db.from("profiles").select("plan, credits_period_end").eq("id", userId).single();
    // Stripe can deliver an event twice: only grant this period's videos once.
    const alreadyGranted = prof?.plan === "monthly" && prof.credits_period_end === end;
    await db
      .from("profiles")
      .update({
        stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
        plan: "monthly",
        plan_status: sub.status,
        ...(alreadyGranted ? {} : { credits: PRICES.monthly.credits, credits_period_end: end }),
      })
      .eq("id", userId);
    if (listingId) await db.rpc("use_credit", { p_listing: listingId, p_user: userId });
  }
}

async function onInvoicePaid(invoice: Stripe.Invoice) {
  // Renewals only; the first month is handled at checkout.
  if (invoice.billing_reason !== "subscription_cycle") return;
  const customer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customer) return;
  const subs = await stripe().subscriptions.list({ customer, status: "all", limit: 1 });
  const sub = subs.data[0];
  const end = sub ? periodEnd(sub) : null;
  const db = admin();
  const { data: prof } = await db.from("profiles").select("id, credits_period_end").eq("stripe_customer_id", customer).single();
  if (!prof || (end && prof.credits_period_end === end)) return;
  await db
    .from("profiles")
    .update({ plan: "monthly", plan_status: sub?.status ?? "active", credits: PRICES.monthly.credits, credits_period_end: end })
    .eq("id", prof.id);
}

async function onSubscriptionChange(sub: Stripe.Subscription, type: string) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const db = admin();
  if (type === "customer.subscription.deleted") {
    await db.from("profiles").update({ plan: "none", plan_status: "canceled", credits: 0 }).eq("stripe_customer_id", customer);
  } else {
    await db.from("profiles").update({ plan_status: sub.status }).eq("stripe_customer_id", customer);
  }
}
