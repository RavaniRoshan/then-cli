// Executable goal checks. Usage: node scripts/verify.mjs <layout|privacy|report|artifacts|all>
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const srcDir = join(root, 'src');
const fixture = join(root, 'test', 'fixtures');
const outDir = join(root, 'then-out');
let failures = 0;

function ok(message) {
  process.stdout.write(`  ok  ${message}\n`);
}
function fail(message) {
  failures += 1;
  process.stdout.write(`FAIL  ${message}\n`);
}
function check(condition, message) {
  if (condition) ok(message);
  else fail(message);
}
function sourceFiles(dir = srcDir, list = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, list);
    else if (entry.name.endsWith('.ts')) list.push(path);
  }
  return list;
}
function run(args) {
  return execFileSync(process.execPath, [join(root, 'dist', 'cli.js'), ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
  });
}
function ensureFixture() {
  const history = join(fixture, 'profile', 'Default', 'History');
  if (!existsSync(history)) {
    execFileSync(process.execPath, [join(fixture, 'make-history.mjs')], { cwd: root, encoding: 'utf8' });
  }
}
function out(name) {
  return join(outDir, name);
}
function read(name) {
  return readFileSync(out(name), 'utf8');
}

function checkLayout() {
  const required = [
    'src/cli.ts', 'src/detect.ts', 'src/parse/bookmarks.ts', 'src/parse/history.ts',
    'src/parse/time.ts', 'src/join.ts', 'src/check.ts', 'src/wayback.ts',
    'src/report/html.ts', 'src/report/card.ts', 'src/output.ts',
    'test/fixtures/profile/Default/Bookmarks', 'test/fixtures/make-history.mjs',
    'README.md', 'GLOSSARY.md', 'docs/demo.gif',
  ];
  for (const rel of required) {
    check(existsSync(join(root, rel)), `exists ${rel}`);
  }
}

function checkPrivacy() {
  const files = sourceFiles();
  const forbidden = /analytics|telemetry|sentry|posthog|datadog|crashlytics|openai|anthropic|llm|favicon/i;
  const networkOk = new Set(['check.ts', 'wayback.ts']);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const name = file.split(sep).pop();
    check(!forbidden.test(text), `no telemetry/LLM/favicon markers in ${name}`);
    const hasFetch = /\bfetch\s*\(/.test(text);
    if (hasFetch) check(networkOk.has(name), `fetch only in allowed files (${name})`);
    const literals = [...text.matchAll(/https?:\/\/[^\s'"`)]+/g)].filter(
      (match) => !match[0].includes('www.w3.org/2000/svg'),
    );
    check(literals.length === 0 || networkOk.has(name), `network literals only in allowed files (${name})`);
  }
  const gitignore = readFileSync(out('.gitignore'), 'utf8');
  check(gitignore.trim() === '*', 'then-out/.gitignore contains only *');
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  check(readme.includes('npx then-cli'), 'README has the one-command install');
  check(readme.includes('Do not commit it.'), 'README states the privacy warning');
  check(readme.includes('docs/demo.gif'), 'README embeds the demo GIF');
  check(readme.includes('Chromium only'), 'README states the Chromium limitation');
}

function checkReport() {
  ensureFixture();
  rmSync(out('report.html'), { force: true });
  const started = process.hrtime.bigint();
  run(['--profile', join(fixture, 'profile', 'Default'), '--no-check']);
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  check(elapsed < 2000, `report rendered in ${Math.round(elapsed)}ms (< 2000ms)`);
  check(existsSync(out('report.html')), 'report.html written');
  const html = read('report.html');
  check(html.includes('Your bookmarks, 2014–2026'), 'report header spans 2014 to 2026');
  check(html.includes('<b>6</b>'), 'report counts 6 links');
  check(html.includes('33.3%'), 'report shows 33.3% not opened recently');
  check(html.includes('not opened in the last 89 days'), 'report uses the honest not-opened label');
  check(html.includes('history window 89 days'), 'report states the history window');
  check(html.includes('6 links unchecked'), 'report states unchecked count');
  check(html.includes('id="then-pages"'), 'year pages are JSON-driven');
}

function checkArtifacts() {
  ensureFixture();
  for (const name of ['card.png', 'card.svg', 'card-og.png', 'card-og.svg', 'rescued-bookmarks.html']) {
    rmSync(out(name), { force: true });
  }
  const profile = join(fixture, 'profile', 'Default');
  run(['card', '--profile', profile, '--no-check']);

  for (const name of ['card.png', 'card.svg', 'card-og.png', 'card-og.svg']) {
    check(existsSync(out(name)), `card artifact ${name} written`);
  }

  const png = readFileSync(out('card.png'));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  check(width === 1080 && height === 1350, `card.png is 1080x1350 (${width}x${height})`);
  check(png.length > 10_000, `card.png renders real pixels (${png.length} bytes)`);

  const bookmarks = JSON.parse(readFileSync(join(fixture, 'profile', 'Default', 'Bookmarks'), 'utf8'));
  const leak = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.url === 'string') leak.push(node.url);
    if (typeof node.name === 'string') leak.push(node.name);
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  walk(bookmarks.roots);
  for (const name of ['card.svg', 'card-og.svg', 'card.png', 'card-og.png']) {
    const bytes = readFileSync(out(name));
    const text = bytes.toString('utf8');
    check(!leak.some((item) => text.includes(item)), `${name} contains no bookmark URLs or titles`);
  }
  check(readFileSync(out('card.svg'), 'utf8').includes('ran locally, nothing uploaded'), 'card.svg carries the privacy footer');

  run(['rescue', '--dry-run', '--profile', profile, '--no-check']);
  check(!existsSync(out('rescued-bookmarks.html')), 'rescue --dry-run writes nothing');
  run(['rescue', '--write', '--profile', profile, '--no-check']);
  const rescue = read('rescued-bookmarks.html');
  check(rescue.includes('<!DOCTYPE NETSCAPE-Bookmark-file-1>'), 'rescue --write emits Netscape HTML');
}

const checks = {
  layout: checkLayout,
  privacy: checkPrivacy,
  report: checkReport,
  artifacts: checkArtifacts,
};

const requested = process.argv[2] ?? 'all';
const names = requested === 'all' ? Object.keys(checks) : [requested];
for (const name of names) {
  const fn = checks[name];
  if (!fn) {
    fail(`unknown check "${name}"`);
    continue;
  }
  process.stdout.write(`\n${name}\n`);
  fn();
}
process.stdout.write(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exitCode = failures === 0 ? 0 : 1;
