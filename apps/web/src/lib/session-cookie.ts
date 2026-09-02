export const SESSION_COOKIE_NAME = "sentinel_session";

/**
 * Reads the session token in whatever context `apiFetch` is called from —
 * a Server Component/Route Handler (via `next/headers`) or a Client
 * Component (via `document.cookie`). The dynamic import is only ever
 * evaluated on the server branch, so `next/headers` (a server-only module)
 * never actually loads inside a browser bundle even though this file is
 * imported by both server and client code.
 */
export async function readSessionToken(): Promise<string | undefined> {
  if (typeof window === "undefined") {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get(SESSION_COOKIE_NAME)?.value;
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
