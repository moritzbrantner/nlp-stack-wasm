// Decides where scripts/build.ts takes the nlp-stack source from. coding-tooling source mode
// (source-deps schema v5 upstreams) sets NLP_STACK_SOURCE_DIR to a local nlp-stack checkout; the
// build then uses that checkout instead of fetching the pinned commit from GitHub. The checkout must
// exist, be the top level of a git checkout and have HEAD at package.json nlpStack.commit. Unset or
// empty means the unchanged fetch build. Resolution only reads the checkout.

import { execFileSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

export const SOURCE_DIR_ENV = "NLP_STACK_SOURCE_DIR";

export type NlpStackSource = { kind: "fetch" } | { kind: "local"; dir: string };

function gitOutput(dir: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return undefined;
  }
}

export function resolveNlpStackSource({
  commit,
  env = process.env,
  cwd = process.cwd(),
}: {
  commit: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
}): NlpStackSource {
  const value = env[SOURCE_DIR_ENV];
  if (value === undefined || value === "") return { kind: "fetch" };

  const dir = path.resolve(cwd, value);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`${SOURCE_DIR_ENV}=${value}: ${dir} does not exist or is not a directory`);
  }

  const topLevel = gitOutput(dir, ["rev-parse", "--show-toplevel"]);
  if (topLevel === undefined) {
    throw new Error(`${SOURCE_DIR_ENV}=${value}: ${dir} is not a git checkout`);
  }
  if (realpathSync(topLevel) !== realpathSync(dir)) {
    throw new Error(
      `${SOURCE_DIR_ENV}=${value}: ${dir} is not the top level of a git checkout (its checkout is ${topLevel})`,
    );
  }

  const head = gitOutput(dir, ["rev-parse", "HEAD"]);
  if (head === undefined) {
    throw new Error(`${SOURCE_DIR_ENV}=${value}: cannot read HEAD of the git checkout ${dir}`);
  }
  if (head !== commit) {
    throw new Error(
      `${SOURCE_DIR_ENV}=${value}: the checkout ${dir} is at ${head}, but package.json nlpStack.commit is ${commit}`,
    );
  }

  return { kind: "local", dir };
}
