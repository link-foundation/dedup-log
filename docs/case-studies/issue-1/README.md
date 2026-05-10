# Case Study: Issue #1 — Vision of 0.0.1 version

**Issue:** [#1](https://github.com/link-foundation/dedup-log/issues/1) — Vision of 0.0.1 version
**Author:** @konard
**Status:** Open
**PR:** [#2](https://github.com/link-foundation/dedup-log/pull/2)

## 1. Problem Statement

The repository was bootstrapped from
[`link-foundation/js-ai-driven-development-pipeline-template`](https://github.com/link-foundation/js-ai-driven-development-pipeline-template)
but contains no domain code yet (only the demo `add` / `multiply` / `delay`
functions from the template). Issue #1 lays out the product vision for the
`0.0.1` release of `dedup-log`:

> So idea is that we by default have logging to file for example per each
> date, once the date is finished, we close this log, deduplicate it using
> deduplino, converting it to `.log.lino` with local dictionary of duplicated
> fragments.

The library must be a thin domain layer that composes two existing
`link-foundation` libraries:

- [`log-lazy`](https://github.com/link-foundation/log-lazy) — the lazy
  logging interface that defers expensive message construction until the
  selected level is enabled.
- [`deduplino`](https://github.com/link-foundation/deduplino) — the
  [Lino](https://github.com/linksplatform/Protocols.Lino) deduplicator
  that turns repeated fragments into numbered references.

Distribution surfaces for `0.0.1`: **library**, **CLI**, **HTTP API /
microservice**, and a **GitHub Pages demo**.

## 2. Verbatim Requirements

The list below decomposes the issue body into atomic, testable requirements.
Each item is tagged with an ID so the PR description, tests, and this
document can cross-reference them.

| ID   | Requirement                                                                                                                                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | "JavaScript + Rust" — JavaScript implementation must be delivered for `0.0.1`. Rust is acknowledged as a future track (the upstream `log-lazy` already ships a Rust crate; `deduplino` is JS/TS-only today, so a Rust port is out of scope for `0.0.1`). |
| R-02 | Ship a **library** surface.                                                                                                                                                                                                                              |
| R-03 | Ship a **CLI** surface.                                                                                                                                                                                                                                  |
| R-04 | Ship an **HTTP API / microservice** surface.                                                                                                                                                                                                             |
| R-05 | Ship a **GitHub Pages demo**.                                                                                                                                                                                                                            |
| R-06 | Implement on top of [`log-lazy`](https://github.com/link-foundation/log-lazy) for the logger interface.                                                                                                                                                  |
| R-07 | Implement deduplication on top of [`deduplino`](https://github.com/link-foundation/deduplino).                                                                                                                                                           |
| R-08 | Default to logging to a file rotated **per date** (one file per day).                                                                                                                                                                                    |
| R-09 | When the date rolls over, close the previous log and run it through `deduplino`, producing a `.log.lino` file with a **local dictionary** of duplicated fragments (numbered references at the head of the file, per `deduplino`'s pattern format).       |
| R-10 | Support an optional **global dictionary** that is explicitly imported by each `.log.lino` file via a header line such as `(import dictionary "./path/to/dictionary")`. This makes it clear where fragments not listed in the file can be found.          |
| R-11 | Build the global dictionary only after **more than 7 days** of logs exist, so common fragments migrate from local dictionaries into the shared one and local dictionaries shrink.                                                                        |
| R-12 | Expose everything through the **log-lazy interface** so log operations are lazy and have **near-zero cost** when the corresponding level is disabled.                                                                                                    |
| R-13 | Apply CI/CD best practices from the four `link-foundation` AI-driven development pipeline templates (JS, Rust, Python, C#). Report any gaps as upstream issues in those templates.                                                                       |
| R-14 | Compile case-study material (issue text, dependency notes, online research) into `./docs/case-studies/issue-1/`, enumerate every requirement, and propose solution plans referencing existing components.                                                |
| R-15 | Plan and execute everything in a single pull request — this PR (#2).                                                                                                                                                                                     |

## 3. Dependency Reconnaissance

### 3.1 `log-lazy` (npm: `log-lazy@1.1.0`, Unlicense)

- API entry point: `import makeLog from 'log-lazy'`. `makeLog({ level })`
  returns a `LogFunction`: a callable (info-level) plus per-level methods
  `fatal`, `error`, `warn`, `info`, `debug`, `verbose`, `trace`, `silly`,
  level introspection (`shouldLog`, `enableLevel`, `disableLevel`,
  `getEnabledLevels`).
- Bitmask level model — combine levels with `|`. Presets: `'production'`
  (fatal|error|warn = 7), `'development'` (= 31), `'all'` (= 255), etc.
- **Sinks**: `LogOptions.log` accepts a per-level callback object
  (`{ info: (...args) => …, error: (...args) => … }`). This is the hook
  point we use to fan logs to a daily file on disk while preserving lazy
  evaluation.
- **Pre/postprocessors**: built-in helpers for timestamp, level prefix,
  PID, custom prefix/suffix. The dedup-log file sink composes
  `postprocessors.timestamp({ format: 'iso' })` and
  `postprocessors.level()` so the on-disk format is self-describing.
- Lazy semantics: arguments wrapped in a function (e.g. `() =>
expensive()`) are only invoked when the level passes the bitmask.

### 3.2 `deduplino` (npm: `deduplino@0.0.9`, Unlicense)

- Programmatic API: `import { deduplicate } from 'deduplino/deduplicator'`
  → `deduplicate(input, topPercentage = 0.2, autoEscape = false,
failOnParseError = false)` returning `{ output, success, reason,
patternsApplied }`.
- Auto-escape mode is required for raw log lines because Lino is sensitive
  to characters like `:` (timestamps), URLs, and parentheses.
- Output is a Lino-format string. Pattern definitions appear as
  `1: pattern text` lines, references as `1` (exact), `1 cat` (prefix), or
  `foo 1` (suffix).
- The published `0.0.9` build uses `links-notation` for parsing and
  `lino-arguments` for CLI plumbing. The `dist/` files are ESM; we import
  them via `import { deduplicate } from 'deduplino/deduplicator'`.
- Empty / un-deduplicatable input: `deduplicate` returns
  `{ success: false, reason: 'No deduplication patterns found', output:
<formatted but undeduplicated lino> }`. Our writer must keep the
  formatted output and skip the `(import dictionary …)` header when there
  is no pattern table to import.

### 3.3 Lino format primer

Lino (Links Notation) is a whitespace-and-parentheses syntax where each
top-level link is one logical record. `deduplino`'s output therefore looks
like:

```
1: 2026-05-10T12:00:00Z INFO request handled
1
1
2: 2026-05-10T12:00:01Z ERROR connection failed
2
```

The leading `N:` lines are the **dictionary** for the file. Every later
`N` reference resolves against that table.

## 4. Architectural Plan

```
src/
├── index.js              # public re-exports (createDedupLog, FileSink, …)
├── logger.js             # makeLog wrapper that tees into a daily file sink
├── file-sink.js          # ISO-date file rotation + line writer
├── deduplicate-file.js   # post-rotation: run deduplino, emit *.log.lino
├── global-dictionary.js  # >7-day promotion of fragments to a shared dict
├── format.js             # timestamp + level postprocessor wiring
└── paths.js              # date helpers, log/lino/dictionary path layout
```

### 4.1 Daily log rotation (R-08, R-09)

- The **active** log is `logs/YYYY-MM-DD.log` (one plain-text line per log
  call). The sink keeps a single open `fs.WriteStream`; on the first
  write of a new UTC day the previous stream is closed.
- After close the rotation pipeline runs `deduplicate(content, threshold,
/*autoEscape*/ true)` and writes `logs/YYYY-MM-DD.log.lino`. The
  original `.log` is kept for the same day window so users can verify the
  round-trip (it is then removed by the next rotation, configurable via
  `keepRawLogs`).
- "Date is finished" is interpreted as **UTC date roll-over**, with a
  configurable clock injection point (`now: () => Date`) so tests can
  drive rotation without sleeping.

### 4.2 Local dictionary (R-09)

- The dictionary is whatever `deduplino` emits at the top of the file
  (`1: …`, `2: …`). No bespoke format is invented — we rely on the
  upstream representation so other Lino-aware tools interoperate.
- A `header` option lets callers prepend an `(import dictionary "…")`
  line; this is wired up in §4.3.

### 4.3 Global dictionary (R-10, R-11)

- After each rotation, if `logs/` already contains rotated files spanning
  **more than 7 days**, the global-dictionary builder runs:
  1. Concatenate the most recent N (default 14) `.log` payloads into one
     buffer.
  2. Run `deduplicate(buffer, 1.0, /*autoEscape*/ true)` to maximise the
     number of patterns lifted into a shared table.
  3. Extract just the `N: pattern` lines into
     `logs/dictionary.log.lino`.
- Each `.log.lino` then re-runs deduplication with the global dictionary
  fed in as already-known patterns. Because `deduplino` does not yet
  expose dictionary-injection through its public API, `0.0.1` uses a
  pragmatic fallback: it emits the global dictionary as a header line
  `(import dictionary "./dictionary.log.lino")` followed by the
  per-day local table. This keeps R-10 satisfied and the file remains a
  valid Lino document. (Upstream issue idea, captured below: surface a
  "preset dictionary" parameter in `deduplino`.)

### 4.4 Lazy interface (R-12)

`createDedupLog({ level, dir, …})` returns the same shape as `log-lazy`'s
`LogFunction` plus a `flush()` / `close()` helper. We pass through to
`makeLog({ level, log: { … fan out to file sink … }, postprocessors:
[timestamp, level] })`, so:

- `log(() => expensive())` only invokes the closure when `info` is
  enabled in the bitmask;
- when the level is disabled the cost is exactly the cost of `log-lazy`'s
  bit test;
- the file sink only sees fully-rendered strings (cheap synchronous
  appends).

### 4.5 CLI (R-03)

Subcommands implemented with a tiny hand-rolled parser (no extra
dependencies; the upstream template avoids them too):

| Command                                | Behaviour                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `dedup-log log <message>`              | Append a line to today's log file using the file sink (`--level`, `--dir`). |
| `dedup-log rotate [--date=YYYY-MM-DD]` | Force-rotate the given date (default: yesterday) into `.log.lino`.          |
| `dedup-log build-dictionary`           | Build / refresh `dictionary.log.lino` if ≥ 8 days of logs exist.            |
| `dedup-log inspect <file>`             | Print pattern stats for any `.log` or `.log.lino` file.                     |

### 4.6 HTTP API / microservice (R-04)

A zero-dependency Node `http` server (`src/server.js`) exposing:

- `POST /log` with `{ level, message }` → appends through the same logger.
- `POST /rotate` with optional `{ date }` → triggers rotation.
- `POST /build-dictionary` → triggers global-dictionary build.
- `GET /healthz` → liveness probe.
- `GET /logs/:date` → raw or deduplicated content (`?format=lino`).

The server is launched via `node src/server.js` or `dedup-log serve`.
This intentionally avoids Express/Fastify so the microservice has the
same dependency surface as the library.

### 4.7 GitHub Pages demo (R-05)

`docs/demo/index.html` is a single static page that imports the library
straight from the npm CDN (`https://esm.sh/log-lazy`,
`https://esm.sh/deduplino`) and demonstrates the deduplication pipeline
in the browser:

1. The user types or pastes raw log lines.
2. The page calls `deduplicate(text, 0.5, true)` and renders the
   resulting `.log.lino` with the local dictionary highlighted.
3. A toggle shows the lazy-logger output stream against the same input.

The page is published from `docs/demo/` via the standard
`actions/deploy-pages` workflow added in `.github/workflows/pages.yml`.

## 5. Solution Mapping

| Requirement | Where it lives                                                                                |
| ----------- | --------------------------------------------------------------------------------------------- |
| R-01        | JS implementation in `src/`. Rust deferred.                                                   |
| R-02        | `src/index.js`, exported `createDedupLog`, `FileSink`, `rotate`, `buildGlobalDictionary`.     |
| R-03        | `bin/dedup-log.js` (and `bin` field in `package.json`).                                       |
| R-04        | `src/server.js` + `dedup-log serve`.                                                          |
| R-05        | `docs/demo/index.html`, deployed via `.github/workflows/pages.yml`.                           |
| R-06        | `src/logger.js` wraps `makeLog`.                                                              |
| R-07        | `src/deduplicate-file.js` invokes `deduplicate` from `deduplino/deduplicator`.                |
| R-08        | `src/file-sink.js` rotates by UTC date.                                                       |
| R-09        | `rotate(date)` produces `<date>.log.lino`.                                                    |
| R-10        | `header: '(import dictionary "./dictionary.log.lino")'` in the rotated file.                  |
| R-11        | `buildGlobalDictionary({ minDays: 8 })`.                                                      |
| R-12        | `createDedupLog` returns the `log-lazy` `LogFunction` as-is.                                  |
| R-13        | Repo already inherits the JS template's `release.yml`, `links.yml`, secretlint, jscpd, husky. |
| R-14        | This file plus the JSON dump in `issue-data.json`.                                            |
| R-15        | All work landed in PR #2.                                                                     |

## 6. Alternatives Considered

- **Use `winston` daily-rotate-file**: would satisfy R-08 trivially, but
  contradicts R-06 ("everything is wrapped into log-lazy interface") and
  pulls in a heavy transitive tree.
- **Build a custom Lino dictionary instead of `deduplino`**: rejected per
  R-07.
- **Persist the global dictionary as JSON**: rejected because R-10
  explicitly asks for a Lino `(import dictionary …)` header so the file
  is still a valid Lino document.
- **Local `cron`-like timer for rotation**: rejected because it makes
  testing brittle; instead the sink rotates lazily on the first write of
  a new day, plus a `rotate()` API for explicit calls.

## 7. Upstream Follow-ups

The following gaps surfaced during the case study. They will be filed as
issues against the relevant upstream repos (links to be added once the
issues are created):

1. `deduplino`: expose a "preset dictionary" parameter so consumers can
   pass an existing pattern table and emit only deltas. This would let
   `dedup-log` truly shrink local dictionaries instead of re-emitting
   shared patterns.
2. `deduplino`: stream API. Today the CLI reads the whole input into
   memory; rotating multi-GB log files is awkward.
3. `log-lazy`: a built-in "rotating file" sink would remove a class of
   subtle bugs that every consumer reinvents (encoding, fsync, atomic
   rename on rotation).
4. `js-ai-driven-development-pipeline-template`: include an opt-in
   `pages.yml` workflow so projects that ship a `docs/demo/` get GitHub
   Pages out of the box without manual setup.

## 8. Online Research Notes

- Lino spec & rationale: <https://github.com/linksplatform/Protocols.Lino>
- Pattern compression motivation (referenced by `deduplino`'s README) is
  similar to the Re-Pair grammar compression scheme — see
  <https://en.wikipedia.org/wiki/Grammar-based_code>.
- Comparable "log dedup" prior art: `loggregator`'s log-cache, journald's
  per-day archives, Datadog's "log fingerprinting". None compose a lazy
  logger with a Lino-encoded dictionary, which is the specific niche
  `dedup-log` fills.
