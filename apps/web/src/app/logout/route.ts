import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

/**
 * Sessions are stateless (a signed token, no server-side record) — signing
 * out is entirely a client-side concern: delete the cookie. `POST`-only so
 * a stray link or crawler can't sign a user out via a bare `GET`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
