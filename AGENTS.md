# Agent instructions

This repository distributes the `text-core-wasm` and `text-index-wasm` packages of `moritzbrantner/nlp-stack` as one commit-pinnable git dependency.

- The Rust source, the WASM bindings and the packages' JS APIs are owned by `moritzbrantner/nlp-stack`. Do not fork or re-implement them here; change them there and move the pinned commit.
- No npm publishing, no GitHub Packages and no repository secrets.
- Consumers install `github:moritzbrantner/nlp-stack-wasm#<commit>` and list the package in `trustedDependencies`.
