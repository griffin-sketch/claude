import { admin, fail } from "@/lib/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Count one view of a client share link. body: { token }. The share page calls this once per visit. */
export async function POST(request: Request) {
  try {
    const { token } = (await request.json().catch(() => ({}))) as { token?: string };
    if (token && UUID.test(token)) await admin().rpc("count_share_view", { p_token: token });
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
