import { admin, fail, HttpError, requireUser, siteUrl, stripe } from "@/lib/server";

/** Stripe's billing portal: update card, see invoices, cancel the plan. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { data: prof } = await admin().from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    if (!prof?.stripe_customer_id) throw new HttpError(404, "No billing account yet.");
    const session = await stripe().billingPortal.sessions.create({
      customer: prof.stripe_customer_id,
      return_url: `${siteUrl(request)}/billing`,
    });
    return Response.json({ url: session.url });
  } catch (e) {
    return fail(e);
  }
}
