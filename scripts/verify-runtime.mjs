#!/usr/bin/env node
/**
 * Runtime verification against a running Worker (`npm run start:worker`).
 *
 * Proves the things a unit test cannot: Better Auth runs inside workerd, D1
 * bindings resolve, cookies are set with the right attributes, middleware
 * security headers are applied, unauthenticated routes redirect, TOTP enrolment
 * and challenge work end to end, and session revocation takes effect immediately.
 *
 * Usage: node scripts/verify-runtime.mjs [baseUrl]
 */
import { createHmac } from "node:crypto";

const baseUrl = (process.argv[2] ?? process.env.HESTIAN_BASE_URL ?? "http://127.0.0.1:8787").replace(
  /\/$/,
  "",
);

let failures = 0;
let checks = 0;

function check(name, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${name}${detail === "" ? "" : ` — ${detail}`}`);
}

async function request(path, init = {}) {
  return fetch(`${baseUrl}${path}`, { redirect: "manual", ...init });
}

function cookiesFrom(response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function mergeCookies(...values) {
  // Last value for a name wins: the provider rotates the session cookie when a
  // factor is verified, and sending both would let the server read the stale one.
  const jar = new Map();
  for (const value of values) {
    for (const part of value.split(";")) {
      const trimmed = part.trim();
      if (trimmed === "") continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;
      jar.set(trimmed.slice(0, index), trimmed.slice(index + 1));
    }
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of input.replace(/=+$/, "").toUpperCase()) {
    const index = BASE32.indexOf(character);
    if (index === -1) throw new Error("Invalid base32 secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP, used only by this verification script. */
function totp(secret) {
  const counter = BigInt(Math.floor(Date.now() / 1000 / 30));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

const email = `runtime+${Date.now()}@example.com`;
const password = "runtime-verification-password";

console.log(`Runtime verification against ${baseUrl}`);

const health = await request("/api/health");
const healthBody = await health.json();
check("health endpoint responds 200", health.status === 200, `status ${health.status}`);
check("database binding is reachable", healthBody.dependencies?.database === "ok");
check("authentication is configured", healthBody.dependencies?.authentication === "configured");

const anonymousWorkspace = await request("/workspace");
check(
  "unauthenticated workspace redirects to sign-in",
  [301, 302, 303, 307, 308].includes(anonymousWorkspace.status) &&
    (anonymousWorkspace.headers.get("location") ?? "").includes("/sign-in"),
  `status ${anonymousWorkspace.status} location ${anonymousWorkspace.headers.get("location")}`,
);

const anonymousSettings = await request("/settings/security");
check(
  "unauthenticated security settings redirect",
  anonymousSettings.status === 307 &&
    (anonymousSettings.headers.get("location") ?? "").includes("/sign-in"),
  `status ${anonymousSettings.status}`,
);

const anonymousExport = await request("/api/privacy/export/unknown");
check("export download requires a session", anonymousExport.status === 401);
const anonymousAudit = await request("/api/audit/export?businessId=unknown");
check("audit export requires a session", anonymousAudit.status === 401);

const signUp = await request("/api/auth/sign-up/email", {
  method: "POST",
  headers: { "content-type": "application/json", origin: baseUrl },
  body: JSON.stringify({ name: "Runtime Check", email, password }),
});
const signUpBody = await signUp.json();
check("sign-up succeeds", signUp.status === 200 && typeof signUpBody.user?.id === "string");

let cookies = cookiesFrom(signUp);
check("session cookie is HttpOnly", /HttpOnly/i.test(signUp.headers.getSetCookie().join("; ")));
check(
  "session cookie is SameSite=Lax",
  /SameSite=Lax/i.test(signUp.headers.getSetCookie().join("; ")),
);

const csp = signUp.headers.get("content-security-policy") ?? "";
check("CSP carries a nonce", /'nonce-[^']+'/.test(csp));
check("CSP blocks inline scripts", !/script-src[^;]*'unsafe-inline'/.test(csp));
check("production CSP forbids eval", !/script-src[^;]*'unsafe-eval'/.test(csp));
check("CSP forbids framing", csp.includes("frame-ancestors 'none'"));
check("nosniff is set", signUp.headers.get("x-content-type-options") === "nosniff");

const session = await request("/api/auth/get-session", { headers: { cookie: cookies } });
const sessionBody = await session.json();
check("authenticated session resolves", sessionBody?.user?.email === email);

const workspace = await request("/workspace", { headers: { cookie: cookies } });
check("authenticated workspace renders", workspace.status === 200);

const enable = await request("/api/auth/two-factor/enable", {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookies, origin: baseUrl },
  body: JSON.stringify({ password }),
});
const enableBody = await enable.json();
check("MFA enrolment returns a TOTP URI", enable.status === 200 && typeof enableBody.totpURI === "string");
check("MFA enrolment returns recovery codes", (enableBody.backupCodes ?? []).length === 10);

const secret = new URL(enableBody.totpURI).searchParams.get("secret");
const confirm = await request("/api/auth/two-factor/verify-totp", {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookies, origin: baseUrl },
  body: JSON.stringify({ code: totp(secret) }),
});
check("TOTP enrolment confirms", confirm.status === 200, `status ${confirm.status}`);
cookies = mergeCookies(cookies, cookiesFrom(confirm));

const enabledSession = await request("/api/auth/get-session", { headers: { cookie: cookies } });
const enabledBody = await enabledSession.json();
check("session survives MFA enrolment", enabledBody?.user?.email === email);

const signOut = await request("/api/auth/sign-out", {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookies, origin: baseUrl },
  body: "{}",
});
check("sign-out succeeds", signOut.status === 200);

const afterSignOut = await request("/api/auth/get-session", { headers: { cookie: cookies } });
check("session is invalid immediately after sign-out", (await afterSignOut.json()) === null);

const challenge = await request("/api/auth/sign-in/email", {
  method: "POST",
  headers: { "content-type": "application/json", origin: baseUrl },
  body: JSON.stringify({ email, password }),
});
const challengeBody = await challenge.json();
check("password-only sign-in is challenged for 2FA", challengeBody.twoFactorRedirect === true);
const challengeCookies = cookiesFrom(challenge);
const challengedSession = await request("/api/auth/get-session", {
  headers: { cookie: challengeCookies },
});
check("challenge does not create a session", (await challengedSession.json()) === null);

const verifyChallenge = await request("/api/auth/two-factor/verify-totp", {
  method: "POST",
  headers: { "content-type": "application/json", cookie: challengeCookies, origin: baseUrl },
  body: JSON.stringify({ code: totp(secret) }),
});
check("TOTP challenge completes sign-in", verifyChallenge.status === 200);
const finalCookies = mergeCookies(challengeCookies, cookiesFrom(verifyChallenge));
const finalSession = await request("/api/auth/get-session", { headers: { cookie: finalCookies } });
check("session exists after the second factor", (await finalSession.json())?.user?.email === email);

const foreignOrigin = await request("/api/auth/sign-in/email", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ email, password }),
});
check(
  "foreign-origin authentication is rejected",
  foreignOrigin.status >= 400 && foreignOrigin.status < 500,
  `status ${foreignOrigin.status}`,
);

const oversized = await request("/api/auth/sign-up/email", {
  method: "POST",
  headers: { "content-type": "application/json", origin: baseUrl },
  body: JSON.stringify({ name: "x", email: "big@example.com", password: "y".repeat(300 * 1024) }),
});
check("oversized request is rejected", oversized.status === 413, `status ${oversized.status}`);

console.log(`\n${checks - failures}/${checks} checks passed.`);
process.exit(failures === 0 ? 0 : 1);
