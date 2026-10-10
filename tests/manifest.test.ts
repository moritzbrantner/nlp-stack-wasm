// Acceptance (moritzbrantner/nlp-stack-wasm#1): the repository root is one git-installable
// package, @moritzbrantner/nlp-stack-wasm, pinned to an nlp-stack commit, built by `prepare` on a
// git install, exposing text-core-wasm and text-index-wasm as subpath exports, with no npm
// publishing and no repository secrets (owner decision on moritzbrantner/document-search#18).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { expect, test } from "bun:test";

import {
  INITIAL_NLP_STACK_COMMIT,
  PACKAGE_NAME,
  SUBPATHS,
  UPSTREAM_REPOSITORY,
  readManifest,
  repoRoot,
  subpathExport,
} from "./support/upstream";

const manifest = readManifest();

test("the repository root is the @moritzbrantner/nlp-stack-wasm ES module package", () => {
  expect(manifest.name).toBe(PACKAGE_NAME);
  expect(manifest.type).toBe("module");
});

test("the package is installable by consumers: not private, no publish config or registry", () => {
  expect(manifest.private).not.toBe(true);
  expect(manifest.publishConfig).toBeUndefined();
  expect(JSON.stringify(manifest)).not.toMatch(/registry|npm\.pkg\.github\.com/i);
});

test("package.json pins the nlp-stack source by a full commit SHA", () => {
  expect(manifest.nlpStack?.repository).toBe(UPSTREAM_REPOSITORY);
  expect(manifest.nlpStack?.commit).toMatch(/^[0-9a-f]{40}$/);
});

// Issue #1: the migration changes distribution only, so the first pin is the revision
// document-search already uses. A later deliberate bump updates INITIAL_NLP_STACK_COMMIT.
test("the pin is the nlp-stack revision document-search used when the package was created", () => {
  expect(manifest.nlpStack?.commit).toBe(INITIAL_NLP_STACK_COMMIT);
});

test("a git install builds the package through a prepare script and `bun run build`", () => {
  expect(typeof manifest.scripts?.prepare).toBe("string");
  expect(manifest.scripts!.prepare!.trim()).not.toBe("");
  expect(typeof manifest.scripts?.build).toBe("string");
  expect(manifest.scripts!.build!.trim()).not.toBe("");
});

test("the package ships exactly the text-core-wasm and text-index-wasm subpath exports", () => {
  expect(manifest.exports && typeof manifest.exports).toBe("object");
  const subpaths = Object.keys(manifest.exports as object).filter((key) => key !== "./package.json");
  expect(subpaths.sort()).toEqual(Object.keys(SUBPATHS).sort());
});

for (const subpath of Object.keys(SUBPATHS)) {
  test(`exports["${subpath}"] declares types and an import entry, both shipped by \`files\``, () => {
    const entry = subpathExport(subpath, manifest) as Record<string, string> | undefined;
    expect(entry, `package.json exports["${subpath}"]`).toBeDefined();
    expect(typeof entry!.types).toBe("string");
    expect(entry!.types!.endsWith(".d.ts")).toBe(true);
    const importTarget = entry!.import ?? entry!.default;
    expect(typeof importTarget).toBe("string");
    if (manifest.files !== undefined) {
      const shipped = (target: string) =>
        manifest.files!.some((file) => {
          const normalized = file.replace(/^\.\//, "").replace(/\/$/, "");
          const path = target.replace(/^\.\//, "");
          return path === normalized || path.startsWith(`${normalized}/`);
        });
      for (const target of [entry!.types!, importTarget!]) {
        expect(shipped(target), `files covers ${target}`).toBe(true);
      }
    }
  });
}

test("the two subpaths resolve to different entry files", () => {
  const targets = Object.keys(SUBPATHS).map((subpath) => {
    const entry = subpathExport(subpath, manifest) as Record<string, string> | undefined;
    return entry?.import ?? entry?.default;
  });
  expect(new Set(targets).size).toBe(targets.length);
});

// Issue #1: "a plain checkout install does nothing". Run prepare without cargo/wasm-pack on PATH:
// a no-op succeeds, an attempted build cannot.
test("prepare in a plain checkout is a no-op that needs no Rust toolchain", () => {
  const prepare = manifest.scripts?.prepare;
  expect(typeof prepare).toBe("string");
  const toolPath = [dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter);
  for (const tool of ["cargo", "wasm-pack", "rustc"]) {
    const found = toolPath.split(delimiter).some((dir) => existsSync(join(dir, tool)));
    if (found) throw new Error(`${tool} is on the restricted PATH ${toolPath}; cannot prove a no-op`);
  }
  const statusBefore = execFileSync("git", ["-C", repoRoot, "status", "--porcelain"], {
    encoding: "utf8",
  });
  const result = spawnSync(process.execPath, ["run", "prepare"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, PATH: toolPath, CARGO_HOME: "/nonexistent", RUSTUP_HOME: "/nonexistent" },
    timeout: 60_000,
  });
  expect(result.status, `prepare output:\n${result.stdout}\n${result.stderr}`).toBe(0);
  const statusAfter = execFileSync("git", ["-C", repoRoot, "status", "--porcelain"], {
    encoding: "utf8",
  });
  expect(statusAfter).toBe(statusBefore);
});

const trackedFiles = execFileSync("git", ["-C", repoRoot, "ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((path) => path !== "" && !path.startsWith("tests/") && existsSync(join(repoRoot, path)));

function textOf(path: string): string | undefined {
  const buffer = readFileSync(join(repoRoot, path));
  return buffer.includes(0) ? undefined : buffer.toString("utf8");
}

test("no tracked file needs repository secrets or registry tokens", () => {
  const offenders: string[] = [];
  for (const path of trackedFiles) {
    const text = textOf(path);
    if (text === undefined) continue;
    const match = text.match(
      /\$\{\{\s*secrets\.|NPM_TOKEN|NODE_AUTH_TOKEN|GH_PACKAGES_TOKEN|_authToken/,
    );
    if (match) offenders.push(`${path}: ${match[0]}`);
  }
  expect(offenders).toEqual([]);
});

test("nothing publishes the package to a registry", () => {
  const publish = /\b(?:npm|bun|pnpm|yarn)\s+publish\b|changeset\s+publish|wasm-pack\s+publish/;
  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    expect(command, `script ${name}`).not.toMatch(publish);
  }
  expect(Object.keys(manifest.scripts ?? {})).not.toContain("publish");
  const offenders = trackedFiles
    .filter((path) => path.startsWith(".github/") || path.startsWith("scripts/"))
    .filter((path) => publish.test(textOf(path) ?? ""));
  expect(offenders).toEqual([]);
});
