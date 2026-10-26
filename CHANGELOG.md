# @chatlychat/mcp — changelog

## 0.1.4 — 2026-10-19

**A version bump is not a publish, and this release is here because `0.1.3`
proved it.**

`0.1.3` existed for one reason: to correct the tool counts on the npm page.
Its entry below says "description only; no code change" and names 83 tools,
76 reads, 7 writes as the measured figures. Half of that correction shipped.

`package.json`'s `description` was already right at the commit that set the
version, so it went out: npm's summary for `0.1.3` reads "83 typed tools
(76 reads, 7 writes)". `README.md` was still on the old numbers at that same
commit, and the fix to it landed in a LATER commit that was never published.
npm renders both on one page, so `0.1.3` has spent five days advertising
"83 typed tools" in its summary and "78 typed tools — 71 reads and 7 writes"
in the body directly beneath it. That is the third distinct count an
integrator could have found after the 49 that `0.1.3` set out to fix.

Nothing was wrong with the repository. The README has said 83/76/7 since the
day after the release. It simply could not reach anyone, because npm freezes a
version's files and metadata and no version had been cut since.

### Fixed

- The published README now carries the measured counts: **83 typed tools, 76
  reads, 7 writes**, matching the `description` beside it and the public docs.
  Verified by executing the registry rather than by trusting either README —
  `TOOLS` has 83 entries with 83 unique names, and exactly 7 carry
  `mutating: true` (`send_message`, `create_contact`, `tag_contact`,
  `untag_contact`, `track_event`, `unsubscribe_contact`, `sync_docs_source`).

- **`--version` and `--help` now work without a credential.** Neither flag was
  handled at all, so both fell through to the stdio branch and exited 1 with
  "CHATLY_API_KEY is required" — a key demanded in order to be told a version
  number, on the two flags a person tries first and before they have anything
  configured.

  It also broke our own release verification. `scripts/publish-packages.mjs`
  confirms a publish by installing from the registry and running every `bin`
  with `--version`, because `@chatlychat/cli@0.1.6` once installed cleanly and
  died on startup. With `--version` exiting 1 that check reports "INSTALLS BUT
  DOES NOT RUN" and fails a release that is fine — and the documented response
  to a false alarm there is to publish again.

  The two pure functions live in `src/cli-flags.ts` rather than `main.ts`,
  which runs its server on import: a spec that imported `main.ts` booted the
  transport and tripped `process.exit(1)`, passing 35 tests while `vitest`
  exited 1 on the unhandled exit. Splitting them beat making a published
  entry point guard its own execution for a test's benefit.

- **The tarball no longer ships the test suite.** `files` was
  `["dist","README.md","LICENSE"]` with no spec exclusion, and `tsconfig`
  compiles all of `src`, so `0.1.3`'s published tarball carried **five**
  compiled spec files — `registry.spec.js`, `reachability.spec.js`,
  `http.spec.js`, `tools.spec.js` and a second `reachability.spec.js` under
  `tools/`. Dead weight in every install, and it puts test fixtures and the
  shapes they assert in front of anyone who unpacks it.

  `"!dist/**/*.spec.*"` now sits in `files`, which is what the other four
  publishable packages have always had — `@chatlychat/sdk-js`,
  `widget-element`, `widget-react` and even `@chatlychat/cli` all carry it, so
  this was an omission rather than a decision. Note `tools.spec.js` in that
  list no longer exists in `src` at all: it was a stale artifact of an earlier
  split, published because nothing cleans `dist` and nothing looked inside the
  tarball. Confirmed with `pnpm pack` and a listing rather than by reading
  `files` and believing it.

### Also unshipped since 0.1.3, and therefore in this release

- `publishConfig.provenance` was removed from `package.json`. Provenance needs
  an OIDC token from a supported CI, and this repo publishes from a laptop, so
  the flag failed every publish it was present for. No effect on an installed
  package.

### Guarded against a third time

The number nobody was checking was also sitting in the test suite:
`registry.spec.ts` floored `TOOLS.length` at **78** — copied from the README
rather than measured — so the registry's real size was never asserted and the
two stale numbers agreed with each other. A README figure with nothing
checking it had already gone stale twice.

`registry.spec.ts` now DERIVES the total, read and write counts from `TOOLS`
and requires both `README.md` and the `description` to state exactly those
three numbers. No count is written down in the spec, so adding a tool fails
the suite until the advertised numbers are updated, and there is no constant
to edit without reading. The extractor is itself tested against both prose
idioms plus two sentences it must refuse, because a matcher that quietly finds
nothing reports no mismatch — which is the shape of the original defect.

## 0.1.3 — 2026-10-14

- Description only; no code change. The npm page advertised "49 typed tools"
  while the server has exposed 83 for some time — npm freezes a version's
  metadata, so the correction needed a publish. It now states the split the
  design turns on: 76 reads, 7 writes. An integrator found three different
  tool counts across our own pages and the npm listing (49 / 78 / 83); 83 is
  the measured one, and `check-docs-install-claims.mjs` holds the docs to it.
