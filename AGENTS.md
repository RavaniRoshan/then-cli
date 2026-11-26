# AGENTS.md — `then`

Local bookmark archaeology. Read-only. No account. No server.

## 1. What we are building

A CLI that reads a Chromium profile's `Bookmarks` JSON and `History` SQLite, joins them on URL, checks link status, and renders:

1. a private HTML report (timeline by year, graveyard stats, regret queue),
2. a shareable card (PNG + SVG),
3. an importable file of Wayback-rescued bookmarks.

Working name: `then`. Verify npm availability before publishing. Fallbacks: `then-cli`, `decade`.

## 2. Non-negotiable rules

1. **Never write to the browser profile.** Read a copy. All output goes to `then-out/`.
2. **No telemetry.** No analytics, no crash reporting, no update check, no "anonymous usage". Ever.
3. **Two network uses only:** link status checks and the Wayback availability API. Nothing else.
4. **Shared artifacts contain no full URLs.** The card shows counts, domains, and years only.
5. **Honest numbers.** If history was trimmed, say so. Never claim "never opened" when the data only supports "not opened recently".
6. **No LLM in v0.** The product is joins and counts.

## 3. Stack

- Node >= 22.5, ESM, TypeScript, `tsc` only. No bundler.
- `node:sqlite` for the History database. No ORM.
- `@resvg/resvg-js` for SVG → PNG (prebuilt, no compiler).
- Dev only: `tsx`, `vitest`.
- No web framework. The report is one HTML string.

## 4. Commands

```bash
npm run dev -- --no-check
npm run build
node dist/cli.js --no-check
npm test
```

CLI surface:

```bash
then                        # report, default profile
then --year 2014            # open report at 2014
then --no-check             # offline, instant
then --redact               # strip full URLs from the report
then card                   # write then-out/card.png + card.svg (+ OG variants)
then rescue --dry-run       # list recoverable dead links
then rescue --write         # write then-out/rescued-bookmarks.html
```

## 5. Layout

```
src/
  cli.ts              arg parsing, command dispatch, progress
  detect.ts           find profiles per OS and browser
  parse/bookmarks.ts  Chrome JSON -> Bookmark[]
  parse/history.ts    copy DB, query urls, -> Visit[]
  parse/time.ts       Chrome epoch conversion
  join.ts             join + derive stats
  check.ts            HTTP status, cache, concurrency
  wayback.ts          availability API, snapshot lookup
  report/html.ts      report template
  report/card.ts      SVG template + PNG export
  output.ts           then-out/, gitignore, file writes
test/
  fixtures/           tiny Bookmarks JSON + generated History DB
```

## 6. Data model

```ts
type Bookmark = {
  url: string;
  title: string;
  folder: string[];
  addedAt: string;      // ISO 8601 UTC
  browser: string;
  profile: string;
};

type Visit = {
  url: string;
  lastVisitAt: string | null;
  visitCount: number;
};

type Status = {
  url: string;
  state: 'alive' | 'dead' | 'redirected' | 'blocked' | 'unchecked';
  http?: number;
  finalUrl?: string;
  checkedAt?: string;
};

type Snapshot = {
  url: string;
  available: boolean;
  snapshotUrl?: string;
  snapshotAt?: string;
};

type Row = Bookmark & {
  visit: Visit;
  status: Status;
  snapshot?: Snapshot;
  duplicateCount: number;
};
```

## 7. Time

Chrome stores microseconds since `1601-01-01T00:00:00Z`.

- Convert once, in `parse/time.ts`. Nothing downstream sees a raw Chrome timestamp.
- Values exceed `Number.MAX_SAFE_INTEGER`. Divide before constructing a `Date`; day precision is enough.
- `0` and missing values mean "unknown", never 1601.

```ts
const CHROME_EPOCH_MS = Date.UTC(1601, 0, 1);
const toDate = (us: number | bigint) => new Date(CHROME_EPOCH_MS + Number(us) / 1000);
```

## 8. Profile detection

Base directories:

| Browser | Windows | macOS | Linux |
|---|---|---|---|
| Chrome | `%LOCALAPPDATA%\Google\Chrome\User Data` | `~/Library/Application Support/Google/Chrome` | `~/.config/google-chrome` |
| Edge | `%LOCALAPPDATA%\Microsoft\Edge\User Data` | `~/Library/Application Support/Microsoft Edge` | `~/.config/microsoft-edge` |
| Brave | `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data` | `~/Library/Application Support/BraveSoftware/Brave-Browser` | `~/.config/BraveSoftware/Brave-Browser` |

- A profile is any subdirectory containing `Bookmarks`.
- Skip `Guest Profile` and `System Profile`.
- If more than one profile exists and `--profile` is absent, list them and exit non-zero. Never guess.

**Chrome locks `History` while running.** Copy `History`, `History-wal`, and `History-shm` to `os.tmpdir()/then-<pid>/`, open the copy with `node:sqlite`, delete on exit. If `History` is missing, continue with `lastVisitAt: null` and label the report "history unavailable".

## 9. Link checks

- `HEAD` first. On `405` or `501`, retry with `GET`.
- Timeout 10s, concurrency 8, two retries with backoff.
- Follow redirects; record `finalUrl` when it differs.
- Classify:
  - `alive`: 2xx, 3xx
  - `redirected`: final URL differs from saved URL
  - `blocked`: 401, 403, 429, 999
  - `dead`: 404, 410, DNS failure, timeout after retries
  - `unchecked`: `--no-check`
- **403 and 429 are never dead.** Bot walls are not link rot.
- Cache in `then-out/cache.json`, keyed by URL, TTL 7 days.
- Send `User-Agent: then/0.1 (+https://github.com/<owner>/then)`.

## 10. Report

- One self-contained HTML file. No external fonts, scripts, or images.
- No favicon fetching: use domain initials in colored tiles. Fetching favicons would leak the bookmark list to a third party.
- Sections: header stats, timeline by year, graveyard, regret queue, year pages.
- 20k rows must stay responsive: render one year at a time, switch with plain JS.
- Footer must state: history window length, check date, number of links unchecked.
- Labels are literal:
  - "not opened in the last N days" when history was trimmed,
  - "never opened since saving" only when the save date is inside the retained window.

## 11. Card

- 1080×1350 PNG, plus the SVG source and a 1200×630 Open Graph variant.
- Dark background, one headline, three stats, six domain tiles.
- Never include full URLs, titles, or folder names.
- Footer: tool name and "ran locally, nothing uploaded".

## 12. Rescue

- `rescue` never mutates the profile.
- Emit `then-out/rescued-bookmarks.html` in Netscape bookmark format, importable by Chrome, Edge, and Brave.
- Title becomes `[archived] <original title>`; URL becomes the snapshot URL.
- Only offer snapshots with HTTP 200.
- Concurrency 2 against the Wayback API. Cache every lookup.
- `--dry-run` prints a table and writes nothing.

## 13. Tests

- Fixtures: a hand-written `Bookmarks` JSON and a `History` SQLite built in the test setup.
- Unit: epoch conversion, recursive folder walk, URL normalization, duplicate counting, dead/blocked classification, redaction.
- Integration: fixture profile → report HTML contains the expected counts.
- No network in tests. Stub `fetch`.

## 14. Definition of done (v0)

- `npm ci && npm run build` works on a clean machine.
- Fixture profile produces `then-out/report.html` in under 2 seconds with `--no-check`.
- `then card` writes both files.
- `npm test` passes offline.
- README has a GIF, one-command install, and the privacy note.
- `then-out/.gitignore` contains `*` so a report cannot be committed by accident.

## 15. Do not

- Do not add a web server, database, account system, or sync.
- Do not add an LLM call to v0.
- Do not add Firefox or Safari before v0 ships.
- Do not rename flags without updating the README and tests.
- Do not add a dependency without a written reason in the PR.
