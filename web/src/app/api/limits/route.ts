import { fail, isAdmin, requireUser } from "@/lib/server";
import { MAX_PHOTOS, OWNER_MAX_PHOTOS, PRIVATE_TEMPLATE_EMAILS } from "@/lib/config";

/** This account's limits (the owner's account can use more photos). */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const owner = isAdmin(user);
    const email = (user.email ?? "").toLowerCase();
    const templates = Object.entries(PRIVATE_TEMPLATE_EMAILS)
      .filter(([, emails]) => owner || emails.map((e) => e.toLowerCase()).includes(email))
      .map(([id]) => Number(id));
    return Response.json({ maxPhotos: owner ? OWNER_MAX_PHOTOS : MAX_PHOTOS, templates });
  } catch (e) {
    return fail(e);
  }
}
