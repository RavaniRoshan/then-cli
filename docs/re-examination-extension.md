# Product re-examination: extension-first `then`

> Status: draft. Co-authored via doc-coauthoring. Re-examination + extension-first pivot.

## 1. Context & problem

**One-liner.** See what you saved, by year, and what happened to it.

**Problem.** Your browser has a decade of bookmarks. It gives folders and a flat list sorted by date, but can't answer what you saved in 2014, which links are dead, or whether you ever went back. The archive becomes a graveyard you're afraid to delete.

**Current product (baseline).** `then` / `then-cli` v0.1.0, built and verified as a local read-only Chromium CLI: parses `Bookmarks` + copies queried `History` SQLite, joins on URL, checks links (cache/concurrency/`--no-check`), renders self-contained HTML report (timeline / graveyard / regret queue / year pages / `--redact`), URL-free 1080×1350 + OG card (SVG+PNG), Wayback rescue; no telemetry; only two network uses; `then-out/`. Chromium-only; multi-profile. Built CLI-first; not yet npm-published.

**Re-examination trigger.** User re-examines product to **build it as a Chromium MV3 browser extension**, "more easier for user to use it and install it". This document re-examines fit, captures settled decisions, states honest tradeoffs + spec conflicts, and outlines migration. Goal artifact decision §2.

## 2. Decision

**Go extension-first.** Ship `then` as a Chromium Manifest V3 browser extension that is easier to install and use than a Node CLI. Settled decisions:

- **Form factor.** Extension-first. The CLI (`then-cli`) is **kept working until the extension is polished**, then **deprecated** — not removed immediately. An **extension + web app** combination is acceptable; a standalone local-first web app is **scheduled for later**, not v1.
- **Targets.** Chromium **MV3**, one codebase for **Chrome, Edge, Brave**. No Firefox/Safari before launch.
- **CLI retirement.** Keep `apps/cli` + `then-cli` published and working; on extension polish, `npm deprecate then-cli@*` with a migration note; removal in a later major. *(npx `then-cli` is not yet published.)*
- **Privacy invariants retained.** No telemetry ever; **only two network uses** (link checks + Wayback availability); read-only (no profile mutation); local-only output; **URL-free card**; honest history-window labels ("not opened in last N days", not "never"); no LLM; no server.
- **Outputs.** Report opened in a **tab** (self-contained); card + rescue via `chrome.downloads`; `then-out/` does not apply to the extension; output goes to browser Downloads. Spec amended for `apps/extension`.
- **Scope change.** Extension reads **current profile only** (not other profiles/browsers, not disk files); ~90-day history trimming with disclosure. Multi-profile + cross-browser reading remains **CLI-only** until the web app lands.
- **Permissions (MV3).** Minimal `bookmarks`, `history`, `downloads`; **optional runtime** `http://*/*` + `https://*/*` for link checks; `archive.org` for Wayback.
- **Architecture.** Monorepo `packages/core` + `apps/cli` + `apps/extension`; `then-cli` name kept; extension `then`, package `then-extension`.
- **Build.** **Vite + manual MV3 manifest** for `apps/extension`; **tsc-only** for `apps/cli` + `packages/core`.
- **Card.** Shared `card.svg`; PNG rasterized per app — CLI `@resvg/resvg-js`, extension **canvas**.
- **Specs.** `PRD.md` + `AGENTS.md` amended (separately); conflicts listed in §7.


## 3. Re-examination findings

**What the re-examination concludes.** The product promise ("see what you saved, by year, and what happened to it") and the read-only, local-first, honest-number core are sound. The CLI delivers it but its **installation and data-access friction** (Node ≥22.5, npm, terminal, locating profiles, copying a locked SQLite `History`, cross-browser reading) is the adoption barrier. A browser extension removes that barrier. Re-examination verdict: **extension-first, CLI kept then deprecated, shared core, later web app.**

**What stays the same.** One-liner; timeline / graveyard / regret queue / year pages; URL-free PNG+SVG card; Wayback rescue; `[archived]` Netscape output; `--redact`-equivalent; honest history labels; no telemetry; **only two network uses**; read-only; Chromium bookmark schema; outputs identical (self-contained report, card, Netscape HTML).

**What improves for users.**
- **Install**: one-click store install vs `npx then-cli` + Node ≥22.5 + terminal.
- **No setup**: no profile detection, no copying `History`, no SQLite, no Node requirement for end users; reads the live current profile.
- **Data**: `chrome.bookmarks` + `chrome.history` APIs instead of file parsing; current browser, current profile.

**What is lost / tradeoffs (honest).**
- **Scope narrowing**: current profile only; no other profiles/browsers; no reading disk profiles; can't run outside the browser. Multi-profile + cross-browser reading stays **CLI-only** until the later web app.
- **`then-out/` → browser Downloads**; report opened in tab; no filesystem output dir. (§7 amends AGENTS §2.)
- **Engine swaps**: `@resvg/resvg-js` (Node) → **canvas** PNG; Node-only `node:sqlite` not used; nothing ships a Node runtime.
- **Build**: tsc-only/no-bundler (CLI) → **Vite** for `apps/extension`.
- **History approximation**: `chrome.history` retained window approximated from earliest returned `lastVisitTime`; ~90-day trim + honest label retained; can't read full untrimmed DB.
- **Chromium bookmark schema differs**: extension `title` (not `name`); `dateAdded` **ms-Unix** (not Chrome-epoch µs `13236220800000000`); new adapter. `then` epoch conversion stays for CLI/web app disk parsing.

**What is harder.**
- **MV3**: CSP `script-src 'self'` blocks inline scripts in extension pages → self-contained report with inline `<script>` must open as **`blob:`** in a tab, verify, or **download + open**; no remote code; service-worker lifecycle; `wasm` not needed (canvas).
- **Permissions**: CORS for link checks needs **optional host permission**; `archive.org` for Wayback; minimal base permissions; store review + privacy policy; no telemetry.
- **Packaging/distribution**: Chrome Web Store listing; versioning; keep CLI npm package working during transition.

**Spec conflicts found (PRD / AGENTS).**
- PRD scope OUT: **"no browser extension in v0"**; PRD non-goal: **"No … browser extension in v0"**; PRD launch `npx then` (npm name is `then-cli`). → §7 adds extension milestone.
- AGENTS §1/§3/§4: **Node CLI**, `node:sqlite`, `@resvg/resvg-js`, **tsc-only no bundler**, reads profile files; §15 do-not-add. → §7 adds `apps/extension`, Vite exception, MV3; CLI `src/`→`apps/cli` rules unchanged.
- AGENTS §2: **all output to `then-out/`** + `then-out/.gitignore` `*`. → §7 extends for `apps/extension` output to browser Downloads; CLI `apps/cli` keeps `then-out/`.
- AGENTS §10: **self-contained report, no external scripts**. → kept for the artifact; delivery mechanic (`blob:` tab) is separate.
- AGENTS §9 user-agent + **two network uses** + 403/429-never-dead + cache. → retained in `packages/core`.
- PRD **Chromium-only** v0 + no Firefox/Safari. → consistent with MV3 Chromium-first.
- AGENTS §1 working name `then`. → extension `then`; npm `then-cli`.

**What shared core extracts.** `packages/core`: types; URL normalization; join + derived stats; `renderReport`; `card.svg` builder; Netscape rescue; link classification + checks; Wayback; history-window logic; Chrome-epoch conversion; bookmark-tree walk (source-agnostic). Platform-only stays outside: `src/parse/*` disk + SQLite (CLI/web app); `chrome.*` adapter + `chrome.downloads` + canvas (extension); `node:sqlite` CLI history (CLI/web app).


## 4. Scope & privacy

**Scope.** v1 extension = current Chromium profile; current browser (Chrome/Edge/Brave, MV3). Reads live `chrome.bookmarks` + `chrome.history`. History trimmed by browser; retained window disclosed. No cross-profile, no cross-browser, no disk reads. Standalone local-first web app (drop-in files, multi-profile) = later. No server, no account, no sync, no LLM, no search/tags, no mutation, no Firefox/Safari v1.

**Privacy invariants (non-negotiable).**
- **No telemetry**, analytics, crash reporting, update check, "anonymous usage" — ever.
- **Only two network uses**: link status checks + Wayback availability API. Nothing else.
- **Read-only**: never write to bookmarks, history, or any browser/profile data; nothing leaves the machine except the two permitted calls.
- **Local-only output**: report/card/rescue stay local; shared artifacts (card) contain **counts, domains, years only — no full URLs, titles, or folder names**; report `redact` mode; no favicon fetching; no external fonts/scripts/images in report.
- **Honesty**: history trimmed → say so; "not opened in the last N days" not "never"; "never opened since saving" only when save inside retained window; 403/429 **never dead**; blocked ≠ dead; unchecked counted; no invented check date (`--no-check`-equivalent says skipped); no claims of completeness when data is partial.
- **No LLM** in v1; product is joins and counts.

**Output.** report in tab (self-contained); `chrome.downloads` → browser Downloads (`report.html`, `card.png`, `card.svg`, `card-og.png`, `card-og.svg`, `rescued-bookmarks.html`); rescue never mutates; CLI `apps/cli` keeps `then-out/` + `then-out/.gitignore` `*`. No remote hosting.

**Permissions (MV3, minimal).** Required: `bookmarks`, `history`, `downloads`. Optional runtime: `http://*/*`, `https://*/*` (link checks only, revocable). Required host: `archive.org` (Wayback, only when rescue used). `User-Agent then/0.1 (+https://github.com/RavaniRoshan/then-cli)`. No other host permissions; no `<all_urls>` upfront; no `tabs` scraping; no native messaging.


## 5. Architecture

**Monorepo.**
```
packages/core     shared pure logic; no Node-only deps
apps/cli          then-cli (unchanged today; moved to apps/cli in migration)
apps/extension    then (MV3), Vite + manual manifest
```
- `apps/cli` src → `packages/core` + platform parsing (`src/parse/*`, `node:sqlite`, `@resvg/resvg-js`, `then-out/`, `openFile`).
- `apps/extension` → `packages/core` + `chrome.*` adapter + canvas PNG + `chrome.downloads`.

**`packages/core` boundary (platform-agnostic).** `Bookmark`, `Visit`, `Row`, `Status`, `HistoryWindow`, `Joined`; `normalizeUrl`; Chrome-epoch conversion; source-agnostic bookmark-tree walk; `buildRows` + `refresh`; `renderReport`; card SVG builder; Netscape rescue; `classify`; `checkLinks` (fetch); Wayback client; history-window computation. Core uses standard `fetch`, no Node builtins. PNG rasterization is per-app.

**Source adapters (not in core).**
- **CLI / web app**: `Bookmarks` JSON + copied `History` SQLite (`node:sqlite`); Chrome `name`, Chrome-epoch µs, Chrome node shape; `then-out/`.
- **Extension**: `chrome.bookmarks.getTree()` → `title`, `dateAdded` ms-Unix; `chrome.history.search` → `lastVisitTime`, `visitCount`; current profile; retained-window approximation; no profile copy.
Same normalized `Bookmark[]` + `Visit` map + `HistoryWindow` → shared `buildRows`.

**History window.** start = earliest retained visit (extension: min `lastVisitTime`; CLI: earliest `last_visit_time`); end = now; `available=false` → history unavailable + honest labels; ~90-day trim disclosed. "never opened since saving" only when `start ≤ addedAt ≤ end`.

**Link checks.** `packages/core` `checkLinks`: HEAD first, GET on 405/501, 10s timeout, concurrency 8, retries + backoff, 5xx retried then unchecked, follow redirects, `finalUrl`, classify (401/403/429/999 blocked; 404/410/DNS/timeout dead; 5xx/unlisted unchecked; 403/429 never dead); 7-day cache keyed by URL; optional progress; `noCheck`. Extension runs in MV3 **service worker**; requires **optional host permission** for CORS; `archive.org` for Wayback; `User-Agent`. Two network uses only.

**Report (MV3 CSP).** `renderReport` emits self-contained HTML (inline CSS + inline script, no external). Extension can't use inline scripts on `chrome-extension://` pages under MV3 `script-src 'self'`. Plan: open generated string via `blob:` URL in a tab; **verify**; fallback download + open. Artifact remains self-contained. `redact` mode.

**Card.** `packages/core` emits `card.svg` (1080×1350 + 1200×630 OG; counts/domains/years; initials tiles; no URLs/titles/folders; `then · ran locally, nothing uploaded`). PNG per app: CLI `@resvg/resvg-js`; extension **canvas** SVG→img→canvas→blob → `chrome.downloads`. 

**Rescue.** shared Netscape builder; Wayback concurrency 2 + cache; HTTP-200 snapshots only; `[archived] <title>`; snapshot URL; `--dry-run`-equivalent writes nothing; extension `chrome.downloads`. 

**Output.** extension `chrome.downloads`; no `then-out/`; CLI `then-out/` + `.gitignore` `*`.

**Testing.** `packages/core` vitest offline (stub `fetch`; fixture); extension MV3 integration light; no network in tests; `scripts/verify.mjs` per app.


## 6. Build & packaging

**Stack.** TypeScript, ESM. `packages/core` + `apps/cli`: **tsc only**, no bundler, Node ≥22.5. `apps/extension`: **Vite + manual MV3 manifest**, no framework. Core shared source; no Node-only APIs in core.

**Extension (MV3).** `manifest_version: 3`; `name: then`, `version`, description; `background` service worker (ESM `type: "module"`); `action`; icons; `permissions: ["bookmarks","history","downloads"]`; `optional_host_permissions: ["http://*/*","https://*/*"]`; `host_permissions: ["https://archive.org/*","https://web.archive.org/*"]` (Wayback; confirm exact hosts at build); `content_security_policy.extension_pages` no `unsafe-inline`, no remote; generated report self-contained via `blob:`. No remote code; no telemetry.

**Distribution.** Chrome Web Store listing (+ optional Edge store); packed `.zip` `apps/extension/dist`. Store privacy note mirrors §4. One-click install = the UX win. **CLI** `then-cli` kept on npm (`prepare` build; `prepublishOnly` test; `files: dist`); `npm deprecate then-cli@*` + migration note when extension ships (§8).

**Versioning.** semver; `then-cli` v0.1.0+ keeps working; extension `1.0.0` at polished ship; separate versions; flags/stable outputs preserved for CLI; no flag renames without README + tests. `then-out` (CLI) vs `chrome.downloads` (extension) documented.

**CI gate.** `npm ci && npm run build && npm test && npm run verify` per app; offline tests; no publish in CI; optional `gh release`. 

**Dev.** Vite dev / MV3 reload for extension; `tsx` CLI; `vitest`; `tsc`. 


## 7. Spec amendments

Doc co-authored separately; `PRD.md` + `AGENTS.md` amended in their own edits.

**PRD.md**
- **Scope**: move "no browser extension" out of v0 OUT; add **v1: Chromium MV3 extension `then`** (current profile; extension-first; CLI kept then deprecated); note **v1.5: standalone local-first web app** (drop-in disk files; multi-profile) later. PRD Non-goals "No … browser extension in v0" → adjust wording (not v1-extension forbidden). Keep no-cloud/no-account/no-server/no-LLM. 
- **Launch**: `npx then-cli` (npm name `then-cli`; note `then` on npm taken); add **Chrome Web Store** install as primary for extension; working name `then`. 
- **History**: extension current-profile + ~90-day trim + honest labels; disk profile reading = CLI/web app. 
- **Outputs**: extension outputs to browser Downloads + tab; `then-out/` = CLI. Keep card + rescue. 
- **Chromium-only** unchanged; no Firefox/Safari v1. Privacy unchanged + MV3 permissions. 
- v0 CLI milestone history kept.

**AGENTS.md**
- **§1**: product now extension-first `then` + CLI; still no server/account; read-only; Chromium. 
- **§2 output**: `then-out/` for `apps/cli`; **extension → browser Downloads + tab**; no telemetry; two network uses; URL-free card; honest labels; no LLM — unchanged. `then-out/.gitignore` `*` for CLI. 
- **§3 stack**: core `packages/core` tsc-only; **CLI `apps/cli` tsc-only Node ≥22.5 `node:sqlite` `@resvg/resvg-js`**; **`apps/extension` Vite MV3** (bundler exception); shared core no Node-only deps; canvas PNG in extension. 
- **§4**: CLI commands for `apps/cli`; extension UI + `chrome.downloads`. 
- **§5 layout**: monorepo `packages/core` + `apps/cli` + `apps/extension`. 
- **§8 profile**: extension reads current profile via `chrome.bookmarks`/`chrome.history`; CLI reads disk profiles + copied SQLite. 
- **§9**: retained in core; extension host permissions; `archive.org`; UA; cache. 
- **§10/§11**: outputs retained; `then-out/` CLI vs Downloads extension; MV3 CSP `blob:`; redact. 
- **§12 rescue**: retained; extension `chrome.downloads`. 
- **§14 DoD**: per app. **§15 Do not**: no telemetry; no LLM; no Firefox/Safari v1; no rename flags w/o README+tests; no new dep w/o reason; **no bundler for CLI/core; Vite allowed for `apps/extension`**; no server. 
- Non-goal "no browser extension" removed/relocated.


## 8. Migration & CLI deprecation

1. **Now (CLI era)**: `then-cli` working on `main`, `npx then-cli` not yet published; keep. 
2. **Monorepo restructure**: extract `packages/core`; move CLI `src/` → `apps/cli`; keep `then-cli` name/bin; tests move; README per app; no user-facing breakage. 
3. **Extension v1** in `apps/extension`; shared core; ship polished. 
4. **Deprecate CLI** once extension is polished: `npm deprecate then-cli@* "then is now a browser extension; ..."`; README migration note; keep package installable; **remove `apps/cli` in a later major** (not v1). 
5. **npm `then` fallback note**: extension uses `then` name; npm `then-cli`. 
6. **Web app later**: add `apps/web`, reuse core + CLI disk parsing; local-first; no server; covers disk files/multi-profile. 
7. **CLI users during transition**: no feature removal before deprecation; honesty preserved.


## 9. Risks & open questions

**Risks.** MV3 CSP vs self-contained report (mitigate `blob:`, verify); CORS/host permission for link checks; `chrome.history` window approximation + trim; Chromium schema drift (`title`/`dateAdded` adapter; schema version; fail loudly); canvas PNG fidelity vs resvg; store review/privacy; no telemetry; false-dead <2%; blocked vs dead; profile-only scope; service-worker lifetimes; testing MV3; monorepo restructure breakage.

**Open questions.**
- Exact Wayback host permissions (`archive.org` vs `web.archive.org`); reuse `packages/core` Wayback unchanged?
- `blob:` self-contained report in MV3 tab vs download+open — confirm.
- `chrome.history` retained-window start vs `History` DB `last_visit_time` parity; honest label accuracy.
- Extension store name vs `then`; icon; privacy policy text; supported Chrome min version (MV3, ESM SW ≥91; `chrome.history`…). 
- **Re-examination verdict itself**: is losing multi-profile + cross-browser + `then-out/` + no-bundler worth easier install? *(Decision §2 says yes; keep CLI.)*


## 10. Success metrics

Carried from PRD; extension-first adjustments noted.

| Metric | Target | Notes |
|---|---|---|
| **Install ease** | one-click store install; no Node/terminal for users | core re-examination goal |
| Time to first report | < 3 min | current-profile; no checks `--no-check`-equivalent <60s |
| False-dead rate | < 2% | blocked ≠ dead; 403/429 never dead; 5xx not dead; honest unchecked |
| Card render | < 2 s | canvas; shared SVG |
| Launch | re-examination approval → build `apps/extension`; store listing | not npm for extension |
| Retention | not measured; **no telemetry** | say so; keep README note |

**CLI parity during transition**: keep CLI metrics until deprecation (§8). 
