import { admin, customerFor, fail, HttpError, PRICES, requireUser, siteUrl, stripe } from "@/lib/server";

/** Start the $80/month plan from the Billing page (no listing attached). Returns a Checkout URL. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { data: prof } = await admin().from("profiles").select("plan, plan_status").eq("id", user.id).single();
    if (prof?.plan === "monthly" && ["active", "trialing", "past_due"].includes(prof.plan_status ?? "")) {
      throw new HttpError(409, "You're already on the monthly plan.");
    }
    const base = siteUrl(request);
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: await customerFor(user),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PRICES.monthly.amount,
            recurring: { interval: "month" },
            product_data: { name: PRICES.monthly.name, description: PRICES.monthly.description },
          },
        },
      ],
      metadata: { kind: "subscribe", user_id: user.id },
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${base}/billing?subscribed=1`,
      cancel_url: `${base}/billing`,
    });
    return Response.json({ url: session.url });
  } catch (e) {
    return fail(e);
  }
}
