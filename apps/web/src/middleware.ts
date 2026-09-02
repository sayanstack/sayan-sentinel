import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "./lib/session-cookie";

/**
 * Gates every page except the sign-in flow itself on the session cookie's
 * mere *presence* — full signature/expiry verification happens per-request
 * in the API's `SessionAuthGuard`, which is the actual source of truth.
 * This is just a fast, Edge-runtime redirect for the common "never signed
 * in" case, not a security boundary of its own; a stale/tampered cookie
 * still gets a 401 from the API and degrades to each page's own
 * `ErrorBanner` rather than a crash (see `(app)/layout.tsx`).
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|auth/callback|_next/static|_next/image|favicon.ico).*)"],
};
