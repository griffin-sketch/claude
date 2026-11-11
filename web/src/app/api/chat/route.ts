import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { admin } from "@/lib/server";
import { systemPrompt } from "@/lib/chatKnowledge";
import { INTERVALS, isInterval, isPlan, PLANS } from "@/lib/plans";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.CHAT_MODEL || "claude-haiku-5-5";
const MAX_TURNS = 20; // messages sent back each time
const MAX_CHARS = 1500; // per message
const DAILY_LIMIT = { visitor: 25, member: 60 }; // questions per 24 hours

type Msg = { role: "user" | "assistant"; content: string };

function json(status: number, error: string) {
  return Response.json({ error }, { status });
}

/** The signed-in person's account, in plain words, so answers can be specific. */
async function accountSummary(userId: string, email?: string) {
  const db = admin();
  const [{ data: p }, { data: listings }] = await Promise.all([
    db.from("profiles").select("full_name, plan, plan_interval, plan_status, credits, bonus_credits, staging_credits, credits_period_end").eq("id", userId).single(),
    db.from("listings").select("address, status, paid, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
  ]);
  if (!p) return `Signed in as ${email ?? "a customer"}.`;
  const active = p.plan !== "none" && ["active", "trialing", "past_due"].includes(p.plan_status ?? "");
  const planName = isPlan(p.plan) ? `${PLANS[p.plan].name}${isInterval(p.plan_interval) ? `, billed ${INTERVALS[p.plan_interval].label.toLowerCase()}` : ""}` : p.plan === "monthly" ? "the older $80/month plan" : "no plan";
  const lines = [
    `Signed in${p.full_name ? ` as ${p.full_name}` : ""}${email ? ` (${email})` : ""}.`,
    active ? `Plan: ${planName} (status: ${p.plan_status}). Plan videos left this period: ${p.credits}. Staged photos left: ${p.staging_credits}.${p.credits_period_end ? ` Renews/refills on ${new Date(p.credits_period_end).toDateString()}.` : ""}` : "No active plan.",
    `Free referral videos: ${p.bonus_credits ?? 0}.`,
    p.plan_status === "past_due" ? "Their last payment failed; they should update their card in Billing." : "",
    listings?.length
      ? `Recent listings: ${listings.map((l) => `${l.address || "untitled"} (${l.status}${l.paid ? ", paid" : ""})`).join("; ")}.`
      : "No listings yet.",
    "Listing statuses mean: draft = still setting up; queued/generating = clips being made; review = clips ready to approve; rendering = building the final videos; done = videos ready; failed = something went wrong (email info@gettourvo.com).",
  ];
  return lines.filter(Boolean).join("\n");
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return json(503, "Chat isn't set up yet. Email info@gettourvo.com and we'll help.");

  let body: { conversationId?: string; messages?: Msg[]; page?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, "Bad request.");
  }
  const conversationId = String(body.conversationId ?? "").slice(0, 64);
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!conversationId || !messages.length || messages[messages.length - 1].role !== "user") return json(400, "Bad request.");

  const db = admin();

  // who is asking (optional)
  let userId: string | null = null;
  let email: string | undefined;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token) {
    const { data } = await db.auth.getUser(token);
    if (data.user) {
      userId = data.user.id;
      email = data.user.email ?? undefined;
    }
  }
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = createHash("sha256").update(`tourvo-chat:${ip}`).digest("hex").slice(0, 32);

  // daily limit
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const q = db.from("chat_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", since);
  const { count, error: countError } = userId ? await q.eq("user_id", userId) : await q.eq("ip_hash", ipHash);
  if (!countError && (count ?? 0) >= (userId ? DAILY_LIMIT.member : DAILY_LIMIT.visitor)) {
    return json(429, "You've reached today's question limit. Email info@gettourvo.com and we'll get back to you.");
  }

  const account = userId ? await accountSummary(userId, email) : null;
  const question = messages[messages.length - 1].content;
  const page = String(body.page ?? "").slice(0, 200);

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 700,
    system: systemPrompt(account) + (page ? `\n\nThey are currently on the page: ${page}` : ""),
    messages,
  });

  const encoder = new TextEncoder();
  const out = new ReadableStream({
    async start(controller) {
      let answer = "";
      try {
        stream.on("text", (t) => {
          answer += t;
          controller.enqueue(encoder.encode(t));
        });
        await stream.finalMessage();
      } catch (e) {
        console.error("chat failed", e);
        if (!answer) controller.enqueue(encoder.encode("Sorry, I couldn't answer that just now. Please try again, or email info@gettourvo.com."));
      }
      // keep a record (ignore if the table isn't set up yet), then end the response
      await db.from("chat_messages").insert([
        { conversation_id: conversationId, user_id: userId, ip_hash: ipHash, role: "user", content: question, page },
        ...(answer ? [{ conversation_id: conversationId, user_id: userId, ip_hash: ipHash, role: "assistant" as const, content: answer, page }] : []),
      ]).then(({ error }) => error && console.error("chat log", error.message));
      controller.close();
    },
  });
  return new Response(out, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
