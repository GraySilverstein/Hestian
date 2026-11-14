#!/usr/bin/env node
/**
 * Runtime verification for the Next.js development preview.
 *
 * The development policy intentionally differs from production in exactly one
 * place (eval for React/Turbopack). This script proves that the dev server is
 * reachable, authentication received a valid local secret, the loopback origin
 * is accepted, and the served policy still keeps nonces, strict-dynamic and
 * frame-ancestors in place. It also scans the served client chunks for the local
 * signing secret without ever printing it.
 *
 * Usage: node scripts/verify-dev-preview.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";

const baseUrl = (
  process.argv[2] ??
  process.env.HESTIAN_DEV_URL ??
  "http://127.0.0.1:3100"
).replace(/\/$/, "");

let checks = 0;
let failures = 0;

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

function assertDevelopmentCsp(label, csp) {
  check(`${label} carries a nonce`, /'nonce-[^']+'/.test(csp));
  check(`${label} allows eval only for the dev runtime`, /script-src[^;]*'unsafe-eval'/.test(csp));
  check(`${label} blocks inline scripts`, !/script-src[^;]*'unsafe-inline'/.test(csp));
  check(`${label} keeps strict-dynamic`, csp.includes("'strict-dynamic'"));
  check(`${label} forbids framing`, csp.includes("frame-ancestors 'none'"));
  check(`${label} does not widen connect-src`, /connect-src 'self'/.test(csp));
}

console.log(`Development preview verification against ${baseUrl}`);

const health = await request("/api/health");
const healthBody = await health.json();
check("health endpoint responds 200", health.status === 200, `status ${health.status}`);
check("database binding is reachable", healthBody.dependencies?.database === "ok");
check(
  "authentication initialised from the development secret",
  healthBody.dependencies?.authentication === "configured",
  String(healthBody.dependencies?.authentication),
);
assertDevelopmentCsp("API CSP", health.headers.get("content-security-policy") ?? "");

const root = await request("/");
const rootHtml = await root.text();
check("application page responds 200", root.status === 200, `status ${root.status}`);
check("application page is HTML", (root.headers.get("content-type") ?? "").includes("text/html"));
assertDevelopmentCsp("page CSP", root.headers.get("content-security-policy") ?? "");

const signIn = await request("/sign-in");
const signInHtml = await signIn.text();
check("sign-in page responds 200", signIn.status === 200, `status ${signIn.status}`);
assertDevelopmentCsp("sign-in CSP", signIn.headers.get("content-security-policy") ?? "");

const redirect = await request("/workspace");
check(
  "unauthenticated workspace redirects",
  [301, 302, 303, 307, 308].includes(redirect.status) &&
    (redirect.headers.get("location") ?? "").includes("/sign-in"),
  `status ${redirect.status}`,
);
check(
  "redirect carries the development CSP",
  /script-src[^;]*'unsafe-eval'/.test(redirect.headers.get("content-security-policy") ?? ""),
);

const notFound = await request("/definitely-not-found");
check("error response is served", notFound.status === 404, `status ${notFound.status}`);
check(
  "error response carries the development CSP",
  /script-src[^;]*'unsafe-eval'/.test(notFound.headers.get("content-security-policy") ?? ""),
);

const originCheck = await request("/api/auth/sign-in/email", {
  method: "POST",
  headers: { "content-type": "application/json", origin: baseUrl },
  body: JSON.stringify({
    email: `preview-${Date.now()}@example.com`,
    password: "not-the-right-password",
  }),
});
const originBody = await originCheck.json().catch(() => ({}));
check(
  "preview origin is accepted by Better Auth",
  originCheck.status !== 403 || originBody.code !== "INVALID_ORIGIN",
  `status ${originCheck.status} code ${originBody.code}`,
);

let secret = "";
try {
  const devVars = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  secret = /^BETTER_AUTH_SECRET=(.*)$/m.exec(devVars)?.[1]?.trim() ?? "";
} catch {
  // The preview may be served from a platform-provided secret instead.
}

if (secret !== "") {
  check("secret is absent from page HTML", !rootHtml.includes(secret) && !signInHtml.includes(secret));

  const chunks = new Set(
    [...`${rootHtml}${signInHtml}`.matchAll(/<script[^>]+src="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((src) => src !== undefined && src.startsWith("/")),
  );
  let leaked = false;
  for (const chunk of [...chunks].slice(0, 40)) {
    const response = await request(chunk);
    if (response.status === 200 && (await response.text()).includes(secret)) {
      leaked = true;
      break;
    }
  }
  check("secret is absent from served client chunks", !leaked);
} else {
  console.log("  skip secret bundle scan (no .dev.vars secret)");
}

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) process.exitCode = 1;
