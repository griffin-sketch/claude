import { admin, fail, HttpError, isAdmin, PRICES, requireUser } from "@/lib/server";

const CLIP = 0.35;   // Kling 2.5 Turbo Pro, 5 s
const EDIT = 0.04;   // AI photo edit / expansion

/** Everything the owner needs on one screen: every listing, its status, problems, revenue and AI cost. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    if (!isAdmin(user)) throw new HttpError(403, "Admins only.");
    const body = await request.json().catch(() => ({}));
    if (body?.ping) return Response.json({ ok: true });
    const db = admin();
    const [{ data: listings }, { data: shots }, { data: renders }, { data: profiles }, users] = await Promise.all([
      db.from("listings").select("id, user_id, address, city_line, status, paid, paid_via, error, created_at, updated_at, outro").order("created_at", { ascending: false }).limit(300),
      db.from("shots").select("listing_id, clip_status, clip_attempts, vclip_status, effect"),
      db.from("renders").select("listing_id"),
      db.from("profiles").select("id, full_name, company, account_type, plan, plan_status, credits"),
      db.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    const email = new Map((users.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
    const prof = new Map((profiles ?? []).map((p) => [p.id, p]));
    const perListing = new Map<string, { photos: number; ready: number; failed: number; attempts: number; vertical: number; effects: number }>();
    for (const s of shots ?? []) {
      const m = perListing.get(s.listing_id) ?? { photos: 0, ready: 0, failed: 0, attempts: 0, vertical: 0, effects: 0 };
      m.photos++;
      if (s.clip_status === "ready") m.ready++;
      if (s.clip_status === "failed") m.failed++;
      m.attempts += s.clip_attempts || 0;
      if (s.vclip_status && s.vclip_status !== "none") m.vertical++;
      if (s.effect && s.effect !== "none") m.effects++;
      perListing.set(s.listing_id, m);
    }
    const videos = new Map<string, number>();
    for (const r of renders ?? []) videos.set(r.listing_id, (videos.get(r.listing_id) ?? 0) + 1);

    const rows = (listings ?? []).map((l) => {
      const m = perListing.get(l.id) ?? { photos: 0, ready: 0, failed: 0, attempts: 0, vertical: 0, effects: 0 };
      const aiCost = (m.attempts + m.vertical) * CLIP + (m.vertical + m.effects * 2) * EDIT;
      const revenue = l.paid_via === "single" ? PRICES.single.amount / 100 : l.paid_via === "credit" ? PRICES.monthly.amount / 100 / PRICES.monthly.credits : 0;
      const p = prof.get(l.user_id);
      return {
        id: l.id, address: l.address || "Untitled", city: l.city_line, status: l.status, paid_via: l.paid_via, error: l.error,
        created_at: l.created_at, updated_at: l.updated_at, email: email.get(l.user_id) ?? "", name: p?.company || p?.full_name || "",
        account_type: p?.account_type ?? "agent", ...m, videos: videos.get(l.id) ?? 0,
        ai_cost: Math.round(aiCost * 100) / 100, revenue: Math.round(revenue * 100) / 100,
      };
    });
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const totals = {
      users: users.data?.users.length ?? 0,
      photographers: (profiles ?? []).filter((p) => p.account_type === "photographer").length,
      subscribers: (profiles ?? []).filter((p) => p.plan === "monthly" && p.plan_status === "active").length,
      listings: rows.length,
      revenue: Math.round(rows.reduce((a, r) => a + r.revenue, 0) * 100) / 100,
      ai_cost: Math.round(rows.reduce((a, r) => a + r.ai_cost, 0) * 100) / 100,
      mrr: (profiles ?? []).filter((p) => p.plan === "monthly" && p.plan_status === "active").length * (PRICES.monthly.amount / 100),
      problems: rows.filter((r) => r.status === "failed" || r.failed > 0).length,
      byStatus,
    };
    return Response.json({ totals, rows });
  } catch (e) {
    return fail(e);
  }
}
