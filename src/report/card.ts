import { Resvg } from '@resvg/resvg-js';
import type { Joined } from '../join.js';
import { domainOf } from '../join.js';
import { writeBytes, writeText } from '../output.js';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pct(part: number, total: number): string {
  return total ? `${((part / total) * 100).toFixed(1)}%` : '0%';
}

function initials(domain: string): string {
  const main = domain.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/gi, '');
  return (main.slice(0, 2) || '??').toUpperCase();
}

function tileColor(domain: string): string {
  let hash = 0;
  for (const char of domain) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const palette = ['#35685a', '#9b4430', '#a67c2b', '#4b6387', '#6d5573', '#3f7276'];
  return palette[Math.abs(hash) % palette.length]!;
}

function topDomains(data: Joined, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const row of data.rows) {
    const domain = domainOf(row.url);
    if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([domain]) => domain);
}

function content(data: Joined): { headline: string; stats: Array<[string, string]>; domains: string[] } {
  const s = data.stats;
  const span = s.earliestYear && s.latestYear
    ? `${s.earliestYear}–${s.latestYear === s.earliestYear ? s.earliestYear : s.latestYear}`
    : 'no dated links';
  const earliest = s.years.find((year) => year.year === s.earliestYear);
  const firstDomain = earliest?.topDomains[0]?.domain ?? '—';
  return {
    headline: `${span} · ${s.total.toLocaleString()} links saved`,
    stats: [
      [pct(s.dead, s.total), 'dead links'],
      [pct(s.notOpenedRecently, s.total), 'not opened recently'],
      [firstDomain, 'top domain of earliest year'],
    ],
    domains: topDomains(data, 6),
  };
}

const BG = '#101618';
const FG = '#f2efe8';
const MUTED = '#93a09d';
const RULE = '#2c373a';
const MONO = "Consolas,'Courier New',monospace";
const SANS = "Arial,Helvetica,sans-serif";

function statBlock(stat: [string, string], x: number, y: number, size: number): string {
  const [value, label] = stat;
  const valueSize = value.length > 10 ? Math.max(18, Math.round((size * 10) / value.length)) : size;
  return `<text x="${x}" y="${y}" fill="${FG}" font-family="${MONO}" font-size="${valueSize}" font-weight="700">${esc(value)}</text>
  <text x="${x}" y="${y + 30}" fill="${MUTED}" font-family="${SANS}" font-size="15">${esc(label)}</text>`;
}

function tile(domain: string, x: number, y: number, box: number, labelSize: number, maxWidth: number): string {
  const maxChars = Math.max(8, Math.floor(maxWidth / (labelSize * 0.58)));
  const label = domain.length > maxChars ? `${domain.slice(0, maxChars - 1)}…` : domain;
  return `<rect x="${x}" y="${y}" width="${box}" height="${box}" fill="${tileColor(domain)}"/>
  <text x="${x + box / 2}" y="${y + box / 2 + 8}" fill="#ffffff" font-family="${MONO}" font-size="${Math.round(box * 0.34)}" font-weight="700" text-anchor="middle">${esc(initials(domain))}</text>
  <text x="${x}" y="${y + box + 24}" fill="${FG}" font-family="${SANS}" font-size="${labelSize}">${esc(label)}</text>`;
}

export function buildCardSvg(data: Joined, variant: 'main' | 'og'): string {
  const c = content(data);
  const main = variant === 'main';
  const width = main ? 1080 : 1200;
  const height = main ? 1350 : 630;
  const pad = main ? 84 : 72;
  const contentWidth = width - pad * 2;
  const headlineSize = main ? (c.headline.length > 38 ? 46 : 54) : (c.headline.length > 38 ? 38 : 44);
  const statSize = main ? 44 : 34;
  const box = main ? 88 : 50;
  const labelSize = main ? 17 : 14;
  const colGap = (contentWidth - box * 3) / 2;
  const rowGap = box + (main ? 72 : 40);
  const tileY = main ? 760 : 380;

  const stats = c.stats
    .map((stat, index) => statBlock(stat, pad + index * (contentWidth / 3), main ? 470 : 300, statSize))
    .join('');
  const tiles = c.domains
    .map((domain, index) => {
      const x = pad + (index % 3) * (box + colGap);
      const maxWidth = Math.min(box + colGap - 24, width - pad - x);
      return tile(domain, x, tileY + Math.floor(index / 3) * rowGap, box, labelSize, maxWidth);
    })
    .join('');
  const footerY = height - (main ? 96 : 34);
  const eyebrowY = main ? 160 : 104;
  const headlineY = main ? 268 : 190;
  const ruleY = main ? 344 : 230;
  const tileRuleY = main ? 660 : 348;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${BG}"/>
  <rect x="0" y="0" width="10" height="${height}" fill="#35685a"/>
  <text x="${pad}" y="${eyebrowY}" fill="${MUTED}" font-family="${SANS}" font-size="${main ? 17 : 15}">then · local bookmark archaeology</text>
  <text x="${pad}" y="${headlineY}" fill="${FG}" font-family="${MONO}" font-size="${headlineSize}" font-weight="700">${esc(c.headline)}</text>
  <line x1="${pad}" y1="${ruleY}" x2="${width - pad}" y2="${ruleY}" stroke="${RULE}" stroke-width="2"/>
  ${stats}
  <line x1="${pad}" y1="${tileRuleY}" x2="${width - pad}" y2="${tileRuleY}" stroke="${RULE}" stroke-width="2"/>
  ${tiles}
  <text x="${pad}" y="${footerY}" fill="${MUTED}" font-family="${SANS}" font-size="${main ? 16 : 14}">then · ran locally, nothing uploaded</text>
</svg>`;
}

export type CardArtifacts = {
  svg: string;
  png: string;
  ogSvg: string;
  ogPng: string;
};

export function renderCard(data: Joined): CardArtifacts {
  const svg = buildCardSvg(data, 'main');
  const ogSvg = buildCardSvg(data, 'og');
  const png = writeBytes('card.png', new Resvg(svg).render().asPng());
  const svgPath = writeText('card.svg', svg);
  const ogPng = writeBytes('card-og.png', new Resvg(ogSvg).render().asPng());
  const ogSvgPath = writeText('card-og.svg', ogSvg);
  return { svg: svgPath, png, ogSvg: ogSvgPath, ogPng };
}
