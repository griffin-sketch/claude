import "server-only";
import Stripe from "stripe";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { grant, INTERVALS, PLANS, type IntervalId, type PlanId } from "@/lib/plans";

/** Pricing. Amounts are in cents. */
// Shown after the account's name on customers' card statements, e.g. "KGB MARKETING* TOURVO".
export const STATEMENT_SUFFIX = "TOURVO";

export const PRICES = {
  staging: { amount: 500, name: "Virtually staged photo", description: "Full-size, unwatermarked staged photo" },
} as const;

function env(name: string) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}. Add it in Vercel → Settings → Environment Variables.`);
  return v;
}

let _stripe: Stripe | null = null;
export function stripe() {
  if (!_stripe) _stripe = new Stripe(env("STRIPE_SECRET_KEY"));
  return _stripe;
}

let _admin: SupabaseClient | null = null;
/** Service-role client: bypasses row level security. Server only. */
export function admin() {
  if (!_admin) {
    _admin = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

/** Who is calling? Reads the Supabase access token the browser sends as a Bearer header. */
export async function requireUser(request: Request): Promise<User> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Please sign in again.");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Please sign in again.");
  return data.user;
}

/** Emails in ADMIN_EMAILS (comma separated) can generate videos free, for testing and comps. */
export function isAdmin(user: User) {
  const list = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!user.email && list.includes(user.email.toLowerCase());
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function fail(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export function siteUrl(request: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

/** Find or create the Stripe customer for a realtor, and remember it on their profile. */
export async function customerFor(user: User): Promise<string> {
  const db = admin();
  const { data: prof } = await db.from("profiles").select("stripe_customer_id, full_name").eq("id", user.id).single();
  if (prof?.stripe_customer_id) {
    // A customer saved under a different Stripe account or mode (test vs live) doesn't exist here: make a new one.
    try {
      const existing = await stripe().customers.retrieve(prof.stripe_customer_id);
      if (!("deleted" in existing && existing.deleted)) return prof.stripe_customer_id;
    } catch {}
  }
  const c = await stripe().customers.create({
    email: user.email ?? undefined,
    name: prof?.full_name ?? undefined,
    metadata: { user_id: user.id },
  });
  await db.from("profiles").update({ stripe_customer_id: c.id }).eq("id", user.id);
  return c.id;
}

/** Is this person on a paid plan right now? */
export async function activePlan(userId: string) {
  const { data } = await admin().from("profiles").select("plan, plan_status").eq("id", userId).single();
  return !!data && data.plan !== "none" && ["active", "trialing", "past_due"].includes(data.plan_status ?? "");
}

/** A Stripe Checkout page for a plan. listingId: spend the first video on that listing once paid. */
export async function planCheckout(opts: {
  user: User;
  plan: PlanId;
  interval: IntervalId;
  successUrl: string;
  cancelUrl: string;
  listingId?: string;
}) {
  const { user, plan, interval } = opts;
  const p = PLANS[plan];
  const g = grant(plan, interval);
  const per = INTERVALS[interval];
  const meta: Record<string, string> = { kind: "subscribe", user_id: user.id, plan, interval };
  if (opts.listingId) meta.listing_id = opts.listingId;
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: await customerFor(user),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: p.price[interval] * 100,
          recurring: per.stripe,
          product_data: {
            name: `Tourvo ${p.name} · ${per.label}`,
            description: `${g.videos} listing video${g.videos === 1 ? "" : "s"} and ${g.staging} staged photos every ${per.months === 1 ? "month" : per.months === 3 ? "3 months" : "year"}`,
          },
        },
      },
    ],
    allow_promotion_codes: true,
    metadata: meta,
    subscription_data: { metadata: { user_id: user.id, plan, interval } },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });
  return session.url;
}
