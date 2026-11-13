#!/usr/bin/env node
/**
 * Runtime verification against a running Worker (`npm run start:worker`).
 *
 * Proves the things a unit test cannot: Better Auth runs inside workerd, D1
 * bindings resolve, cookies are set with the right attributes, middleware
 * security headers are applied, unauthenticated routes redirect, and session
 * revocation takes effect immediately.
 *
 * Usage: node scripts/verify-runtime.mjs [baseUrl]
 */
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

const signUp = await request("/api/auth/sign-up/email", {
  method: "POST",
  headers: { "content-type": "application/json", origin: baseUrl },
  body: JSON.stringify({ name: "Runtime Check", email, password }),
});
const signUpBody = await signUp.json();
check("sign-up succeeds", signUp.status === 200 && typeof signUpBody.user?.id === "string");

const cookies = signUp.headers.getSetCookie().join("; ");
check("session cookie is HttpOnly", /HttpOnly/i.test(cookies));
check("session cookie is SameSite=Lax", /SameSite=Lax/i.test(cookies));

const csp = signUp.headers.get("content-security-policy") ?? "";
check("CSP carries a nonce", /'nonce-[^']+'/.test(csp));
check("CSP blocks inline scripts", !/script-src[^;]*'unsafe-inline'/.test(csp));
check("CSP forbids framing", csp.includes("frame-ancestors 'none'"));
check("nosniff is set", signUp.headers.get("x-content-type-options") === "nosniff");

const session = await request("/api/auth/get-session", { headers: { cookie: cookies } });
const sessionBody = await session.json();
check("authenticated session resolves", sessionBody?.user?.email === email);

const workspace = await request("/workspace", { headers: { cookie: cookies } });
check("authenticated workspace renders", workspace.status === 200);

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

const signOut = await request("/api/auth/sign-out", {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookies, origin: baseUrl },
  body: "{}",
});
check("sign-out succeeds", signOut.status === 200);

const afterSignOut = await request("/api/auth/get-session", { headers: { cookie: cookies } });
const afterSignOutBody = await afterSignOut.json();
check("session is invalid immediately after sign-out", afterSignOutBody === null);

console.log(`\n${checks - failures}/${checks} checks passed.`);
process.exit(failures === 0 ? 0 : 1);
