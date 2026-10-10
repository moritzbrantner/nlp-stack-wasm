// Acceptance (moritzbrantner/nlp-stack-wasm#1): after `bun run build`, each subpath export exposes
// exactly the JS API and the index.d.ts of its nlp-stack package at the pinned commit.
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "bun:test";

import { loadEntry } from "./support/entry";
import {
  SUBPATHS,
  type Subpath,
  exportedNames,
  hasDefaultExport,
  pinnedCommit,
  typesPath,
  upstreamFile,
} from "./support/upstream";

const commit = pinnedCommit();

const REQUIRED: Record<Subpath, string[]> = {
  "./text-core-wasm": [
    "init",
    "packageSurface",
    "runOperation",
    "extractWordTexts",
    "splitSentences",
    "segmentTextDocument",
    "analyzeTextDocument",
  ],
  "./text-index-wasm": ["init", "packageSurface", "runOperation"],
};

for (const [subpath, upstreamDir] of Object.entries(SUBPATHS) as Array<[Subpath, string]>) {
  test(`${subpath} exports the functions issue #1 names`, async () => {
    const entry = await loadEntry(subpath);
    for (const name of REQUIRED[subpath]) {
      expect(typeof entry[name], `${subpath} ${name}`).toBe("function");
    }
  });

  test(`${subpath} exports the same names as ${upstreamDir}/index.js at the pinned commit`, async () => {
    const entry = await loadEntry(subpath);
    const source = await upstreamFile(commit, `${upstreamDir}/index.js`);
    const upstream = exportedNames(source);
    for (const name of REQUIRED[subpath]) expect(upstream).toContain(name);
    expect(Object.keys(entry).filter((name) => name !== "default").sort()).toEqual(upstream);
    expect("default" in entry, `${subpath} default export`).toBe(hasDefaultExport(source));
  });

  test(`${subpath} ships types equal to ${upstreamDir}/index.d.ts at the pinned commit`, async () => {
    const path = typesPath(subpath);
    expect(existsSync(path), `${path} exists`).toBe(true);
    const upstream = await upstreamFile(commit, `${upstreamDir}/index.d.ts`);
    expect(readFileSync(path, "utf8")).toBe(upstream);
  });
}
