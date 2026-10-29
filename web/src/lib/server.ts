import "server-only";
import Stripe from "stripe";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/** Pricing. Amounts are in cents. */
export const PRICES = {
  single: { amount: 4900, name: "Listing video", description: "One listing: AI camera moves, 16:9 + 9:16 videos" },
  monthly: { amount: 8000, name: "Listing videos: monthly", description: "3 listing videos every month", credits: 3 },
} as const;

function env(name: string) {
  const v = process.env[name];
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
  if (prof?.stripe_customer_id) return prof.stripe_customer_id;
  const c = await stripe().customers.create({
    email: user.email ?? undefined,
    name: prof?.full_name ?? undefined,
    metadata: { user_id: user.id },
  });
  await db.from("profiles").update({ stripe_customer_id: c.id }).eq("id", user.id);
  return c.id;
}
