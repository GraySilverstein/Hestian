import { describe, expect, it } from "vitest";

import { REDACTED, createLogger, type LogSink } from "@/core/logging";

function capture(): { lines: Record<string, unknown>[]; sink: LogSink } {
  const lines: Record<string, unknown>[] = [];
  return {
    lines,
    sink: (line) => {
      lines.push({ ...line });
    },
  };
}

const fixedClock = () => new Date("2026-01-01T00:00:00.000Z");

describe("logger", () => {
  it("emits one structured line with a stable event name", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ sink, now: fixedClock, fields: { moduleId: "financial-core" } });

    logger.info("entry.posted", { entryId: "je_01" });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      time: "2026-01-01T00:00:00.000Z",
      level: "info",
      service: "hestian",
      event: "entry.posted",
      moduleId: "financial-core",
      entryId: "je_01",
    });
  });

  it("honours the minimum level", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ sink, level: "warn", now: fixedClock });

    logger.debug("debug.event");
    logger.info("info.event");
    logger.warn("warn.event");
    logger.error("error.event");

    expect(lines.map((line) => line["event"])).toEqual(["warn.event", "error.event"]);
  });

  it("redacts sensitive keys at any depth and never serialises the value", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ sink, now: fixedClock });

    logger.error("integration.failed", {
      provider: "stripe",
      apiKey: "sk_live_should_never_appear",
      nested: { authorization: "Bearer abc.def", refresh_token: "rt_value" },
      credentials: [{ password: "hunter2" }],
    });

    const serialised = JSON.stringify(lines);
    expect(serialised).not.toContain("sk_live_should_never_appear");
    expect(serialised).not.toContain("abc.def");
    expect(serialised).not.toContain("rt_value");
    expect(serialised).not.toContain("hunter2");
    expect(serialised).toContain(REDACTED);
    expect(lines[0]).toMatchObject({ provider: "stripe" });
  });

  it("binds child fields without mutating the parent logger", () => {
    const { lines, sink } = capture();
    const parent = createLogger({ sink, now: fixedClock, fields: { tenantId: "t_1" } });
    const child = parent.child({ requestId: "req_1" });

    child.info("child.event");
    parent.info("parent.event");

    expect(lines[0]).toMatchObject({ tenantId: "t_1", requestId: "req_1" });
    expect(lines[1]).toMatchObject({ tenantId: "t_1" });
    expect(lines[1]).not.toHaveProperty("requestId");
  });

  it("describes errors instead of serialising arbitrary objects", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ sink, now: fixedClock });

    logger.error("unexpected", { error: new Error("connection to 10.0.0.5 refused") });

    expect(lines[0]?.["error"]).toEqual({
      type: "Error",
      name: "Error",
      message: "connection to 10.0.0.5 refused",
    });
  });

  it("bounds payload size and survives circular structures", () => {
    const { lines, sink } = capture();
    const logger = createLogger({ sink, now: fixedClock });

    const circular: Record<string, unknown> = { name: "loop" };
    circular["self"] = circular;
    logger.info("circular.event", { circular, long: "x".repeat(2000) });

    const serialised = JSON.stringify(lines);
    expect(serialised).toContain("[circular]");
    expect(serialised).toContain("[truncated");
    expect(serialised.length).toBeLessThan(2000);
  });
});
