import type { Row, Snapshot } from './types.js';
import { outputPath, writeText } from './output.js';
import { lookupSnapshots } from './wayback.js';

export type RescueItem = {
  title: string;
  originalUrl: string;
  snapshotUrl: string;
  snapshotAt: string | null;
};

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function buildRescueItems(rows: Row[]): Promise<RescueItem[]> {
  const dead = [...new Map(rows.filter((row) => row.status.state === 'dead').map((row) => [row.url, row])).values()];
  if (dead.length === 0) return [];

  const snapshots: Map<string, Snapshot> = await lookupSnapshots(dead.map((row) => row.url));
  const items: RescueItem[] = [];
  for (const row of dead) {
    const snapshot = snapshots.get(row.url);
    if (!snapshot?.available || !snapshot.snapshotUrl) continue;
    items.push({
      title: `[archived] ${row.title || '(untitled)'}`,
      originalUrl: row.url,
      snapshotUrl: snapshot.snapshotUrl,
      snapshotAt: snapshot.snapshotAt ?? null,
    });
  }
  return items.sort((a, b) => (a.snapshotAt ?? '').localeCompare(b.snapshotAt ?? ''));
}

export function renderNetscape(items: RescueItem[]): string {
  const entries = items
    .map((item) => {
      const date = item.snapshotAt ? Math.floor(Date.parse(item.snapshotAt) / 1000) : 0;
      return `    <DT><A HREF="${esc(item.snapshotUrl)}" ADD_DATE="${date}">${esc(item.title)}</A>`;
    })
    .join('\n');
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- An automatically generated file. Imported by Chrome, Edge, and Brave. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Rescued bookmarks</H1>
<DL><p>
${entries}
</DL><p>
`;
}

export function printRescueTable(items: RescueItem[]): void {
  if (items.length === 0) {
    process.stdout.write('No recoverable dead links found.\n');
    return;
  }
  const rows = items.map((item) => ({
    saved: item.snapshotAt ? item.snapshotAt.slice(0, 10) : 'unknown',
    title: item.title,
    snapshot: item.snapshotUrl,
  }));
  const widths = {
    saved: Math.max(5, ...rows.map((row) => row.saved.length)),
    title: Math.max(5, ...rows.map((row) => row.title.length)),
    snapshot: Math.max(8, ...rows.map((row) => row.snapshot.length)),
  };
  process.stdout.write(
    `${'DATE'.padEnd(widths.saved)}  ${'TITLE'.padEnd(widths.title)}  ${'SNAPSHOT'.padEnd(widths.snapshot)}\n`,
  );
  for (const row of rows) {
    process.stdout.write(
      `${row.saved.padEnd(widths.saved)}  ${row.title.padEnd(widths.title)}  ${row.snapshot.padEnd(widths.snapshot)}\n`,
    );
  }
}

export async function rescue(joinedRows: Row[], write: boolean): Promise<void> {
  const items = await buildRescueItems(joinedRows);
  printRescueTable(items);
  if (write) {
    const path = writeText('rescued-bookmarks.html', renderNetscape(items));
    process.stdout.write(`Wrote ${path}\n`);
  } else {
    process.stdout.write(`Dry run: nothing written to ${outputPath('rescued-bookmarks.html')}\n`);
  }
}
