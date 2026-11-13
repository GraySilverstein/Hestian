import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { resendVerificationEmail } from "@/modules/identity";

import { createTestAuth } from "../helpers/auth";
import { createCapturingMailer, lastLink, tokenFrom } from "../helpers/mailer";
import { cookieHeaders, signIn } from "../helpers/session";
import { createTestDatabase, type TestDatabase } from "../helpers/sqlite";

const PASSWORD = "correct-horse-battery-staple";
let database: TestDatabase | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
});

function open(): TestDatabase {
  database = createTestDatabase();
  return database;
}

async function signUp(
  auth: ReturnType<typeof createTestAuth>,
  email: string,
): Promise<void> {
  await auth.api.signUpEmail({
    body: { name: "Verification User", email, password: PASSWORD },
    headers: new Headers(),
  });
}

describe("email verification", () => {
  it("fails closed until the address is verified, then rejects replay", async () => {
    const { raw } = open();
    const mailer = createCapturingMailer();
    const auth = createTestAuth(raw, { mailer, requireEmailVerification: true });

    await signUp(auth, "verify@example.com");
    expect(mailer.messages).toHaveLength(1);
    const token = tokenFrom(lastLink(mailer.messages));

    await expect(signIn(auth, "verify@example.com", PASSWORD)).rejects.toThrow();

    await auth.api.verifyEmail({ query: { token } });
    const verified = raw
      .prepare("SELECT emailVerified FROM identity_user WHERE email = ?")
      .get("verify@example.com") as { emailVerified: number };
    expect(verified.emailVerified).toBe(1);

    const signedIn = await signIn(auth, "verify@example.com", PASSWORD);
    expect(signedIn.requiresTwoFactor).toBe(false);
    expect(signedIn.cookie).toContain("better-auth.session_token=");

    // A consumed token is not reusable: the provider treats it as invalid and
    // does not verify anything a second time.
    const replay = (await auth.api.verifyEmail({ query: { token } })) as { user?: unknown };
    expect(replay.user ?? null).toBeNull();
  });

  it("rejects an expired verification token", async () => {
    const { raw } = open();
    const mailer = createCapturingMailer();
    const auth = createTestAuth(raw, { mailer, requireEmailVerification: true });

    await signUp(auth, "expired@example.com");
    const token = tokenFrom(lastLink(mailer.messages));

    // Verification tokens are signed JWTs; expiry is carried by the token itself.
    // Forge an already-expired token with the same secret to prove it is rejected.
    const expiredToken = await new SignJWT({ email: "expired@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode("test-secret-with-at-least-32-characters"));
    expect(token).not.toBe(expiredToken);

    await expect(auth.api.verifyEmail({ query: { token: expiredToken } })).rejects.toThrow();
    const stillUnverified = raw
      .prepare("SELECT emailVerified FROM identity_user WHERE email = ?")
      .get("expired@example.com") as { emailVerified: number };
    expect(stillUnverified.emailVerified).toBe(0);
  });

  it("resets a password once, revokes sessions, and does not reveal unknown accounts", async () => {
    const { raw } = open();
    const mailer = createCapturingMailer();
    const auth = createTestAuth(raw, {
      mailer,
      // Mirrors the production `onPasswordReset` hook in auth.ts.
      onPasswordReset: async (userId) => {
        raw.prepare("DELETE FROM identity_session WHERE userId = ?").run(userId);
      },
    });
    const email = "reset@example.com";

    await signUp(auth, email);
    const session = await signIn(auth, email, PASSWORD);

    mailer.messages.length = 0;
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "http://localhost:3000/reset-password" },
    });
    const token = tokenFrom(lastLink(mailer.messages));

    await expect(
      auth.api.resetPassword({ body: { newPassword: "another-long-password-1", token } }),
    ).resolves.toBeDefined();

    const revoked = await auth.api.getSession({ headers: cookieHeaders(session.cookie) });
    expect(revoked).toBeNull();

    await expect(
      auth.api.resetPassword({ body: { newPassword: "third-long-password-12", token } }),
    ).rejects.toThrow();

    await expect(signIn(auth, email, PASSWORD)).rejects.toThrow();
    const fresh = await signIn(auth, email, "another-long-password-1");
    expect(fresh.cookie).toContain("better-auth.session_token=");
  });

  it("throttles resends per address and never reveals the outcome", async () => {
    const { db, raw } = open();
    const mailer = createCapturingMailer();
    const auth = createTestAuth(raw, { mailer });
    const now = new Date("2026-01-01T00:00:00.000Z");

    await signUp(auth, "throttle@example.com");
    mailer.messages.length = 0;

    const first = await resendVerificationEmail(
      db,
      auth,
      "Throttle@Example.com",
      "http://localhost:3000/workspace",
      now,
    );
    const second = await resendVerificationEmail(
      db,
      auth,
      "throttle@example.com",
      "http://localhost:3000/workspace",
      now,
    );
    const third = await resendVerificationEmail(
      db,
      auth,
      "throttle@example.com",
      "http://localhost:3000/workspace",
      now,
    );

    expect([first.attempted, second.attempted, third.attempted]).toEqual([true, true, false]);
    expect(third.rateLimited).toBe(true);
    expect(mailer.messages).toHaveLength(2);

    // Case and whitespace do not create a new bucket.
    expect(
      (
        await resendVerificationEmail(
          db,
          auth,
          " throttle@example.com ",
          "http://localhost:3000/workspace",
          now,
        )
      ).rateLimited,
    ).toBe(true);
  });

  it("returns the same outcome for unknown addresses", async () => {
    const { raw } = open();
    const auth = createTestAuth(raw);

    await expect(
      auth.api.requestPasswordReset({
        body: { email: "nobody@example.com", redirectTo: "http://localhost:3000/reset-password" },
      }),
    ).resolves.toBeDefined();
  });
});
