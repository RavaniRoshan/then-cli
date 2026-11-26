// MV3 service worker: read current Chromium profile (read-only), build the
// shared `then` report, open it self-contained in a tab. No telemetry; no
// network here (link checks + Wayback are a follow-up; see docs §8).
//
// Shared pure core is reused from ../../../src for now; extraction to
// packages/core is tracked in docs/re-examination-extension.md §8.
import { buildRows, type Joined } from '../../../src/join.js';
import { renderReport } from '../../../src/report/html.js';
import { normalizeUrl } from '../../../src/normalize-url.js';
import type { Bookmark, HistoryWindow, Visit } from '../../../src/types.js';

const BROWSER = /Edg\//.test(navigator.userAgent)
  ? 'Edge'
  : /Brave/.test(navigator.userAgent)
    ? 'Brave'
    : 'Chrome';

type ChromeNode = chrome.bookmarks.BookmarkTreeNode;

function walk(node: ChromeNode, folder: string[], out: Bookmark[]): void {
  if (typeof node.url === 'string' && node.url.trim() !== '') {
    const url = normalizeUrl(node.url);
    if (url !== '') {
      out.push({
        url,
        title: node.title ?? '',
        folder,
        addedAt: typeof node.dateAdded === 'number' ? new Date(node.dateAdded).toISOString() : '',
        browser: BROWSER,
        profile: 'current',
      });
    }
  }
  const children = node.children ?? [];
  const nextFolder = node.url ? folder : [...folder, node.title ?? ''].filter((name) => name !== '');
  for (const child of children) walk(child, nextFolder, out);
}

async function collectBookmarks(): Promise<Bookmark[]> {
  const tree = await chrome.bookmarks.getTree();
  const out: Bookmark[] = [];
  for (const root of tree) walk(root, [], out);
  return out;
}

async function collectHistory(): Promise<{ visits: Map<string, Visit>; window: HistoryWindow }> {
  const items = await chrome.history.search({ text: '', startTime: 0, endTime: Date.now(), maxResults: 100000 });
  const visits = new Map<string, Visit>();
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = 0;

  for (const item of items) {
    if (!item.url) continue;
    const key = normalizeUrl(item.url);
    if (key === '') continue;
    const lastVisitMs = typeof item.lastVisitTime === 'number' ? item.lastVisitTime : 0;
    if (lastVisitMs > 0) {
      minMs = Math.min(minMs, lastVisitMs);
      maxMs = Math.max(maxMs, lastVisitMs);
    }
    const visit: Visit = {
      url: key,
      lastVisitAt: lastVisitMs > 0 ? new Date(lastVisitMs).toISOString() : null,
      visitCount: typeof item.visitCount === 'number' ? item.visitCount : 0,
    };
    // chrome.history returns one row per URL; keep the most recent.
    const existing = visits.get(key);
    if (!existing || (visit.lastVisitAt ?? '') > (existing.lastVisitAt ?? '')) visits.set(key, visit);
  }

  const available = Number.isFinite(minMs) && maxMs > 0;
  const window: HistoryWindow = {
    available,
    start: available ? new Date(minMs).toISOString() : null,
    end: available ? new Date().toISOString() : null,
  };
  return { visits, window };
}

async function buildReportHtml(): Promise<string> {
  const [bookmarks, history] = await Promise.all([collectBookmarks(), collectHistory()]);
  const joined: Joined = buildRows(bookmarks, history.visits, history.window);
  // No link checks in this slice; honestly render 'unchecked' + skipped footer.
  return renderReport(joined, { redact: false, checkedAt: null });
}

async function openReport(): Promise<void> {
  const html = await buildReportHtml();
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  // MV3: generated self-contained HTML opened as a blob: tab (not an extension
  // page), so it isn't subject to the extension CSP. Verify in Chrome.
  await chrome.tabs.create({ url });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

chrome.action.onClicked.addListener(() => {
  openReport().catch((error: unknown) => {
    console.error('then: failed to build report', error);
  });
});
