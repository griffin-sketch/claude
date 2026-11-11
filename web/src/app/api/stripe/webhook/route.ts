import type Stripe from "stripe";
import { admin, stripe } from "@/lib/server";
import { grant, isInterval, isPlan, LEGACY_MONTHLY } from "@/lib/plans";

/**
 * Stripe → app. Set up in Stripe → Developers → Webhooks with this URL:
 *   https://YOUR-DOMAIN/api/stripe/webhook
 * Events: checkout.session.completed, invoice.paid,
 *         customer.subscription.updated, customer.subscription.deleted
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim(); // tolerate stray spaces from pasting
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

  if (kind === "staging" && session.payment_status === "paid") {
    const ids = (session.metadata?.staging_ids ?? "").split(",").filter(Boolean);
    if (ids.length)
      await db.from("stagings").update({ paid: true, paid_via: "single", stripe_session_id: session.id }).in("id", ids).eq("user_id", userId);
    return;
  }

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
    await applyPlan(userId, sub, typeof session.customer === "string" ? session.customer : session.customer?.id);
    // A referred friend's first plan payment: both of them get a free video (once).
    await db.rpc("reward_referral", { p_referred: userId });
    if (listingId) await db.rpc("use_credit", { p_listing: listingId, p_user: userId });
  }
}

/** Which plan a subscription is, from the metadata we set at checkout. Old $80/month subscriptions have none. */
function planOf(sub: Stripe.Subscription) {
  const plan = sub.metadata?.plan;
  const interval = sub.metadata?.interval;
  if (isPlan(plan) && isInterval(interval)) return { plan, interval, ...grant(plan, interval) };
  return { plan: "monthly" as const, interval: "month" as const, ...LEGACY_MONTHLY };
}

/** Fill this billing period's videos and staged photos. Unused ones from the last period expire. */
async function applyPlan(userId: string, sub: Stripe.Subscription, customer?: string) {
  const db = admin();
  const end = periodEnd(sub);
  const p = planOf(sub);
  const { data: prof } = await db.from("profiles").select("plan, credits_period_end").eq("id", userId).single();
  // Stripe can deliver an event twice: only fill each period once.
  const alreadyGranted = prof?.plan === p.plan && !!end && prof.credits_period_end === end;
  await db
    .from("profiles")
    .update({
      ...(customer ? { stripe_customer_id: customer } : {}),
      plan: p.plan,
      plan_interval: p.interval,
      plan_status: sub.status,
      ...(alreadyGranted ? {} : { credits: p.videos, staging_credits: p.staging, credits_period_end: end }),
    })
    .eq("id", userId);
}

async function onInvoicePaid(invoice: Stripe.Invoice) {
  // Renewals only; the first period is handled at checkout.
  if (invoice.billing_reason !== "subscription_cycle") return;
  const customer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customer) return;
  const subs = await stripe().subscriptions.list({ customer, status: "all", limit: 1 });
  const sub = subs.data[0];
  if (!sub) return;
  const { data: prof } = await admin().from("profiles").select("id").eq("stripe_customer_id", customer).single();
  if (prof) await applyPlan(prof.id, sub);
}

async function onSubscriptionChange(sub: Stripe.Subscription, type: string) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const db = admin();
  if (type === "customer.subscription.deleted") {
    // Plan videos and staged photos end with the plan; free referral videos stay.
    await db
      .from("profiles")
      .update({ plan: "none", plan_interval: null, plan_status: "canceled", credits: 0, staging_credits: 0 })
      .eq("stripe_customer_id", customer);
  } else {
    await db.from("profiles").update({ plan_status: sub.status }).eq("stripe_customer_id", customer);
  }
}
