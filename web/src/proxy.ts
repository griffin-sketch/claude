import { NextResponse, type NextRequest } from "next/server";

/**
 * mls.gettourvo.com serves only the unbranded MLS tours: /<token> shows that tour, anything else goes to the main
 * site. MLSs check the link's address up to the first slash, so it has to differ from the branded www links.
 */
export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (!host.startsWith("mls.")) return NextResponse.next();
  const path = request.nextUrl.pathname;
  const m = path.match(/^\/([0-9a-f-]{36})\/?$/i);
  if (m) return NextResponse.rewrite(new URL(`/mls/${m[1]}`, request.url));
  return NextResponse.redirect("https://www.gettourvo.com" + (path === "/" ? "" : path));
}

export const config = {
  // pages only: leave Next's own files, images and fonts alone
  matcher: ["/((?!_next/|api/|favicon|.*\\.(?:png|jpg|jpeg|webp|svg|ico|mp4|mp3|woff2?|css|js)$).*)"],
};
