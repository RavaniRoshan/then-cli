# PRD — `then`

Working name. Verify npm availability before publishing.

## One-liner

See what you saved, by year, and what happened to it.

## Problem

Your browser has a decade of bookmarks. It gives you folders and a flat list sorted by date. It cannot answer:

- What did I save in 2014?
- Which of these links are dead?
- Did I ever go back to any of it?

So the archive becomes a graveyard you are afraid to delete. People keep it for "peace of mind" and never open it.

## Evidence

| Source | What it says | Date |
|---|---|---|
| [Ask HN: How Do You Bookmark?](https://news.ycombinator.com/item?id=42648006) | OP: saves links "only to completely forget about them". 28 replies, several describe the same backlog. | 2025-01-09 |
| [karakeep](https://github.com/karakeep-app/karakeep) 30.8k★, [linkwarden](https://github.com/linkwarden/linkwarden) 20.5k★, [linkding](https://github.com/sissbruecker/linkding) 11.4k★ | Managers own storage, tagging, and search. None answer "what did I save in 2014 and did it survive?" | 2026-11 |
| [LazyCat Bookmark Cleaner](https://github.com/Alanrk/LazyCat-Bookmark-Cleaner) 1.9k★ | Cleanup exists. It optimizes the library, not the retrospective. | 2026-01 |
| [Bookmark-Timeline](https://github.com/changingshow/Bookmark-Timeline) 8★ | The only timeline view found. Tiny, unmaintained, no history join. | 2025-09 |

Pain evidence in public threads is thin: one strong thread plus the builder's own archive. Treat demand as a hypothesis until launch. The crowd evidence is stronger: no maintained project found in GitHub search joins bookmarks with history. That is search-based, not exhaustive.

## Target user

Developers and researchers with 5+ years of bookmarks, who already self-host or run CLIs, and who feel mild guilt about the archive. They gather in r/DataHoarder, r/InternetIsBeautiful, Hacker News, and `awesome-cli-apps`.

## Why now

- Browser archives are now old enough for "2014" to be a meaningful unit of time.
- Link checking and the Wayback availability API are cheap and public.
- The "year in review" format is culturally primed and instantly legible.

## Success metrics

| Metric | Target | How measured |
|---|---|---|
| Time to first report, 5k bookmarks | < 3 min with checks, < 60s with `--no-check` | Manual benchmark |
| False-dead rate | < 2% | Manual sample of 50 links |
| Card render | < 2 s | Manual benchmark |
| Launch | 100 stars in 7 days | GitHub |

No telemetry. Retention is not measured. Say so in the README rather than adding analytics.

## Scope

### v0 — ship 2026-12-02

**IN**
- Chromium detection: Chrome, Edge, Brave, all profiles.
- Parse `Bookmarks`, copy and query `History`, join on URL.
- Link status with cache, concurrency, and `--no-check`.
- HTML report: header stats, timeline by year, graveyard, regret queue, year pages.
- Card: PNG + SVG, counts and domains only.
- `--redact`, `--year`, `--profile`.

**OUT**
- Rescue, duplicates, Firefox, Safari, LLM, search, tags, sync, any UI beyond the report.

### v0.1 — 2026-12-05

- `rescue --dry-run` and `rescue --write` → importable Netscape HTML.
- Duplicate detection across folders.
- Redirect repair: offer the final URL for moved links.

### v0.2 — after launch

- Taste drift: top domains per year.
- Single-year card.
- Firefox `places.sqlite` (bookmarks and history already joined in one DB).
- Optional "you were right" badge, shown only when the data is unambiguous, never as a blank section.

## Non-goals

- Not a bookmark manager. No storage, sync, accounts, or server.
- No automatic deletion or mutation of the profile.
- No cloud, no mobile app, no browser extension in v0.
- No AI summaries of your links.

## User flows

**1. First run**
`npx then` → detect profiles → if several, list and ask for `--profile` → progress bar → open `then-out/report.html`.

**2. Year browse**
`then --year 2014` → same report, opened at the 2014 section.

**3. Rescue**
`then rescue --dry-run` → table of dead links with snapshot dates → `then rescue --write` → `then-out/rescued-bookmarks.html` → import into the browser.

**4. Share**
`then card` → `then-out/card.png` → post. No URLs in the image.

## Report spec

1. **Header** — "Your bookmarks, 2011–2026", total links, dead %, not-opened-recently %, history window.
2. **Timeline** — one row per year: count, bar, dead share, top three domains.
3. **Graveyard** — dead links grouped by year; top dead domains.
4. **Regret queue** — alive, not opened recently, oldest first, ten items.
5. **Year page** — every link for that year, sorted by save date, with status.
6. **Footer** — check date, links unchecked, explicit limitations.

## Card spec

- 1080×1350, plus a 1200×630 OG variant.
- Headline: `2014–2026 · 4,812 links saved`.
- Three stats: dead %, not opened recently %, top domain of the earliest year.
- Six domain tiles with initials, no favicons.
- Footer: `then · ran locally, nothing uploaded`.
- Never call it "Wrapped". Borrow the format, not the trademark.

## Privacy

- Everything runs locally. The only outbound requests are link checks and Wayback lookups.
- Output lives in `then-out/`, which contains a `.gitignore` with `*`.
- `--redact` removes full URLs from the report.
- The card never contains URLs, titles, or folder names.
- The README states plainly: this file knows more about you than your browser history, do not commit it.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Chrome trims history (~90 days) | "Never opened" is wrong for old links | Compute and display the retained window; use "not opened recently" |
| Bot walls return 403/429 | False dead links | Classify as blocked, never dead |
| Users share the report and leak interests | Trust damage | Card is URL-free; `--redact`; gitignored output |
| 20k bookmarks make the report slow | Bad first run | One year rendered at a time; cache; `--no-check` |
| Novelty churn after launch | Dead repo | Rescue is the retention feature; ship it in v0.1 |
| Chrome schema drift | Parse failures | Fail loudly with the file path and schema version |

## Launch

**Show HN title:** "I joined my Chrome bookmarks with my history: 1,842 links I saved and never went back to"

- Post the card in the README and in the first comment on Reddit. Hacker News does not render inline images.
- Communities: r/DataHoarder, r/InternetIsBeautiful, `awesome-cli-apps`.
- Promise to answer every issue within 24 hours.
- Track what actually works. Star advice is anecdotal.

**README skeleton**

1. The problem, in two sentences.
2. GIF: terminal numbers, then the timeline.
3. `npx then`.
4. Three use cases: the graveyard, the regret queue, the card.
5. Privacy note.
6. Limitations: Chromium only, history window, no telemetry.

## Open questions

- Is `then` available on npm? If not, which fallback name?
- Do Edge and Brave ship the same `Bookmarks` schema version as Chrome? Verify with a fixture.
- Does the "2014" angle hold for users with less than two years of data? Fallback: last 12 months.
- Netscape HTML import: does it preserve folders well enough, or should rescue emit a JSON patch too?
