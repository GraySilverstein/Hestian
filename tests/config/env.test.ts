import { describe, expect, it } from "vitest";

import { getServerEnv, parseServerEnv, resetServerEnvCache } from "@/config/env";

describe("server environment", () => {
  it("supplies safe local defaults when nothing is configured", () => {
    const parsed = parseServerEnv({});
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toEqual({
        NODE_ENV: "development",
        HESTIAN_ENV: "local",
        LOG_LEVEL: "info",
      });
    }
  });

  it("rejects invalid values without echoing them", () => {
    const parsed = parseServerEnv({
      NODE_ENV: "staging-ish",
      HESTIAN_ENV: "somewhere",
      LOG_LEVEL: "verbose",
    });

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("CONFIGURATION_INVALID");
      expect(parsed.error.details["fields"]).toEqual(["NODE_ENV", "HESTIAN_ENV", "LOG_LEVEL"]);
      const serialised = JSON.stringify(parsed.error.toSafeJSON());
      expect(serialised).not.toContain("staging-ish");
      expect(serialised).not.toContain("verbose");
    }
  });

  it("fails closed when a secret is exposed through a public variable", () => {
    const parsed = parseServerEnv({
      NEXT_PUBLIC_STRIPE_SECRET_KEY: "sk_live_value",
      HESTIAN_ENV: "preview",
    });

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("CONFIGURATION_INVALID");
      expect(parsed.error.details["keys"]).toEqual(["NEXT_PUBLIC_STRIPE_SECRET_KEY"]);
      expect(JSON.stringify(parsed.error.toSafeJSON())).not.toContain("sk_live_value");
    }
  });

  it("memoises validated configuration until reset", () => {
    resetServerEnvCache();
    const first = getServerEnv();
    const second = getServerEnv();
    expect(second).toBe(first);
    resetServerEnvCache();
    expect(getServerEnv()).not.toBe(first);
  });
});
