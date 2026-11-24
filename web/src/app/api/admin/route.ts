import { admin, fail, HttpError, isAdmin, requireUser } from "@/lib/server";
import { EXTRA_VIDEO_PRICE, grant, isInterval, isPlan, perMonth, PLANS } from "@/lib/plans";

/** Rough value of one plan video, and a plan's monthly revenue, for the owner's dashboard. */
function planValue(plan?: string | null, interval?: string | null) {
  if (isPlan(plan) && isInterval(interval)) return { perVideo: PLANS[plan].price[interval] / grant(plan, interval).videos, monthly: perMonth(plan, interval) };
  if (plan === "monthly") return { perVideo: 80 / 3, monthly: 80 };
  return { perVideo: 0, monthly: 0 };
}

const CLIP = 0.35;   // Kling 2.5 Turbo Pro, 5 s
const EDIT = 0.04;   // AI photo edit / expansion

/** Everything the owner needs on one screen: every listing, its status, problems, revenue and AI cost. */
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    if (!isAdmin(user)) throw new HttpError(403, "Admins only.");
    const body = await request.json().catch(() => ({}));
    if (body?.ping) return Response.json({ ok: true });
    const db = admin();
    if (typeof body?.listing === "string") return Response.json(await media(db, body.listing));

    // Hand a listing you built to a realtor's account, using one of their videos: { deliver: { id, email } }
    if (body?.deliver && typeof body.deliver.id === "string") {
      return Response.json(await deliver(db, body.deliver.id, String(body.deliver.email ?? ""), body.deliver.free === true));
    }

    // Tourvo branding switch: { branding: { id, value: true | false | null } }
    if (body?.branding && typeof body.branding.id === "string") {
      const v = body.branding.value;
      // "agent": no Tourvo branding, the realtor's own logo in the corner instead
      const patch = v === "agent" ? { tourvo_branding: false, agent_bug: true }
        : { tourvo_branding: v === true || v === false ? v : null, agent_bug: false };
      const { error } = await db.from("listings").update(patch).eq("id", body.branding.id);
      if (error) throw new HttpError(500, error.message.includes("tourvo_branding") ? "Run migration 0017 in Supabase first." : error.message);
      return Response.json({ ok: true });
    }

    // AI photo edit: { edit: { path, prompt } } queues one; { editId } checks on it
    if (body?.edit) {
      const path = String(body.edit.path ?? ""), prompt = String(body.edit.prompt ?? "").trim();
      if (!path.startsWith(`${user.id}/`) || !prompt) throw new HttpError(400, "Upload an image and describe the change.");
      const { data, error } = await db.from("ai_edits").insert({ user_id: user.id, source_path: path, prompt: prompt.slice(0, 4000) }).select("id").single();
      if (error || !data) throw new HttpError(500, error?.message.includes("ai_edits") ? "Run migration 0016 in Supabase first." : "Couldn't queue the edit.");
      return Response.json({ id: data.id });
    }
    if (typeof body?.editId === "string") {
      const { data: ed } = await db.from("ai_edits").select("status, result_path, error").eq("id", body.editId).eq("user_id", user.id).single();
      if (!ed) throw new HttpError(404, "Edit not found.");
      let url: string | null = null, download: string | null = null;
      if (ed.result_path) {
        url = (await db.storage.from("photos").createSignedUrl(ed.result_path, 3600)).data?.signedUrl ?? null;
        download = (await db.storage.from("photos").createSignedUrl(ed.result_path, 3600, { download: "tourvo-edit.png" })).data?.signedUrl ?? null;
      }
      return Response.json({ status: ed.status, error: ed.error, url, download });
    }
    const [{ data: listings }, { data: shots }, { data: renders }, { data: profiles }, users] = await Promise.all([
      db.from("listings").select("*").order("created_at", { ascending: false }).limit(300),
      db.from("shots").select("listing_id, clip_status, clip_attempts, vclip_status, effect"),
      db.from("renders").select("listing_id, version"),
      db.from("profiles").select("id, full_name, company, brokerage, phone, account_type, plan, plan_interval, plan_status, credits"),
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
    const top = new Map<string, number>();
    for (const r of renders ?? []) top.set(r.listing_id, Math.max(top.get(r.listing_id) ?? 1, r.version ?? 1));
    for (const r of renders ?? []) if ((r.version ?? 1) === top.get(r.listing_id)) videos.set(r.listing_id, (videos.get(r.listing_id) ?? 0) + 1);

    const rows = (listings ?? []).map((l) => {
      const m = perListing.get(l.id) ?? { photos: 0, ready: 0, failed: 0, attempts: 0, vertical: 0, effects: 0 };
      const aiCost = (m.attempts + m.vertical) * CLIP + (m.vertical + m.effects * 2) * EDIT;
      const p = prof.get(l.user_id);
      const revenue = l.paid_via === "single" ? EXTRA_VIDEO_PRICE : l.paid_via === "credit" ? planValue(p?.plan, p?.plan_interval).perVideo : 0;
      return {
        id: l.id, address: l.address || "Untitled", city: l.city_line, status: l.status, paid_via: l.paid_via, error: l.error,
        branding: (l.agent_bug ? "agent" : l.tourvo_branding ?? null) as boolean | null | "agent", mine: l.user_id === user.id,
        created_at: l.created_at, updated_at: l.updated_at, email: email.get(l.user_id) ?? "", name: p?.company || p?.full_name || "",
        account_type: p?.account_type ?? "agent", ...m, videos: videos.get(l.id) ?? 0, views: l.share_views ?? 0,
        ai_cost: Math.round(aiCost * 100) / 100, revenue: Math.round(revenue * 100) / 100,
      };
    });
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const totals = {
      users: users.data?.users.length ?? 0,
      photographers: (profiles ?? []).filter((p) => p.account_type === "photographer").length,
      subscribers: (profiles ?? []).filter((p) => p.plan !== "none" && p.plan_status === "active").length,
      listings: rows.length,
      revenue: Math.round(rows.reduce((a, r) => a + r.revenue, 0) * 100) / 100,
      ai_cost: Math.round(rows.reduce((a, r) => a + r.ai_cost, 0) * 100) / 100,
      mrr: Math.round((profiles ?? []).filter((p) => p.plan !== "none" && p.plan_status === "active").reduce((a, p) => a + planValue(p.plan, p.plan_interval).monthly, 0)),
      problems: rows.filter((r) => r.status === "failed" || r.failed > 0).length,
      byStatus,
    };
    // every account, newest first, with how far each one has gotten
    const listingsBy = new Map<string, { total: number; done: number }>();
    for (const l of listings ?? []) {
      const m = listingsBy.get(l.user_id) ?? { total: 0, done: 0 };
      m.total++; if (l.status === "done") m.done++;
      listingsBy.set(l.user_id, m);
    }
    const accounts = (users.data?.users ?? [])
      .map((u) => {
        const p = prof.get(u.id);
        const m = listingsBy.get(u.id) ?? { total: 0, done: 0 };
        return {
          id: u.id, email: u.email ?? "", name: p?.full_name || "", company: p?.company || p?.brokerage || "",
          phone: p?.phone || "", account_type: p?.account_type ?? "agent",
          provider: (u.app_metadata?.provider as string) || "email",
          plan: p?.plan && p.plan !== "none" ? `${p.plan}${p.plan_interval ? ` · ${p.plan_interval}` : ""}${p.plan_status && p.plan_status !== "active" ? ` (${p.plan_status})` : ""}` : "",
          credits: p?.credits ?? 0,
          created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null,
          listings: m.total, finished: m.done,
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return Response.json({ totals, rows, accounts });
  } catch (e) {
    return fail(e);
  }
}

/** One listing's finished videos and AI clips, as signed links the owner can play or download (1 hour). */
async function media(db: ReturnType<typeof admin>, listingId: string) {
  const [{ data: l }, { data: renders }, { data: shots }] = await Promise.all([
    db.from("listings").select("address").eq("id", listingId).single(),
    db.from("renders").select("kind, format, video_path, created_at, version").eq("listing_id", listingId).order("version", { ascending: false }),
    db.from("shots").select("position, label, effect, clip_path, vclip_path").eq("listing_id", listingId).order("position"),
  ]);
  const slug = (l?.address || "listing").replace(/[^a-z0-9]+/gi, "-");
  const sign = async (bucket: string, path: string, download?: string) =>
    (await db.storage.from(bucket).createSignedUrl(path, 3600, download ? { download } : undefined)).data?.signedUrl ?? null;
  const videos = await Promise.all((renders ?? []).map(async (r) => {
    const name = `${slug}-${r.kind ?? "tour"}-${r.format === "9:16" ? "vertical" : "16x9"}.mp4`;
    return { kind: r.kind ?? "tour", format: r.format, play: await sign("videos", r.video_path), download: await sign("videos", r.video_path, name) };
  }));
  const clips = await Promise.all((shots ?? []).filter((s) => s.clip_path).map(async (s) => ({
    position: s.position, label: s.label, effect: s.effect, play: await sign("clips", s.clip_path!),
    download: await sign("clips", s.clip_path!, `${slug}-clip-${s.position + 1}.mp4`),
    vertical: s.vclip_path ? await sign("clips", s.vclip_path) : null,
  })));
  return { address: l?.address ?? "", videos, clips };
}

/**
 * Move a finished listing (built on the owner's account) into a realtor's account and use one of their videos.
 * Files are copied into their storage folder (each account can only read its own folder), then every path and the
 * listing's owner switch over. Their plan videos are used first, then free referral videos.
 */
async function deliver(db: ReturnType<typeof admin>, listingId: string, email: string, free = false) {
  const to = email.trim().toLowerCase();
  if (!to) throw new HttpError(400, "Enter the realtor's email.");
  let target: { id: string; email?: string } | undefined;
  for (let page = 1; page <= 10 && !target; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    target = data?.users.find((u) => (u.email ?? "").toLowerCase() === to);
    if (!data || data.users.length < 1000) break;
  }
  if (!target) throw new HttpError(404, `No Tourvo account uses ${email}. Ask them to sign up first.`);

  const { data: l } = await db.from("listings").select("*").eq("id", listingId).single();
  if (!l) throw new HttpError(404, "Listing not found.");
  if (l.user_id === target.id) throw new HttpError(409, "That listing is already in their account.");
  if (l.status !== "done") throw new HttpError(409, "Finish the videos before delivering the listing.");

  const { data: prof } = await db.from("profiles").select("credits, bonus_credits").eq("id", target.id).single();
  const credits = prof?.credits ?? 0, bonus = prof?.bonus_credits ?? 0;
  if (!free && credits + bonus < 1)
    throw new HttpError(409, `${email} has no videos left on their plan. They can buy an extra video or pick a plan first.`);

  const from = `${l.user_id}/`, mine = `${target.id}/`;
  const moved = new Map<string, string>();   // "bucket:old" -> new path
  async function move(bucket: string, path: string | null | undefined) {
    if (!path || !path.startsWith(from)) return path ?? null;
    const key = `${bucket}:${path}`;
    if (moved.has(key)) return moved.get(key)!;
    const dest = mine + path.slice(from.length);
    const { error } = await db.storage.from(bucket).copy(path, dest);
    if (error && !/exists/i.test(error.message)) throw new Error(`Couldn't copy ${bucket}/${path}: ${error.message}`);
    moved.set(key, dest);
    return dest;
  }

  const [{ data: shots }, { data: renders }] = await Promise.all([
    db.from("shots").select("id, photo_path, original_photo_path, end_photo_path, clip_path, vclip_path").eq("listing_id", l.id),
    db.from("renders").select("id, video_path").eq("listing_id", l.id),
  ]);
  // copy everything first; only switch rows over once all files are in place
  const shotPatch = await Promise.all((shots ?? []).map(async (s) => ({
    id: s.id,
    photo_path: await move("photos", s.photo_path),
    original_photo_path: await move("photos", s.original_photo_path),
    end_photo_path: await move("photos", s.end_photo_path),
    clip_path: await move("clips", s.clip_path),
    vclip_path: await move("clips", s.vclip_path),
  })));
  const renderPatch = await Promise.all((renders ?? []).map(async (r) => ({ id: r.id, video_path: await move("videos", r.video_path) })));
  const listingPatch = {
    user_id: target.id,
    music_path: await move("photos", l.music_path),
    client_logo_path: await move("branding", l.client_logo_path),
    client_headshot_path: await move("branding", l.client_headshot_path),
  };

  // use one of their videos (plan first), guarded so two deliveries can't both take the last one; a free delivery uses none
  const useCol = credits > 0 ? "credits" : "bonus_credits";
  const have = credits > 0 ? credits : bonus;
  if (!free) {
    const { data: spent } = await db.from("profiles").update({ [useCol]: have - 1 }).eq("id", target.id).eq(useCol, have).select("id");
    if (!spent?.length) throw new HttpError(409, "Their video balance just changed. Try again.");
  }

  for (const s of shotPatch) {
    const { id, ...p } = s;
    await db.from("shots").update(p).eq("id", id);
  }
  for (const r of renderPatch) await db.from("renders").update({ video_path: r.video_path }).eq("id", r.id);
  const { error } = await db.from("listings").update(listingPatch).eq("id", l.id);
  if (error) throw error;

  // let them know (best effort; needs RESEND_API_KEY in Vercel)
  const key = process.env.RESEND_API_KEY?.trim();
  if (key && target.email) {
    const site = process.env.SITE_URL || "https://www.gettourvo.com";
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Tourvo <onboarding@resend.dev>",
        to: [target.email],
        subject: "Your listing videos are ready",
        html: `<p>Your videos for <b>${(l.address || "your listing").replace(/[<>&]/g, "")}</b> are in your Tourvo account, ready to download and post.</p><p><a href="${site}/listings/${l.id}">Open my videos</a></p>`,
      }),
    }).catch(() => null);
  }
  if (free) return { ok: true, used: "nothing (free)", left: credits + bonus };
  return { ok: true, used: useCol === "credits" ? "plan video" : "free referral video", left: credits + bonus - 1 };
}
