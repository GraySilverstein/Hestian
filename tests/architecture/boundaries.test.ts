import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MODULES,
  MODULE_IDS,
  findDependencyCycles,
  getModule,
  isImportAllowed,
  type ModuleId,
} from "@/modules/manifest";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const srcRoot = join(projectRoot, "src");

function toPosix(absolutePath: string): string {
  return relative(projectRoot, absolutePath).split(sep).join("/");
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

const IMPORT_PATTERN = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_PATTERN)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => typeof specifier === "string");
}

function resolveSpecifier(file: string, specifier: string): string | undefined {
  if (specifier.startsWith("@/")) return join(srcRoot, specifier.slice(2));
  if (specifier.startsWith(".")) return resolve(dirname(file), specifier);
  return undefined; // Third-party package.
}

function moduleIdForPath(posixPath: string): ModuleId | undefined {
  const match = /^src\/modules\/([^/]+)\//.exec(posixPath);
  const candidate = match?.[1];
  return candidate !== undefined && (MODULE_IDS as readonly string[]).includes(candidate)
    ? (candidate as ModuleId)
    : undefined;
}

describe("module manifest", () => {
  it("declares every bounded context directory with its own ownership document", () => {
    for (const id of MODULE_IDS) {
      const readmePath = join(srcRoot, "modules", id, "README.md");
      const contents = readFileSync(readmePath, "utf8");
      expect(contents.startsWith(`# ${id}\n`)).toBe(true);
      expect(contents).toContain("## Owns");
      expect(contents).toContain("## Does not own");
      expect(contents).toContain("## May depend on");
    }
  });

  it("has no unregistered module directories", () => {
    const directories = readdirSync(join(srcRoot, "modules"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(directories).toEqual([...MODULE_IDS].sort());
  });

  it("is acyclic", () => {
    expect(findDependencyCycles()).toEqual([]);
  });

  it("never lets a non-analytical layer depend on an analytical module", () => {
    const violations = MODULES.flatMap((module) =>
      module.mayDependOn
        .filter(
          (dependency) =>
            module.layer !== "analytical" && getModule(dependency).layer === "analytical",
        )
        .map((dependency) => `${module.id} -> ${dependency}`),
    );

    expect(violations).toEqual([]);
  });

  it("keeps financial-core dependent on nothing but tenancy and audit", () => {
    expect([...getModule("financial-core").mayDependOn].sort()).toEqual(["audit", "tenancy"]);
  });

  it("keeps intelligence a leaf that no module imports", () => {
    const importers = MODULES.filter((module) => module.mayDependOn.includes("intelligence"));
    expect(importers).toEqual([]);
  });

  it("rejects undeclared dependencies", () => {
    expect(isImportAllowed("financial-core", "intelligence")).toBe(false);
    expect(isImportAllowed("growth", "commerce-intelligence")).toBe(false);
    expect(isImportAllowed("tenancy", "identity")).toBe(true);
    expect(isImportAllowed("financial-core", "financial-core")).toBe(true);
  });
});

describe("source boundaries", () => {
  it("enforces declared dependency edges, layer direction and core independence", () => {
    const violations: string[] = [];
    const files = walk(srcRoot);

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const filePath = toPosix(file);
      const owner = moduleIdForPath(filePath);

      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        const target = resolveSpecifier(file, specifier);
        if (target === undefined) continue;
        const targetPath = toPosix(target);

        if (owner !== undefined && targetPath.startsWith("src/app")) {
          violations.push(`${filePath} imports ${specifier}: modules must not depend on the app shell`);
          continue;
        }

        const targetModule = moduleIdForPath(targetPath);
        if (targetModule === undefined) continue;

        const isCoreOrConfig =
          filePath.startsWith("src/core/") || filePath.startsWith("src/config/");
        if (isCoreOrConfig) {
          violations.push(
            `${filePath} imports ${specifier}: core and config must stay independent of modules`,
          );
          continue;
        }

        // The app shell may compose modules; it has no dependency declaration.
        if (owner === undefined) continue;

        if (!isImportAllowed(owner, targetModule)) {
          violations.push(
            `${filePath} imports ${specifier}: ${owner} may not depend on ${targetModule}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
