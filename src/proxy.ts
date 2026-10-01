import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, publicOrigin } from "@/lib/auth/rules";
import { SESSION_COOKIE, findSession } from "@/lib/auth/session";
import { getConfigNumber } from "@/lib/infra/config";
import { DEFAULT_LOCK_MINUTES, isLocked } from "@/lib/domain/auth-lock";

/**
 * Every request needs a signed-in session, except the sign-in page and its API.
 * Server actions are POSTs to page paths, so they're covered too; one sent to a public path is refused.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAction = request.headers.has("next-action");
  if (isPublicPath(pathname) && !isAction) return NextResponse.next();

  const session = await findSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    // Signed in, but away long enough that the device should prove itself again. The session survives —
    // only the right to use it is paused, so unlocking is a prompt rather than a sign-in.
    const minutes = (await getConfigNumber("lockMinutes")) ?? DEFAULT_LOCK_MINUTES;
    if (!isLocked(session.verifiedAt, minutes, new Date())) return NextResponse.next();
    if (isAction || pathname.startsWith("/api/")) return NextResponse.json({ error: "Bloqueado. Desbloqueie o app." }, { status: 401 });
    const url = new URL("/login", publicOrigin(request.headers));
    url.searchParams.set("unlock", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (isAction || pathname.startsWith("/api/")) return NextResponse.json({ error: "Sessão expirada. Entre de novo." }, { status: 401 });
  return NextResponse.redirect(new URL("/login", publicOrigin(request.headers)));
}

export const config = {
  // Static assets, what installing the app needs (manifest, icons, service worker, offline page) and robots.txt stay open.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|sw.js|offline.html|robots.txt).*)"],
};
