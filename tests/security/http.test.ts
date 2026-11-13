import { describe, expect, it } from "vitest";
import { z } from "zod";

import { DomainError } from "@/core/errors";
import {
  errorResponse,
  isSameOrigin,
  parseJsonBody,
} from "@/core/http";
import { contentSecurityPolicy, securityHeaders } from "@/core/security-headers";

const schema = z.object({ name: z.string().min(2), count: z.number().int().nonnegative() });

function jsonRequest(body: unknown, init: RequestInit = {}): Request {
  return new Request("https://hestian.example/api/resource", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://hestian.example" },
    body: JSON.stringify(body),
    ...init,
  });
}

describe("same-origin enforcement", () => {
  it("accepts a request from the same host and rejects a missing origin", () => {
    expect(isSameOrigin(jsonRequest({}))).toBe(true);

    const noOrigin = new Request("https://hestian.example/api/resource", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(isSameOrigin(noOrigin)).toBe(false);
  });

  it("rejects a foreign origin unless it is explicitly trusted", () => {
    const foreign = jsonRequest({}, { headers: { "content-type": "application/json", origin: "https://evil.example" } });
    expect(isSameOrigin(foreign)).toBe(false);
    expect(isSameOrigin(foreign, ["https://evil.example"])).toBe(true);
  });

  it("rejects malformed origins", () => {
    const malformed = jsonRequest({}, { headers: { "content-type": "application/json", origin: "not a url" } });
    expect(isSameOrigin(malformed)).toBe(false);
  });
});

describe("JSON body validation", () => {
  it("accepts a valid body", async () => {
    const result = await parseJsonBody(jsonRequest({ name: "Alpha", count: 2 }), schema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe("Alpha");
  });

  it("rejects non-JSON content types", async () => {
    const request = new Request("https://hestian.example/api/resource", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    const result = await parseJsonBody(request, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_ARGUMENT");
  });

  it("rejects oversized and malformed bodies", async () => {
    const oversizedHeader = jsonRequest({}, { headers: { "content-type": "application/json", "content-length": "999999" } });
    const tooBig = await parseJsonBody(oversizedHeader, schema);
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.error.code).toBe("PAYLOAD_TOO_LARGE");

    const bigBody = await parseJsonBody(jsonRequest({ name: "x".repeat(200), count: 1 }), schema, {
      maxBytes: 100,
    });
    expect(bigBody.ok).toBe(false);
    if (!bigBody.ok) expect(bigBody.error.code).toBe("PAYLOAD_TOO_LARGE");

    const invalidJson = new Request("https://hestian.example/api/resource", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const malformed = await parseJsonBody(invalidJson, schema);
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.error.code).toBe("INVALID_ARGUMENT");
  });

  it("reports field paths without echoing values", async () => {
    const result = await parseJsonBody(jsonRequest({ name: "s3cret-value", count: -1 }), schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(JSON.stringify(result.error.toSafeJSON())).not.toContain("s3cret-value");
    }
  });
});

describe("error responses", () => {
  it("maps domain codes to statuses without stack traces", async () => {
    const response = errorResponse(
      new DomainError({ code: "FORBIDDEN", message: "You do not have permission." }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(JSON.stringify(body)).not.toContain("stack");

    const internal = errorResponse(new Error("postgres://user:pass@host/db"));
    expect(internal.status).toBe(500);
    expect(JSON.stringify(await internal.json())).not.toContain("postgres://");
  });
});

describe("security headers", () => {
  it("uses a nonce for scripts and never allows unsafe-inline scripts", () => {
    const csp = contentSecurityPolicy("nonce-value");
    expect(csp).toContain("'nonce-nonce-value'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("sets the core header set and only sends HSTS over HTTPS", () => {
    const https = securityHeaders({ nonce: "n", isHttps: true });
    expect(https["strict-transport-security"]).toContain("max-age=31536000");
    expect(https["x-content-type-options"]).toBe("nosniff");
    expect(https["x-frame-options"]).toBe("DENY");
    expect(https["cross-origin-opener-policy"]).toBe("same-origin");

    const http = securityHeaders({ nonce: "n", isHttps: false });
    expect(http["strict-transport-security"]).toBeUndefined();
  });
});
