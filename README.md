# nlp-stack-wasm

Git-installable distribution of the `text-core-wasm` and `text-index-wasm` WASM packages from
[moritzbrantner/nlp-stack](https://github.com/moritzbrantner/nlp-stack). The repository root is one
package, `@moritzbrantner/nlp-stack-wasm`, with one subpath export per nlp-stack package. It is
never published to npm and needs no secrets (owner decision on moritzbrantner/document-search#18).

Bun cannot install a git subdirectory, and two dependencies on one repository would install and
build it twice, so the two packages are subpaths of one package rather than two packages.

## Install

```bash
bun add "github:moritzbrantner/nlp-stack-wasm#<commit>"
```

and list the package in the consumer's `package.json`:

```json
{ "trustedDependencies": ["@moritzbrantner/nlp-stack-wasm"] }
```

`prepare` then builds both packages on install. That needs `git`, `rustup` (the pinned Rust
toolchain and the `wasm32-unknown-unknown` target are installed on first use) and `wasm-pack`. When
`wasm-pack` is not on `PATH`, it is installed once into `~/.cache/nlp-stack-wasm` with
`cargo install --locked`.

```js
import { splitSentences } from "@moritzbrantner/nlp-stack-wasm/text-core-wasm";
import { runOperation } from "@moritzbrantner/nlp-stack-wasm/text-index-wasm";
```

| Subpath | API and `index.d.ts` of |
| --- | --- |
| `@moritzbrantner/nlp-stack-wasm/text-core-wasm` | nlp-stack `packages/text-core-wasm` |
| `@moritzbrantner/nlp-stack-wasm/text-index-wasm` | nlp-stack `packages/text-index-wasm` |

Both are those of the pinned nlp-stack commit. The `.wasm` bytes are inlined into the JS modules,
so browser bundlers need no extra asset handling.

## Pin and update flow

`package.json` `nlpStack.commit` names the exact nlp-stack revision that is built:

1. Change the API or Rust source in moritzbrantner/nlp-stack and merge there.
2. In this repository, set `nlpStack.commit` to that merged commit (and `INITIAL_NLP_STACK_COMMIT`
   in `tests/support/upstream.ts`) and open a PR. If an upstream `index.js` changed, mirror the
   change in `<subpath>/index.js`; only its WASM initialization differs from upstream. The tests
   compare export names and `index.d.ts` with the pinned commit.
3. After it merges, consumers move their `#<commit>` pin to this repository's new commit.

## Development

```bash
bun run build              # fetch the pinned commit and build <subpath>/pkg and <subpath>/index.d.ts
bun run test               # package tests against the pinned upstream APIs
bun run verify:git-install -- --local  # clean consumer: git install, Bun and headless-browser bundle
```

### Source mode

When `NLP_STACK_SOURCE_DIR` is set (coding-tooling source mode, source-deps schema v5 `upstreams`),
`build` and `prepare` build both packages from that local nlp-stack checkout and do not fetch from
GitHub. The directory must be the top level of a git checkout whose `HEAD` is `nlpStack.commit`;
otherwise the build fails before doing any work. A relative path resolves against the current
directory. Cargo writes its usual `target/` in the checkout; nothing else there changes.
`<subpath>/pkg/SOURCE` then reads `<repository>#<commit> (local checkout <dir>)`. Unset or empty
keeps the fetch build.

`bun run verify:git-install` without `--local` installs the pushed `HEAD` from GitHub. Set
`NLP_STACK_DIR` to a local nlp-stack clone to read upstream files offline.
