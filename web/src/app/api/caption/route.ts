import Anthropic from "@anthropic-ai/sdk";
import { admin, fail, HttpError, requireUser } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.CHAT_MODEL || "claude-haiku-5-5";

/** Write an Instagram caption for one of the caller's listings. body: { listingId }. Returns { caption }. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { listingId } = (await request.json().catch(() => ({}))) as { listingId?: string };
    const db = admin();
    const { data: l } = await db.from("listings").select("*").eq("id", listingId ?? "").eq("user_id", user.id).single();
    if (!l) throw new HttpError(404, "Listing not found.");
    const [{ data: shots }, { data: prof }] = await Promise.all([
      db.from("shots").select("label, sub").eq("listing_id", l.id).order("position"),
      db.from("profiles").select("full_name, company, brokerage, phone, account_type").eq("id", user.id).single(),
    ]);

    const agent = l.outro === "client"
      ? [l.client_name, l.client_brokerage, l.client_phone]
      : [prof?.full_name || prof?.company, prof?.brokerage, prof?.phone];
    const facts = [
      `Address: ${l.address || "not given"}${l.city_line ? `, ${l.city_line}` : ""}`,
      l.price && `Price: ${l.price}`,
      l.beds && `Beds: ${l.beds}`,
      l.baths && `Baths: ${l.baths}`,
      l.sqft && `Square feet: ${l.sqft}`,
      l.acres && `Acres: ${l.acres}`,
      l.headline && `Headline on the video: ${l.headline}`,
      l.open_house && `Open house: ${l.open_house}`,
      shots?.length && `Rooms and features shown: ${shots.map((s) => [s.label, s.sub].filter(Boolean).join(" - ")).filter(Boolean).join("; ")}`,
      agent.some(Boolean) && `Listing agent: ${agent.filter(Boolean).join(", ")}`,
    ].filter(Boolean).join("\n");

    const apiKey = process.env.ANTHROPIC_API_KEY ?? Object.entries(process.env).find(([k]) => k.toUpperCase() === "ANTHROPIC_API_KEY")?.[1];
    if (!apiKey) throw new HttpError(503, "Captions aren't set up yet.");
    const msg = await new Anthropic({ apiKey }).messages.create({
      model: MODEL,
      max_tokens: 2000,
      system:
        "You write Instagram Reel captions for real estate agents posting a listing walkthrough video. " +
        "Write as the agent, warm and confident, never salesy or hypey. Structure: a short hook line, two or three short lines on what makes the home special " +
        "(use only the facts given, never invent features, schools or neighborhood claims), the key details (beds, baths, square feet, price) on one line if given, " +
        "a call to action to DM or call for a showing (include the phone number if given), then a blank line and 5 to 8 relevant hashtags including the city. " +
        "No emojis at all. No quotation marks around the caption. Reply with the caption only.",
      messages: [{ role: "user", content: facts }],
    });
    const caption = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (!caption) {
      console.error("caption empty", msg.stop_reason, JSON.stringify(msg.content).slice(0, 500));
      throw new HttpError(502, `Couldn't write a caption (${msg.stop_reason}). Try again.`);
    }
    return Response.json({ caption });
  } catch (e) {
    return fail(e);
  }
}
