import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import type { ProfileInfo } from './types.js';
import { UserError } from './types.js';

type Platform = 'win32' | 'darwin' | 'linux';

type BrowserBase = {
  browser: string;
  path: string;
};

const SKIP = new Set(['guest profile', 'system profile']);

function localAppData(): string {
  return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
}

function basesFor(platform: Platform): BrowserBase[] {
  if (platform === 'win32') {
    return [
      { browser: 'Chrome', path: join(localAppData(), 'Google', 'Chrome', 'User Data') },
      { browser: 'Edge', path: join(localAppData(), 'Microsoft', 'Edge', 'User Data') },
      { browser: 'Brave', path: join(localAppData(), 'BraveSoftware', 'Brave-Browser', 'User Data') },
    ];
  }
  if (platform === 'darwin') {
    const appSupport = join(homedir(), 'Library', 'Application Support');
    return [
      { browser: 'Chrome', path: join(appSupport, 'Google', 'Chrome') },
      { browser: 'Edge', path: join(appSupport, 'Microsoft Edge') },
      { browser: 'Brave', path: join(appSupport, 'BraveSoftware', 'Brave-Browser') },
    ];
  }
  return [
    { browser: 'Chrome', path: join(homedir(), '.config', 'google-chrome') },
    { browser: 'Edge', path: join(homedir(), '.config', 'microsoft-edge') },
    { browser: 'Brave', path: join(homedir(), '.config', 'BraveSoftware', 'Brave-Browser') },
  ];
}

function makeProfile(browser: string, name: string, dir: string): ProfileInfo {
  return {
    browser,
    name,
    dir,
    bookmarksPath: join(dir, 'Bookmarks'),
    historyPath: join(dir, 'History'),
  };
}

function allProfiles(): ProfileInfo[] {
  const platform = (process.platform in { win32: 1, darwin: 1, linux: 1 } ? process.platform : 'linux') as Platform;
  const found: ProfileInfo[] = [];
  const seen = new Set<string>();

  for (const base of basesFor(platform)) {
    if (!existsSync(base.path)) continue;

    if (existsSync(join(base.path, 'Bookmarks'))) {
      found.push(makeProfile(base.browser, 'Default', base.path));
      seen.add(resolve(base.path).toLowerCase());
    }

    let entries: string[];
    try {
      entries = readdirSync(base.path, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      continue;
    }

    for (const name of entries) {
      if (SKIP.has(name.toLowerCase())) continue;
      const dir = join(base.path, name);
      if (!existsSync(join(dir, 'Bookmarks'))) continue;
      const key = resolve(dir).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(makeProfile(base.browser, name, dir));
    }
  }

  return found;
}

function formatProfiles(profiles: ProfileInfo[]): string {
  return profiles.map((p) => `  ${p.browser}/${p.name}  ${p.dir}`).join('\n');
}

function inferBrowser(dir: string, platform: Platform): string {
  const target = resolve(dir).toLowerCase();
  for (const base of basesFor(platform)) {
    if (target.startsWith(`${resolve(base.path).toLowerCase()}${sep}`)) return base.browser;
  }
  return 'custom';
}

export function detectProfile(explicit?: string): ProfileInfo {
  const platform = (process.platform in { win32: 1, darwin: 1, linux: 1 } ? process.platform : 'linux') as Platform;

  if (explicit) {
    const asPath = resolve(explicit);
    if (existsSync(join(asPath, 'Bookmarks'))) {
      return makeProfile(inferBrowser(asPath, platform), basename(asPath) || 'Default', asPath);
    }

    const needle = explicit.toLowerCase();
    const matches = allProfiles().filter(
      (p) => p.name.toLowerCase() === needle || `${p.browser}/${p.name}`.toLowerCase() === needle,
    );
    if (matches.length === 1) return matches[0]!;
    if (matches.length === 0) {
      throw new UserError(`No profile matches --profile "${explicit}". Detected profiles:\n${formatProfiles(allProfiles())}`);
    }
    throw new UserError(`--profile "${explicit}" is ambiguous:\n${formatProfiles(matches)}`);
  }

  const profiles = allProfiles();
  if (profiles.length === 0) {
    throw new UserError(
      'No Chromium profile with a Bookmarks file was found. Pass --profile with the profile directory.',
    );
  }
  if (profiles.length > 1) {
    throw new UserError(`Multiple profiles found. Choose one with --profile:\n${formatProfiles(profiles)}`);
  }
  return profiles[0]!;
}
