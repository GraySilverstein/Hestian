import type { Auth } from "better-auth";

export interface SignInResult {
  /** Cookie header value for the authenticated session, or the 2FA challenge. */
  readonly cookie: string;
  readonly requiresTwoFactor: boolean;
  readonly headers: Headers;
}

/**
 * Extracts the first cookie pair from a Set-Cookie header.
 *
 * Better Auth rotates the session cookie when a second factor is verified, so
 * tests must carry the latest cookie forward exactly as a browser would.
 */
export function cookieFrom(headers: Headers): string {
  // A challenge response can set more than one cookie (the pending two-factor
  // cookie plus, on success, the session). Keep every pair, as a browser would.
  return headers
    .getSetCookie()
    .map((value) => value.split(";")[0] ?? "")
    .filter((value) => value.length > 0)
    .join("; ");
}

export async function signIn(
  auth: Auth,
  email: string,
  password: string,
): Promise<SignInResult> {
  const result = (await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(),
    returnHeaders: true,
  })) as unknown as {
    headers: Headers;
    response: { twoFactorRedirect?: boolean; token?: string };
  };

  return {
    cookie: cookieFrom(result.headers),
    requiresTwoFactor: result.response.twoFactorRedirect === true,
    headers: result.headers,
  };
}

export function cookieHeaders(cookie: string): Headers {
  return new Headers({ cookie });
}
