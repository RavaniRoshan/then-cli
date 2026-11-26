#!/usr/bin/env node
import { detectProfile } from './detect.js';
import type { Options, Row } from './types.js';
import { UserError } from './types.js';
import { parseBookmarks } from './parse/bookmarks.js';
import { readHistory } from './parse/history.js';
import { buildRows, type Joined } from './join.js';
import { checkLinks } from './check.js';
import { renderReport } from './report/html.js';
import { renderCard } from './report/card.js';
import { openFile, writeText, ensureOutDir } from './output.js';
import { rescue } from './rescue.js';
import { refresh } from './join.js';

const USAGE = `then — local bookmark archaeology

Usage:
  then                        report, default profile
  then --year 2014            open the report at 2014
  then --no-check             offline, instant
  then --redact               strip full URLs from the report
  then --profile <name|path>  choose a profile
  then card                   write then-out/card.png + card.svg
  then rescue --dry-run       list recoverable dead links
  then rescue --write         write then-out/rescued-bookmarks.html

  then --help                 show this message
`;

function progress(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function parseArgs(argv: string[]): Options {
  const options: Options = { noCheck: false, redact: false, command: 'report', rescueWrite: false, rescueDryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--no-check') options.noCheck = true;
    else if (arg === '--redact') options.redact = true;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (arg === '--profile') {
      const value = argv[++index];
      if (!value) throw new UserError('--profile needs a value');
      options.profile = value;
    } else if (arg === '--year') {
      const value = argv[++index];
      if (!value || !/^\d{4}$/.test(value)) throw new UserError('--year needs a four-digit year');
      options.year = Number(value);
    } else if (arg === 'card') options.command = 'card';
    else if (arg === 'rescue') options.command = 'rescue';
    else if (arg === '--write') options.rescueWrite = true;
    else if (arg === '--dry-run') options.rescueDryRun = true;
    else throw new UserError(`Unknown argument: ${arg}\n${USAGE}`);
  }

  if (options.command === 'rescue' && options.rescueWrite === options.rescueDryRun) {
    throw new UserError('rescue needs exactly one of --dry-run or --write');
  }
  return options;
}

async function collect(options: Options): Promise<{ joined: Joined; cleanup: () => void }> {
  const profile = detectProfile(options.profile);
  progress(`Profile: ${profile.browser}/${profile.name}`);

  const bookmarks = parseBookmarks(profile.bookmarksPath, profile.browser, profile.name);
  progress(`Bookmarks: ${bookmarks.length.toLocaleString()}`);

  const history = readHistory(profile.historyPath);
  if (!history.window.available) progress('History unavailable; visit labels will be limited.');

  const joined = buildRows(bookmarks, history.visits, history.window);

  if (!options.noCheck) {
    const unique = new Set(bookmarks.map((bookmark) => bookmark.url)).size;
    progress(`Checking ${unique.toLocaleString()} links...`);
    await checkLinks(joined.rows, (done, total) => {
      if (process.stderr.isTTY) {
        process.stderr.write(`\rChecked ${done.toLocaleString()}/${total.toLocaleString()} links`);
      }
    });
    if (process.stderr.isTTY) process.stderr.write('\n');
  } else {
    progress('Offline mode: link checks skipped.');
  }

  // Statuses changed inside checkLinks; recompute dead shares and the queue.
  return { joined: refresh(joined), cleanup: history.cleanup };
}

function countUnique(rows: Row[]): number {
  return new Set(rows.map((row) => row.url)).size;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  ensureOutDir();

  const { joined, cleanup } = await collect(options);
  try {
    if (options.command === 'card') {
      const artifacts = renderCard(joined);
      process.stdout.write(`Wrote ${artifacts.png}\nWrote ${artifacts.svg}\n`);
      process.stdout.write(`Wrote ${artifacts.ogPng}\nWrote ${artifacts.ogSvg}\n`);
      return;
    }

    if (options.command === 'rescue') {
      await rescue(joined.rows, options.rescueWrite);
      return;
    }

    const path = writeText('report.html', renderReport(joined, {
      redact: options.redact,
      checkedAt: options.noCheck ? null : new Date().toISOString(),
      focusYear: options.year,
    }));
    process.stdout.write(`Wrote ${path}\n`);
    process.stdout.write(
      `${joined.stats.total.toLocaleString()} links · ${joined.stats.dead.toLocaleString()} dead · ${countUnique(joined.rows).toLocaleString()} unique URLs\n`,
    );
    // PRD flow 1: open the report. Only on a terminal so scripts and tests stay quiet.
    if (process.stdout.isTTY) openFile(path);
  } finally {
    cleanup();
  }
}

main().catch((error: unknown) => {
  if (error instanceof UserError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
  process.exitCode = 1;
});
