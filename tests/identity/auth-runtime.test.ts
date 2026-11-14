import { describe, expect, it } from "vitest";

import { DomainError } from "@/core/errors";
import {
  requireAuthSecret,
  resolveAuthBaseUrl,
  resolveAuthMode,
} from "@/modules/identity/auth-runtime";

const VALID_SECRET = "a".repeat(32);

describe("authentication secret", () => {
  it("accepts a valid development secret from the binding or process env", () => {
    expect(requireAuthSecret(VALID_SECRET, undefined, "development")).toBe(VALID_SECRET);
    expect(requireAuthSecret(undefined, VALID_SECRET, "development")).toBe(VALID_SECRET);
  });

  it("fails closed when the production binding is missing", () => {
    expect(() => requireAuthSecret(undefined, undefined, "production")).toThrow(DomainError);
  });

  it("fails closed when the secret is too short", () => {
    const short = "too-short-secret";
    try {
      requireAuthSecret(short, undefined, "production");
      expect.unreachable("short secret must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("CONFIGURATION_INVALID");
      expect(JSON.stringify((error as DomainError).toSafeJSON())).not.toContain(short);
    }
  });

  it("does not fall back to an ambient development secret in production", () => {
    expect(() => requireAuthSecret(undefined, VALID_SECRET, "production")).toThrow(DomainError);
  });

  it("trims whitespace but rejects a whitespace-only value", () => {
    expect(requireAuthSecret(`  ${VALID_SECRET}  `, undefined, "production")).toBe(VALID_SECRET);
    expect(() => requireAuthSecret("   ", undefined, "production")).toThrow(DomainError);
  });
});

describe("authentication base URL", () => {
  it("uses the configured origin in production and ignores a request origin", () => {
    const url = resolveAuthBaseUrl({
      configured: "https://hestian.example",
      mode: "production",
      requestOrigin: "http://127.0.0.1:3100",
    });
    expect(url).toBe("https://hestian.example");
  });

  it("derives the loopback origin for the development server", () => {
    expect(
      resolveAuthBaseUrl({
        configured: "http://127.0.0.1:8787",
        mode: "development",
        requestOrigin: "http://127.0.0.1:3100",
      }),
    ).toBe("http://127.0.0.1:3100");
  });

  it("ignores non-loopback request origins in development", () => {
    expect(
      resolveAuthBaseUrl({
        configured: "http://127.0.0.1:8787",
        mode: "development",
        requestOrigin: "https://attacker.example",
      }),
    ).toBe("http://127.0.0.1:8787");
  });

  it("rejects malformed, credentialed and path-bearing origins", () => {
    for (const configured of [
      "",
      "not a url",
      "ftp://hestian.example",
      "https://user:pass@hestian.example",
      "https://hestian.example/path",
      "https://hestian.example/?query=1",
    ]) {
      expect(() => resolveAuthBaseUrl({ configured, mode: "production" })).toThrow(DomainError);
    }
  });
});

describe("authentication mode", () => {
  it("selects development only for a local dev server", () => {
    expect(resolveAuthMode({ nodeEnv: "development", hestianEnv: "local" })).toBe("development");
    expect(resolveAuthMode({ nodeEnv: "development", hestianEnv: undefined })).toBe("development");
  });

  it("cannot select the development mode for preview or production", () => {
    expect(resolveAuthMode({ nodeEnv: "development", hestianEnv: "preview" })).toBe("production");
    expect(resolveAuthMode({ nodeEnv: "development", hestianEnv: "production" })).toBe(
      "production",
    );
    expect(resolveAuthMode({ nodeEnv: "production", hestianEnv: "local" })).toBe("production");
    expect(resolveAuthMode({})).toBe("production");
  });
});
