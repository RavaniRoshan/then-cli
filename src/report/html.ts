import type { Row, Stats } from '../types.js';
import type { Joined } from '../join.js';
import { domainOf } from '../join.js';
import { windowLengthDays } from '../parse/time.js';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pct(part: number, total: number): string {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function tileColor(domain: string): string {
  let hash = 0;
  for (const char of domain) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const palette = ['#35685a', '#9b4430', '#a67c2b', '#4b6387', '#6d5573', '#3f7276'];
  return palette[Math.abs(hash) % palette.length]!;
}

function initials(domain: string): string {
  const main = domain.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/gi, '');
  return (main.slice(0, 2) || '??').toUpperCase();
}

function domainTile(domain: string): string {
  const color = tileColor(domain);
  return `<span class="tile" style="background:${color}">${escapeHtml(initials(domain))}</span><span class="tile-name">${escapeHtml(domain)}</span>`;
}

function openLabel(row: Row, data: Joined): string {
  if (row.visit.lastVisitAt) return `last opened ${row.visit.lastVisitAt.slice(0, 10)}`;
  if (!data.window.available) return 'history unavailable';
  const retained = windowLengthDays(data.window.start, data.window.end) ?? 0;
  if (row.addedAt && data.window.start && row.addedAt >= data.window.start &&
      (!data.window.end || row.addedAt <= data.window.end)) {
    return 'never opened since saving';
  }
  return `not opened in the last ${retained} days`;
}

function linkCell(row: Row, redact: boolean): string {
  const title = row.title || '(untitled)';
  if (redact) {
    return `<span class="link-title">${escapeHtml(title)}</span><span class="link-url dim">${escapeHtml(domainOf(row.url))}</span>`;
  }
  return `<a href="${escapeHtml(row.url)}" rel="noopener noreferrer">${escapeHtml(title)}</a><span class="link-url">${escapeHtml(row.url)}</span>`;
}

function statusPill(row: Row): string {
  const state = row.status.state;
  const code = row.status.http ? ` ${row.status.http}` : '';
  return `<span class="pill ${state}">${state}${escapeHtml(code)}</span>`;
}

function rowHtml(row: Row, data: Joined, redact: boolean): string {
  return `<tr>
    <td class="mono nowrap">${escapeHtml(row.addedAt.slice(0, 10) || 'unknown')}</td>
    <td>${statusPill(row)}</td>
    <td>${linkCell(row, redact)}</td>
    <td class="dim">${escapeHtml(openLabel(row, data))}</td>
  </tr>`;
}

function timeline(data: Joined, focusYear: number | null): string {
  const years = data.stats.years;
  const max = Math.max(1, ...years.map((year) => year.count));
  const rows = years
    .map((year) => {
      const active = year.year === focusYear ? ' active' : '';
      const domains = year.topDomains.map((entry) => escapeHtml(entry.domain)).join(', ') || '—';
      return `<button class="year-row${active}" data-year="${year.year}">
        <span class="year-name mono">${year.year || 'unknown'}</span>
        <span class="bar"><span style="width:${(year.count / max) * 100}%"></span></span>
        <span class="year-count mono">${year.count.toLocaleString()}</span>
        <span class="year-dead mono">${pct(year.dead, year.count)} dead</span>
        <span class="year-domains">${domains}</span>
      </button>`;
    })
    .join('');
  return `<section id="timeline">
    <h2>Timeline</h2>
    <p class="hint">Pick a year to open its page below.</p>
    <div class="timeline-table">${rows}</div>
  </section>`;
}

function graveyard(data: Joined, redact: boolean): string {
  const dead = data.rows.filter((row) => row.status.state === 'dead');
  const grouped = new Map<number, Row[]>();
  for (const row of dead) {
    const year = Number(row.addedAt.slice(0, 4)) || 0;
    const bucket = grouped.get(year) ?? [];
    bucket.push(row);
    grouped.set(year, bucket);
  }
  const sections = [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([year, rows]) =>
        `<h3 class="mono">${year || 'unknown'} <span class="dim">${rows.length}</span></h3>
         <ul class="compact">${rows.map((row) => `<li>${linkCell(row, redact)}</li>`).join('')}</ul>`,
    )
    .join('');
  const domains = data.stats.topDeadDomains
    .map((entry) => `<li>${domainTile(entry.domain)} <span class="mono dim">${entry.count}</span></li>`)
    .join('');
  return `<section id="graveyard">
    <h2>Graveyard</h2>
    <div class="grave-grid">
      <div>${sections || '<p class="hint">No dead links found.</p>'}</div>
      <div><h3>Most lost domains</h3><ul class="tiles">${domains || '<li class="hint">None</li>'}</ul></div>
    </div>
  </section>`;
}

function regret(data: Joined, redact: boolean): string {
  const items = data.regret
    .map(
      (row) =>
        `<li><span class="mono dim">${escapeHtml(row.addedAt.slice(0, 10))}</span> ${rowHtmlInline(row, data, redact)}</li>`,
    )
    .join('');
  return `<section id="regret">
    <h2>Regret queue</h2>
    <p class="hint">Still alive, not opened recently, oldest saves first.</p>
    <ol class="compact">${items || '<li class="hint">Nothing to show.</li>'}</ol>
  </section>`;
}

function rowHtmlInline(row: Row, data: Joined, redact: boolean): string {
  return `${linkCell(row, redact)} <span class="dim">${escapeHtml(openLabel(row, data))}</span>`;
}

function yearPages(data: Joined, redact: boolean, focusYear: number): string {
  const years = data.stats.years.map((year) => year.year);
  const payload: Record<string, string> = {};
  for (const year of years) {
    const rows = data.rows
      .filter((row) => (Number(row.addedAt.slice(0, 4)) || 0) === year)
      .sort((a, b) => (a.addedAt || '9999').localeCompare(b.addedAt || '9999'));
    payload[String(year)] = rows.map((row) => rowHtml(row, data, redact)).join('');
  }
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  const selected = years.includes(focusYear) ? focusYear : (years[0] ?? 0);
  const tabs = years
    .map(
      (year) =>
        `<button class="tab${year === selected ? ' active' : ''}" data-year="${year}">${year || 'unknown'}</button>`,
    )
    .join('');
  return `<section id="year-page">
    <h2>Year by year</h2>
    <div class="tabs">${tabs}</div>
    <div class="table-wrap"><table><thead><tr><th>Saved</th><th>Status</th><th>Link</th><th>Visited</th></tr></thead>
    <tbody id="year-rows"></tbody></table></div>
  </section>
  <script type="application/json" id="then-pages">${json}</script>`;
}

function footer(data: Joined, checkedAt: string | null): string {
  const retained = windowLengthDays(data.window.start, data.window.end);
  const history = data.window.available
    ? retained === null
      ? 'history available, window length unknown'
      : `history window ${retained} days (${data.window.start?.slice(0, 10)} to ${data.window.end?.slice(0, 10)})`
    : 'history unavailable';
  const checked = checkedAt ? `checked ${checkedAt.slice(0, 10)}` : 'link checks skipped';
  return `<footer>
    <p>${escapeHtml(history)} · ${escapeHtml(checked)} · ${data.stats.unchecked.toLocaleString()} links unchecked</p>
    <p class="hint">"not opened in the last N days" means no visit exists inside the retained window. "never opened since saving" appears only when the save itself falls inside that window. A blocked link is not a dead link.</p>
  </footer>`;
}

const CSS = `
:root{--paper:#ece9e2;--panel:#f6f4ef;--ink:#15191b;--rule:#c6c0b4;--muted:#5f655f;--moss:#35685a;--rust:#9b4430;--brass:#a67c2b}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}header,main,footer{max-width:1040px;margin:0 auto;padding:0 24px}
header{padding-top:56px;padding-bottom:28px;border-bottom:1px solid var(--rule)}h1{font:600 34px/1.15 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:-.04em;margin:0 0 22px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--rule);border:1px solid var(--rule)}
.stat{background:var(--panel);padding:16px}.stat b{display:block;font:600 26px/1.1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.stat span{font-size:12px;color:var(--muted)}
section{padding:34px 0;border-bottom:1px solid var(--rule)}h2{font:600 18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin:0 0 6px}h3{font-size:14px;margin:20px 0 8px}
.hint{color:var(--muted);font-size:13px;margin:0 0 18px}.dim{color:var(--muted)}
.timeline-table{border-top:1px solid var(--rule)}.year-row{display:grid;grid-template-columns:70px 1fr 70px 80px 200px;gap:14px;align-items:center;width:100%;background:none;border:0;border-bottom:1px solid var(--rule);padding:10px 8px;text-align:left;color:inherit;cursor:pointer;font:inherit}
.year-row:hover,.year-row.active{background:var(--panel)}.year-row.active{box-shadow:inset 3px 0 var(--moss)}
.bar{height:8px;background:#d8d3c8;display:block}.bar span{display:block;height:100%;background:var(--moss)}
.year-name,.year-count,.year-dead{font-size:13px}.year-domains{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.grave-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:32px}.compact{list-style:none;padding:0;margin:0}.compact li{padding:7px 0;border-bottom:1px solid #d8d3c8;font-size:13px}
.tiles{list-style:none;padding:0;margin:0}.tiles li{display:flex;align-items:center;gap:10px;padding:6px 0}.tile{display:inline-flex;width:30px;height:30px;align-items:center;justify-content:center;color:#fff;font:600 11px ui-monospace,monospace;flex:0 0 auto}.tile-name{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}.tab{border:1px solid var(--rule);background:var(--panel);padding:5px 11px;cursor:pointer;font:12px ui-monospace,monospace;color:var(--ink)}.tab.active{background:var(--moss);border-color:var(--moss);color:#fff}
.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;font-weight:600;border-bottom:1px solid var(--rule);padding:8px}td{padding:8px;border-bottom:1px solid #d8d3c8;vertical-align:top}
td a{color:var(--moss);text-decoration:none;word-break:break-all}.link-url{display:block;color:var(--muted);font:11px ui-monospace,monospace;word-break:break-all;max-width:440px}.link-title{font-weight:600}
.pill{display:inline-block;padding:2px 7px;font:11px ui-monospace,monospace;border:1px solid var(--rule);white-space:nowrap}.pill.alive{color:var(--moss);border-color:var(--moss)}.pill.dead{color:var(--rust);border-color:var(--rust)}.pill.blocked{color:var(--brass);border-color:var(--brass)}.pill.redirected{color:#4b6387;border-color:#4b6387}
.nowrap{white-space:nowrap}footer{padding:24px 24px 60px;color:var(--muted);font-size:12px}footer p{margin:4px 0}
@media(max-width:700px){.year-row{grid-template-columns:60px 1fr 50px}.year-dead,.year-domains{display:none}.grave-grid{grid-template-columns:1fr}h1{font-size:26px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
`;

const SCRIPT = `
(function(){
  var payload=JSON.parse(document.getElementById('then-pages').textContent);
  var body=document.getElementById('year-rows');
  function show(year){
    document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.getAttribute('data-year')===String(year));});
    document.querySelectorAll('.year-row').forEach(function(t){t.classList.toggle('active',t.getAttribute('data-year')===String(year));});
    body.innerHTML=payload[String(year)]||'<tr><td colspan="4">No links for this year.</td></tr>';
  }
  document.querySelectorAll('.tab,.year-row').forEach(function(b){b.addEventListener('click',function(){show(b.getAttribute('data-year'));});});
  var selected=document.querySelector('.tab.active')||document.querySelector('.tab');
  if(selected){show(selected.getAttribute('data-year'));}
})();
`;

export function renderReport(data: Joined, options: { redact: boolean; checkedAt: string | null; focusYear?: number | undefined }): string {
  const stats: Stats = data.stats;
  const span = stats.earliestYear && stats.latestYear
    ? `${stats.earliestYear}–${stats.latestYear === stats.earliestYear ? stats.earliestYear : stats.latestYear}`
    : 'no dated links';
  const focusYear = options.focusYear ?? stats.earliestYear ?? 0;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>then · your bookmarks</title><style>${CSS}</style></head><body>
<header>
  <h1>Your bookmarks, ${escapeHtml(span)}</h1>
  <div class="stats">
    <div class="stat"><b>${stats.total.toLocaleString()}</b><span>links saved</span></div>
    <div class="stat"><b>${pct(stats.dead, stats.total)}</b><span>dead links</span></div>
    <div class="stat"><b>${pct(stats.notOpenedRecently, stats.total)}</b><span>not opened recently</span></div>
    <div class="stat"><b>${data.window.available ? `${windowLengthDays(data.window.start, data.window.end) ?? '?'}d` : 'n/a'}</b><span>history window</span></div>
  </div>
</header>
<main>
  ${timeline(data, focusYear)}
  ${graveyard(data, options.redact)}
  ${regret(data, options.redact)}
  ${yearPages(data, options.redact, focusYear)}
</main>
${footer(data, options.checkedAt)}
<script>${SCRIPT}</script>
</body></html>`;
}
