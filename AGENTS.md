# Agent instructions

This repository distributes the `text-core-wasm` and `text-index-wasm` packages of `moritzbrantner/nlp-stack` as one commit-pinnable git dependency.

- The Rust source, the WASM bindings, the JS APIs and the `index.d.ts` files are owned by `moritzbrantner/nlp-stack`. `<subpath>/index.js` here mirrors the upstream wrapper and differs only in its WASM initialization (static imports, inlined bytes); do not add behavior. Change upstream, then move `nlpStack.commit` (see README).
- No npm publishing, no GitHub Packages and no repository secrets.
- Consumers install `github:moritzbrantner/nlp-stack-wasm#<commit>` and list the package in `trustedDependencies`.
