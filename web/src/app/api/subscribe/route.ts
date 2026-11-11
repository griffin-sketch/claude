import { activePlan, fail, HttpError, planCheckout, requireUser, siteUrl } from "@/lib/server";
import { isInterval, isPlan } from "@/lib/plans";

/** Start a plan from the Billing page. body: { plan: "starter" | "growth", interval: "month" | "quarter" | "year" }. Returns a Checkout URL. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { plan, interval } = (await request.json().catch(() => ({}))) as { plan?: string; interval?: string };
    if (!isPlan(plan) || !isInterval(interval)) throw new HttpError(400, "Pick a plan.");
    if (await activePlan(user.id)) throw new HttpError(409, "You already have a plan. Manage it from Billing.");
    const base = siteUrl(request);
    const url = await planCheckout({ user, plan, interval, successUrl: `${base}/billing?subscribed=1`, cancelUrl: `${base}/billing` });
    return Response.json({ url });
  } catch (e) {
    return fail(e);
  }
}
