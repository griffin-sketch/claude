import { admin, fail, HttpError, requireUser } from "@/lib/server";

/**
 * Referrals.
 * body: { action: "claim", code }  -> record that this new account was referred by the owner of `code`
 * Both people get a free video once the new account pays for a plan (Stripe webhook → reward_referral).
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json().catch(() => ({}))) as { action?: string; code?: string };
    if (body.action !== "claim") throw new HttpError(400, "Unknown action.");
    const code = (body.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    if (!code) throw new HttpError(400, "Missing code.");
    const db = admin();

    const { data: referrer } = await db.from("profiles").select("id").eq("referral_code", code).maybeSingle();
    if (!referrer) return Response.json({ ok: false, reason: "That referral link isn't valid." });
    if (referrer.id === user.id) return Response.json({ ok: false, reason: "You can't refer yourself." });

    // Only new customers count: an account that has already paid for anything can't be referred.
    const { data: me } = await db.from("profiles").select("stripe_customer_id, plan").eq("id", user.id).single();
    const { count: paidListings } = await db
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("paid", true)
      .neq("paid_via", "comp");
    if (me?.plan !== "none" || (paidListings ?? 0) > 0) {
      return Response.json({ ok: false, reason: "Referral links are for new accounts." });
    }
    const created = new Date(user.created_at).getTime();
    if (Date.now() - created > 30 * 24 * 3600 * 1000) {
      return Response.json({ ok: false, reason: "Referral links are for new accounts." });
    }

    const { error } = await db.from("referrals").insert({ referrer_id: referrer.id, referred_id: user.id });
    if (error && error.code !== "23505") throw error; // 23505: already referred
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
