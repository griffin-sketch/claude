import { fail, isAdmin, requireUser } from "@/lib/server";
import { MAX_PHOTOS, OWNER_MAX_PHOTOS } from "@/lib/config";

/** This account's limits (the owner's account can use more photos). */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json({ maxPhotos: isAdmin(user) ? OWNER_MAX_PHOTOS : MAX_PHOTOS });
  } catch (e) {
    return fail(e);
  }
}
