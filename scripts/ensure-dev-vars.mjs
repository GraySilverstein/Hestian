#!/usr/bin/env node
/**
 * Ensures `next dev` has a usable local signing secret.
 *
 * `.dev.vars` is read once when the dev server starts, so a preview started
 * before the file existed would otherwise keep failing with "Authentication
 * secret must be at least 32 characters" until it was restarted. This script
 * runs before `npm run dev`, creates the ignored file from the committed example
 * when needed, and replaces only the placeholder with a cryptographically random
 * development secret.
 *
 * It never runs for `next build`, the Worker build or deployment, and it never
 * prints or commits the value. Production still fails closed because it reads
 * only platform bindings.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PLACEHOLDER = "development-only-replace-with-32-plus-random-characters";
const MINIMUM_LENGTH = 32;

export function ensureDevVars(directory = process.cwd()) {
  const templatePath = join(directory, ".dev.vars.example");
  const targetPath = join(directory, ".dev.vars");
  const existed = existsSync(targetPath);

  let changed = !existed;
  let contents = existed
    ? readFileSync(targetPath, "utf8")
    : readFileSync(templatePath, "utf8");

  const match = /^BETTER_AUTH_SECRET=(.*)$/m.exec(contents);
  const current = match?.[1]?.trim() ?? "";
  const needsSecret = current === "" || current === PLACEHOLDER || current.length < MINIMUM_LENGTH;

  if (needsSecret && current !== "" && current !== PLACEHOLDER) {
    // A deliberately configured but short secret is a real misconfiguration.
    // Refuse to overwrite it, and let the application fail closed with its own
    // explicit error instead of silently replacing a developer's value.
    throw new Error(
      "BETTER_AUTH_SECRET in .dev.vars is shorter than 32 characters. Replace it with a random value of at least 32 characters.",
    );
  }

  if (needsSecret) {
    const secret = randomBytes(32).toString("base64url");
    contents = match
      ? contents.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${secret}`)
      : `${contents.trimEnd()}\nBETTER_AUTH_SECRET=${secret}\n`;
    changed = true;
  }

  if (!/^BETTER_AUTH_URL=/m.test(contents)) {
    contents = `${contents.trimEnd()}\nBETTER_AUTH_URL=http://127.0.0.1:8787\n`;
    changed = true;
  }

  if (changed) {
    writeFileSync(targetPath, contents, { encoding: "utf8", mode: 0o600 });
    console.log("Local development secret initialised in .dev.vars (git-ignored).");
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    ensureDevVars();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unable to prepare .dev.vars.");
    process.exitCode = 1;
  }
}
