// Acceptance helpers: read this package's manifest, resolve its subpath exports and fetch files
// from the pinned moritzbrantner/nlp-stack revision, which owns the Rust source and the JS APIs.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PACKAGE_NAME = "@moritzbrantner/nlp-stack-wasm";
export const UPSTREAM_REPOSITORY = "https://github.com/moritzbrantner/nlp-stack";

/** The nlp-stack revision document-search used when issue #1 was filed (distribution-only move). */
export const INITIAL_NLP_STACK_COMMIT = "1ea22b3dd802e79444ab355968066390f21cfcd8";

/** Subpath export -> nlp-stack package directory whose JS API and index.d.ts it ships. */
export const SUBPATHS = {
  "./text-core-wasm": "packages/text-core-wasm",
  "./text-index-wasm": "packages/text-index-wasm",
} as const;
export type Subpath = keyof typeof SUBPATHS;

export const repoRoot = resolve(import.meta.dir, "../..");

export interface Manifest {
  name?: string;
  private?: unknown;
  type?: string;
  files?: string[];
  exports?: unknown;
  scripts?: Record<string, string>;
  publishConfig?: unknown;
  nlpStack?: { repository?: string; commit?: string };
  [key: string]: unknown;
}

export function readManifest(dir = repoRoot): Manifest {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Manifest;
}

export function pinnedCommit(manifest: Manifest = readManifest()): string {
  const commit = manifest.nlpStack?.commit;
  if (typeof commit !== "string" || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(
      `package.json nlpStack.commit must be a 40-hex nlp-stack commit, got ${JSON.stringify(commit)}`,
    );
  }
  return commit;
}

const cache = new Map<string, string>();

/**
 * Reads `path` from moritzbrantner/nlp-stack at `commit`. Uses a local clone when NLP_STACK_DIR
 * is set (offline runs), otherwise raw.githubusercontent.com (public repo).
 */
export async function upstreamFile(commit: string, path: string): Promise<string> {
  const key = `${commit}:${path}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let text: string;
  const localClone = process.env.NLP_STACK_DIR;
  if (localClone && existsSync(localClone)) {
    text = execFileSync("git", ["-C", localClone, "show", `${commit}:${path}`], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } else {
    const url = `https://raw.githubusercontent.com/moritzbrantner/nlp-stack/${commit}/${path}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`fetching ${url} failed: HTTP ${response.status}`);
    }
    text = await response.text();
  }
  cache.set(key, text);
  return text;
}

/** Names exported by an ES module source (`export [async] function|const|let|class NAME`). */
export function exportedNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(
    /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.add(match[1]!);
  }
  return [...names].sort();
}

/** Whether an ES module source has a default export. */
export function hasDefaultExport(source: string): boolean {
  return /^export\s+default\b/m.test(source);
}

/** The export conditions object of `subpath`, or undefined. */
export function subpathExport(
  subpath: string,
  manifest: Manifest = readManifest(),
): Record<string, unknown> | undefined {
  const exports = manifest.exports;
  if (!exports || typeof exports !== "object") return undefined;
  const entry = (exports as Record<string, unknown>)[subpath];
  if (typeof entry === "string") return { import: entry, default: entry };
  if (!entry || typeof entry !== "object") return undefined;
  return entry as Record<string, unknown>;
}

function subpathTarget(subpath: string, conditions: string[], manifest: Manifest): string {
  const entry = subpathExport(subpath, manifest);
  for (const condition of conditions) {
    const value = entry?.[condition];
    if (typeof value === "string") return value;
  }
  throw new Error(`package.json exports["${subpath}"] has no ${conditions.join("/")} target`);
}

/** Absolute path of the import target of `subpath`. */
export function entryPath(subpath: Subpath, manifest = readManifest(), dir = repoRoot): string {
  return join(dir, subpathTarget(subpath, ["import", "default"], manifest));
}

/** Absolute path of the types target of `subpath`. */
export function typesPath(subpath: Subpath, manifest = readManifest(), dir = repoRoot): string {
  return join(dir, subpathTarget(subpath, ["types"], manifest));
}
