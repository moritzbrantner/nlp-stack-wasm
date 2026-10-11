// Acceptance (moritzbrantner/nlp-stack-wasm#4): when coding-tooling source mode (source-deps schema
// v5 upstreams) sets NLP_STACK_SOURCE_DIR, the build uses that local nlp-stack checkout instead of
// fetching the pinned commit from GitHub, and fails clearly when the directory is missing, is not a
// git checkout, or is not at nlpStack.commit. When the variable is unset or empty the build is
// unchanged. The decision is made by resolveNlpStackSource in scripts/nlp-stack-source.ts.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";

import { repoRoot } from "./support/upstream";

type Resolved = { kind: "fetch" } | { kind: "local"; dir: string };
type Resolve = (options: {
  commit: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
}) => Resolved;

const MODULE = path.join(repoRoot, "scripts", "nlp-stack-source.ts");
const OTHER_COMMIT = "0123456789abcdef0123456789abcdef01234567";

let resolveNlpStackSource: Resolve;
let root: string;
let checkout: string;
let head: string;

function git(args: string[], cwd: string): string {
  return execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

beforeAll(async () => {
  ({ resolveNlpStackSource } = (await import(MODULE)) as { resolveNlpStackSource: Resolve });
  expect(typeof resolveNlpStackSource).toBe("function");

  root = realpathSync(mkdtempSync(path.join(tmpdir(), "nlp-stack-source-test-")));
  checkout = path.join(root, "nlp-stack");
  mkdirSync(checkout);
  git(["init", "--quiet"], checkout);
  writeFileSync(path.join(checkout, "README.md"), "fixture\n");
  git(["add", "README.md"], checkout);
  git(["commit", "--quiet", "--no-gpg-sign", "-m", "fixture"], checkout);
  head = git(["rev-parse", "HEAD"], checkout);
  expect(head).toMatch(/^[0-9a-f]{40}$/);
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function expectThrow(fn: () => unknown): string {
  let message: string | undefined;
  try {
    fn();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message, "expected an error").toBeDefined();
  return message!;
}

test("NLP_STACK_SOURCE_DIR unset: the build fetches the pinned commit as before", () => {
  expect(resolveNlpStackSource({ commit: head, env: {}, cwd: root })).toEqual({ kind: "fetch" });
  expect(resolveNlpStackSource({ commit: head, env: { NLP_STACK_SOURCE_DIR: undefined }, cwd: root })).toEqual({
    kind: "fetch",
  });
});

test("NLP_STACK_SOURCE_DIR empty: treated as unset", () => {
  expect(resolveNlpStackSource({ commit: head, env: { NLP_STACK_SOURCE_DIR: "" }, cwd: root })).toEqual({
    kind: "fetch",
  });
});

test("env defaults to process.env", () => {
  const previous = process.env.NLP_STACK_SOURCE_DIR;
  try {
    process.env.NLP_STACK_SOURCE_DIR = checkout;
    expect(resolveNlpStackSource({ commit: head, cwd: root })).toEqual({ kind: "local", dir: checkout });
    delete process.env.NLP_STACK_SOURCE_DIR;
    expect(resolveNlpStackSource({ commit: head, cwd: root })).toEqual({ kind: "fetch" });
  } finally {
    if (previous === undefined) delete process.env.NLP_STACK_SOURCE_DIR;
    else process.env.NLP_STACK_SOURCE_DIR = previous;
  }
});

test("a missing directory fails naming NLP_STACK_SOURCE_DIR and the path", () => {
  const missing = path.join(root, "does-not-exist");
  const message = expectThrow(() =>
    resolveNlpStackSource({ commit: head, env: { NLP_STACK_SOURCE_DIR: missing }, cwd: root }),
  );
  expect(message).toContain("NLP_STACK_SOURCE_DIR");
  expect(message).toContain(missing);
});

test("a directory that is not a git checkout fails naming NLP_STACK_SOURCE_DIR and the path", () => {
  const plain = path.join(root, "plain-dir");
  mkdirSync(plain, { recursive: true });
  const message = expectThrow(() =>
    resolveNlpStackSource({ commit: head, env: { NLP_STACK_SOURCE_DIR: plain }, cwd: root }),
  );
  expect(message).toContain("NLP_STACK_SOURCE_DIR");
  expect(message).toContain(plain);
});

test("a checkout at another commit fails naming its HEAD and the expected nlpStack.commit", () => {
  const message = expectThrow(() =>
    resolveNlpStackSource({ commit: OTHER_COMMIT, env: { NLP_STACK_SOURCE_DIR: checkout }, cwd: root }),
  );
  expect(message).toContain(head);
  expect(message).toContain(OTHER_COMMIT);
});

test("a checkout at nlpStack.commit is used locally by its absolute path", () => {
  const resolved = resolveNlpStackSource({ commit: head, env: { NLP_STACK_SOURCE_DIR: checkout }, cwd: root });
  expect(resolved).toEqual({ kind: "local", dir: checkout });
});

test("a relative NLP_STACK_SOURCE_DIR resolves against cwd", () => {
  const resolved = resolveNlpStackSource({ commit: head, env: { NLP_STACK_SOURCE_DIR: "nlp-stack" }, cwd: root });
  expect(resolved.kind).toBe("local");
  const dir = (resolved as { dir: string }).dir;
  expect(path.isAbsolute(dir)).toBe(true);
  expect(realpathSync(dir)).toBe(checkout);

  const nested = path.join(root, "consumer");
  mkdirSync(nested, { recursive: true });
  const fromSibling = resolveNlpStackSource({
    commit: head,
    env: { NLP_STACK_SOURCE_DIR: "../nlp-stack" },
    cwd: nested,
  });
  expect(fromSibling.kind).toBe("local");
  expect(realpathSync((fromSibling as { dir: string }).dir)).toBe(checkout);
});

test("resolving a local checkout does not modify it", () => {
  const before = git(["status", "--porcelain", "--untracked-files=all"], checkout);
  resolveNlpStackSource({ commit: head, env: { NLP_STACK_SOURCE_DIR: checkout }, cwd: root });
  expect(git(["status", "--porcelain", "--untracked-files=all"], checkout)).toBe(before);
  expect(git(["rev-parse", "HEAD"], checkout)).toBe(head);
});

test("scripts/build.ts decides its nlp-stack source through resolveNlpStackSource", () => {
  const build = readFileSync(path.join(repoRoot, "scripts", "build.ts"), "utf8");
  expect(build).toMatch(/from\s+["']\.\/nlp-stack-source(\.ts)?["']/);
  expect(build).toMatch(/resolveNlpStackSource\s*\(/);
});
