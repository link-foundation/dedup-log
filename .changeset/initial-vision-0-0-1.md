---
'dedup-log': minor
---

Initial implementation of `dedup-log` per issue #1: a lazy daily logger that deduplicates closed logs into the Lino `.log.lino` format.

Surfaces shipped:

- **Library** (`createDedupLog`, `rotate`, `buildGlobalDictionary`, `FileSink`, path helpers)
- **CLI** (`dedup-log log|rotate|build-dictionary|inspect|serve`)
- **HTTP API** (zero-dep Node `http` server exported via `dedup-log/server`)
- **GitHub Pages demo** (`docs/demo/`, deployed by `.github/workflows/pages.yml`)

Composes [`log-lazy`](https://github.com/link-foundation/log-lazy) (lazy logging) with [`deduplino`](https://github.com/link-foundation/deduplino) (Lino dedup CLI). Daily `<date>.log` files are rotated into `<date>.log.lino` with a local dictionary; once enough history exists, a global `dictionary.log.lino` can be built and referenced via an `(import dictionary "...")` header.
