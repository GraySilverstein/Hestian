import { base32 } from "@better-auth/utils/base32";
import { afterEach, describe, expect, it } from "vitest";

import { createTestAuth } from "../helpers/auth";
import { cookieHeaders, cookieFrom, signIn } from "../helpers/session";
import { createTestDatabase, type TestDatabase } from "../helpers/sqlite";

const PASSWORD = "correct-horse-battery-staple";
const EMAIL = "mfa@example.com";

let database: TestDatabase | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
});

function open(): TestDatabase {
  database = createTestDatabase();
  return database;
}

interface TwoFactorApi {
  enableTwoFactor(input: {
    body: { password: string };
    headers: Headers;
    returnHeaders?: boolean;
  }): Promise<{ method: string; totpURI?: string; backupCodes?: string[] }>;
  generateTOTP(input: { body: { secret: string } }): Promise<{ code: string }>;
  verifyTOTP(input: {
    body: { code: string };
    headers: Headers;
    returnHeaders?: boolean;
  }): Promise<{ headers: Headers; response: { status?: boolean } }>;
  verifyBackupCode(input: {
    body: { code: string };
    headers: Headers;
    returnHeaders?: boolean;
  }): Promise<{ headers: Headers }>;
  disableTwoFactor(input: { body: { password: string }; headers: Headers }): Promise<unknown>;
}

function api(auth: ReturnType<typeof createTestAuth>): TwoFactorApi {
  return auth.api as unknown as TwoFactorApi;
}

async function enrolledUser() {
  const { raw } = open();
  const auth = createTestAuth(raw);
  await auth.api.signUpEmail({
    body: { name: "Mfa User", email: EMAIL, password: PASSWORD },
    headers: new Headers(),
  });
  const login = await signIn(auth, EMAIL, PASSWORD);

  const enable = await api(auth).enableTwoFactor({
    body: { password: PASSWORD },
    headers: cookieHeaders(login.cookie),
  });
  if (enable.totpURI === undefined) throw new Error("No TOTP URI returned.");

  // The URI carries the base32-encoded form of the raw secret the provider
  // stores; decode it so the test computes the same TOTP as an authenticator app.
  const encoded = new URL(enable.totpURI).searchParams.get("secret");
  if (encoded === null) throw new Error("No secret in TOTP URI.");
  const secret = new TextDecoder().decode(base32.decode(encoded.toUpperCase()));

  const code = (await api(auth).generateTOTP({ body: { secret } })).code;
  const confirmed = await api(auth).verifyTOTP({
    body: { code },
    headers: cookieHeaders(login.cookie),
    returnHeaders: true,
  });

  return {
    auth,
    raw,
    secret,
    backupCodes: enable.backupCodes ?? [],
    sessionCookie: cookieFrom(confirmed.headers),
  };
}

describe("multi-factor authentication", () => {
  it("enrolls TOTP, blocks password-only sign-in, and completes the challenge", async () => {
    const { auth, raw, secret, sessionCookie } = await enrolledUser();

    const user = raw
      .prepare("SELECT twoFactorEnabled FROM identity_user WHERE email = ?")
      .get(EMAIL) as { twoFactorEnabled: number };
    expect(user.twoFactorEnabled).toBe(1);

    const challenge = await signIn(auth, EMAIL, PASSWORD);
    expect(challenge.requiresTwoFactor).toBe(true);

    const challengeSession = await auth.api.getSession({
      headers: cookieHeaders(challenge.cookie),
    });
    expect(challengeSession).toBeNull();

    await expect(
      api(auth).verifyTOTP({
        body: { code: "000000" },
        headers: cookieHeaders(challenge.cookie),
      }),
    ).rejects.toThrow();

    const code = (await api(auth).generateTOTP({ body: { secret } })).code;
    const verified = await api(auth).verifyTOTP({
      body: { code },
      headers: cookieHeaders(challenge.cookie),
      returnHeaders: true,
    });
    const session = await auth.api.getSession({
      headers: cookieHeaders(cookieFrom(verified.headers)),
    });
    expect(session?.user.email).toBe(EMAIL);

    expect(sessionCookie.startsWith("better-auth.session_token=")).toBe(true);
  });

  it("accepts a recovery code once and stores codes encrypted", async () => {
    const { auth, raw, backupCodes } = await enrolledUser();
    expect(backupCodes.length).toBe(10);

    const row = raw
      .prepare("SELECT backupCodes FROM identity_two_factor WHERE userId = (SELECT id FROM identity_user WHERE email = ?)")
      .get(EMAIL) as { backupCodes: string };
    expect(row.backupCodes).not.toContain(backupCodes[0]);

    const first = await signIn(auth, EMAIL, PASSWORD);
    await expect(
      api(auth).verifyBackupCode({
        body: { code: backupCodes[0] ?? "" },
        headers: cookieHeaders(first.cookie),
        returnHeaders: true,
      }),
    ).resolves.toBeDefined();

    const second = await signIn(auth, EMAIL, PASSWORD);
    await expect(
      api(auth).verifyBackupCode({
        body: { code: backupCodes[0] ?? "" },
        headers: cookieHeaders(second.cookie),
      }),
    ).rejects.toThrow();
  });

  it("revokes every other session after a security change", async () => {
    const { auth, secret } = await enrolledUser();

    const openSession = async (): Promise<string> => {
      const challenge = await signIn(auth, EMAIL, PASSWORD);
      const verified = await api(auth).verifyTOTP({
        body: { code: (await api(auth).generateTOTP({ body: { secret } })).code },
        headers: cookieHeaders(challenge.cookie),
        returnHeaders: true,
      });
      return cookieFrom(verified.headers);
    };

    const firstSession = await openSession();
    const secondSession = await openSession();

    const revoke = auth.api as unknown as {
      revokeOtherSessions(input: { headers: Headers }): Promise<unknown>;
    };
    await expect(
      revoke.revokeOtherSessions({ headers: cookieHeaders(firstSession) }),
    ).resolves.toBeDefined();

    expect(await auth.api.getSession({ headers: cookieHeaders(secondSession) })).toBeNull();
    expect(await auth.api.getSession({ headers: cookieHeaders(firstSession) })).not.toBeNull();
  });

  it("requires the password to disable and clears the factor", async () => {
    const { auth, raw, sessionCookie } = await enrolledUser();

    await expect(
      api(auth).disableTwoFactor({
        body: { password: "definitely-the-wrong-password" },
        headers: cookieHeaders(sessionCookie),
      }),
    ).rejects.toThrow();

    await expect(
      api(auth).disableTwoFactor({
        body: { password: PASSWORD },
        headers: cookieHeaders(sessionCookie),
      }),
    ).resolves.toBeDefined();

    const state = raw
      .prepare(
        `SELECT u.twoFactorEnabled AS enabled,
                (SELECT COUNT(*) FROM identity_two_factor f WHERE f.userId = u.id) AS factors
           FROM identity_user u WHERE u.email = ?`,
      )
      .get(EMAIL) as { enabled: number; factors: number };
    expect(state.enabled).toBe(0);
    expect(state.factors).toBe(0);
  });
});
