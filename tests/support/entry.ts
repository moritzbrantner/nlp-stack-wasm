// Loads a built subpath entry of this package by the path its export declares.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { type Subpath, entryPath } from "./upstream";

export async function loadEntry(subpath: Subpath): Promise<Record<string, any>> {
  const path = entryPath(subpath);
  if (!existsSync(path)) {
    throw new Error(`entry ${path} of "${subpath}" is missing; run \`bun run build\` first`);
  }
  return (await import(pathToFileURL(path).href)) as Record<string, any>;
}
