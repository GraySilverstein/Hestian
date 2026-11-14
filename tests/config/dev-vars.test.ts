import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../../scripts/ensure-dev-vars.mjs", import.meta.url));
const PLACEHOLDER = "development-only-replace-with-32-plus-random-characters";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "hestian-dev-vars-"));
  writeFileSync(
    join(directory, ".dev.vars.example"),
    `NEXTJS_ENV=development\nBETTER_AUTH_SECRET=${PLACEHOLDER}\nBETTER_AUTH_URL=http://127.0.0.1:8787\n`,
  );
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function run(): void {
  execFileSync(process.execPath, [SCRIPT], { cwd: directory, stdio: "pipe" });
}

function secret(): string {
  const contents = readFileSync(join(directory, ".dev.vars"), "utf8");
  return /^BETTER_AUTH_SECRET=(.*)$/m.exec(contents)?.[1]?.trim() ?? "";
}

describe("development variable bootstrap", () => {
  it("creates an ignored .dev.vars with a random 32+ character secret", () => {
    run();
    const value = secret();
    expect(value.length).toBeGreaterThanOrEqual(32);
    expect(value).not.toBe(PLACEHOLDER);
  });

  it("is idempotent and preserves an existing valid secret", () => {
    run();
    const first = readFileSync(join(directory, ".dev.vars"), "utf8");
    run();
    expect(readFileSync(join(directory, ".dev.vars"), "utf8")).toBe(first);
  });

  it("refuses to overwrite a deliberately short secret", () => {
    writeFileSync(join(directory, ".dev.vars"), "BETTER_AUTH_SECRET=short\n");
    expect(() => run()).toThrow();
    expect(readFileSync(join(directory, ".dev.vars"), "utf8")).toBe("BETTER_AUTH_SECRET=short\n");
  });
});
