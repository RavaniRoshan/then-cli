# Glossary

Terms for `then`. Definitions describe the domain, not the implementation.

## Bookmark
A URL a person deliberately saved, carrying the title they gave it, the folder they put it in, and the moment they saved it.

## Visit
Evidence that a saved URL was opened in the browser: when it was last opened and how many times.

## History window
The span of time for which the browser still retains visit records. Anything older than this span cannot be used as evidence.

## Not opened recently
The truthful statement that no visit appears inside the retained history window. Used whenever a bookmark predates or falls outside that window.

## Never opened since saving
The stronger statement that a bookmark has no visit at all, justified only when the save moment itself lies inside the retained history window.

## Link state
The outcome of checking a saved URL.

- **Alive** — the link answers successfully.
- **Redirected** — the link answers successfully at a different final address.
- **Blocked** — the link refuses automated clients, often with a bot wall. A blocked link is not evidence of rot.
- **Dead** — the link fails to answer after retries.
- **Unchecked** — no check was performed.

## Graveyard
The collection of dead links, grouped by the year they were saved.

## Regret queue
Living links that were not opened recently, ordered from oldest save to newest. It is a prompt to look again, not a claim about intent.

## Rescue
Recovering a dead link from an archive snapshot and offering it as an importable bookmark. Rescue never changes the browser profile.

## Card
A shareable summary built from counts, domains, and years. It carries no full URLs, titles, or folder names.
