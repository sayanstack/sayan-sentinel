import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The one-time handoff target for `AuthController.callback` on the API.
 * The API and this app are on different origins (Railway vs. Vercel), so a
 * cookie the API tried to set directly would never be readable by this
 * app's own server-side requests — instead the already-signed session
 * token travels once in this redirect's URL, and this route is what turns
 * it into a same-origin cookie the rest of the app can actually use.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_code", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: false,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
