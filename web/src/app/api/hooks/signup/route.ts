import { admin, fail } from "@/lib/server";

/**
 * New-account alert. Called by the database (migration 0013) right after a profile is created.
 * The call carries no secret, so it trusts nothing in it but the id: it re-reads the account and only alerts
 * for one created in the last 15 minutes that hasn't been alerted yet (each account alerts at most once).
 *
 * Where alerts go (set in Vercel → Settings → Environment Variables; either or both):
 *   NTFY_TOPIC         phone push through the free ntfy app (ntfy.sh): subscribe to this topic in the app
 *   SIGNUP_ALERT_EMAIL email address for an alert email (needs RESEND_API_KEY and EMAIL_FROM, like the video emails)
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = String(body.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ ok: false });
    const db = admin();

    const { data: p } = await db.from("profiles").select("id, created_at, signup_notified_at").eq("id", id).maybeSingle();
    if (!p || p.signup_notified_at || Date.now() - new Date(p.created_at).getTime() > 15 * 60 * 1000) {
      return Response.json({ ok: false });
    }
    // Claim the alert so a repeat call can't send it twice.
    const { data: claimed } = await db
      .from("profiles")
      .update({ signup_notified_at: new Date().toISOString() })
      .eq("id", id)
      .is("signup_notified_at", null)
      .select("id");
    if (!claimed?.length) return Response.json({ ok: false });

    const { data: u } = await db.auth.admin.getUserById(id);
    const user = u?.user;
    const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>;
    const name = meta.full_name || meta.name || "";
    const email = user?.email || "";
    const via = user?.app_metadata?.provider === "google" ? "Google" : "email";
    const { count } = await db.from("profiles").select("id", { count: "exact", head: true });
    const site = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gettourvo.com";
    const who = [name, email].filter(Boolean).join(" · ") || "New account";
    const line = `${who}\nSigned up with ${via}. Account #${count ?? "?"}.`;

    // The push goes through ntfy's public server, so it carries only a first name; the email has the details.
    const first = name.split(" ")[0];
    const pushLine = `${first ? first + " just" : "Someone just"} made an account (signed up with ${via}). Account #${count ?? "?"}.`;
    await Promise.allSettled([push(pushLine, `${site}/admin`), mail(who, line, `${site}/admin`)]);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

async function push(message: string, click: string) {
  const topic = process.env.NTFY_TOPIC?.trim();
  if (!topic) return;
  await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: "POST",
    body: message,
    headers: { Title: "New Tourvo signup", Tags: "tada", Click: click },
  });
}

async function mail(who: string, message: string, link: string) {
  const to = process.env.SIGNUP_ALERT_EMAIL?.trim();
  const key = process.env.RESEND_API_KEY?.trim();
  if (!to || !key) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM?.trim() || "Tourvo <onboarding@resend.dev>",
      to: [to],
      subject: `New Tourvo signup: ${who}`,
      html: `<p style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6">${esc(message).replace(/\n/g, "<br>")}</p>
<p><a href="${link}" style="font-family:Helvetica,Arial,sans-serif;color:#C4553A;font-weight:700">Open the owner dashboard</a></p>`,
    }),
  });
}
