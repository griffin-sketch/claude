import { admin, customerFor, fail, HttpError, isAdmin, PRICES, requireUser, siteUrl, STATEMENT_SUFFIX, stripe } from "@/lib/server";

/**
 * Staged photos.
 * body: { action: "checkout", ids: string[] }  -> pay $5 per photo (returns a Stripe Checkout URL); admins get them free
 *       { action: "download", id: string }      -> a short-lived link to the clean full-size photo (paid only)
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as { action?: string; ids?: string[]; id?: string };
    const db = admin();

    if (body.action === "download") {
      const { data: st } = await db.from("stagings").select("*").eq("id", body.id ?? "").eq("user_id", user.id).single();
      if (!st) throw new HttpError(404, "Photo not found.");
      if (!st.paid) throw new HttpError(402, "Unlock this photo to download it.");
      if (!st.result_path) throw new HttpError(409, "This photo isn't ready yet.");
      const { data, error } = await db.storage
        .from("staged-full")
        .createSignedUrl(st.result_path, 600, { download: `staged-${st.room}-${st.style}-${st.id.slice(0, 6)}.jpg` });
      if (error || !data) throw new HttpError(500, "Could not make a download link.");
      return Response.json({ url: data.signedUrl });
    }

    if (body.action === "checkout") {
      const ids = [...new Set(body.ids ?? [])].slice(0, 12);
      if (!ids.length) throw new HttpError(400, "Pick at least one photo.");
      const { data: rows } = await db.from("stagings").select("id, status, paid").eq("user_id", user.id).in("id", ids);
      const todo = (rows ?? []).filter((r) => !r.paid && r.status === "ready").map((r) => r.id);
      if (!todo.length) throw new HttpError(400, "Those photos are already unlocked or still being staged.");

      if (isAdmin(user)) {
        await db.from("stagings").update({ paid: true, paid_via: "comp" }).in("id", todo).eq("user_id", user.id);
        return Response.json({ ok: true, comp: true });
      }

      const back = `${siteUrl(request)}/staging`;
      const session = await stripe().checkout.sessions.create({
        mode: "payment",
        customer: await customerFor(user),
        line_items: [
          {
            quantity: todo.length,
            price_data: {
              currency: "usd",
              unit_amount: PRICES.staging.amount,
              product_data: { name: PRICES.staging.name, description: PRICES.staging.description },
            },
          },
        ],
        metadata: { kind: "staging", user_id: user.id, staging_ids: todo.join(",") },
        payment_intent_data: { statement_descriptor_suffix: STATEMENT_SUFFIX },
        success_url: `${back}?paid=1`,
        cancel_url: back,
      });
      await db.from("stagings").update({ stripe_session_id: session.id }).in("id", todo);
      return Response.json({ url: session.url });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return fail(e);
  }
}
