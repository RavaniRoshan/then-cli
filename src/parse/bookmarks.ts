import { readFileSync } from 'node:fs';
import type { Bookmark } from '../types.js';
import { SchemaError } from '../types.js';
import { toIso } from './time.js';

type RawNode = {
  type?: unknown;
  name?: unknown;
  url?: unknown;
  date_added?: unknown;
  children?: unknown;
};

type RawBookmarks = {
  version?: unknown;
  roots?: unknown;
};

const ROOT_ORDER = ['bookmark_bar', 'other', 'synced'];

/**
 * Make two spellings of the same page joinable. Keeps the query intact because
 * two distinct pages can differ only by query string.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    const u = new URL(trimmed);
    const protocol = u.protocol.toLowerCase();
    const host = u.hostname.toLowerCase();
    let pathname = u.pathname;

    if (protocol === 'file:') {
      return `file://${pathname}${u.search}`;
    }

    if (!host) {
      return `${protocol}${pathname}${u.search}`;
    }

    let port = u.port;
    if ((protocol === 'http:' && port === '80') || (protocol === 'https:' && port === '443')) {
      port = '';
    }
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.replace(/\/+$/, '');
    }
    const auth = u.username ? `${u.username}${u.password ? `:${u.password}` : ''}@` : '';
    return `${protocol}//${auth}${host}${port ? `:${port}` : ''}${pathname}${u.search}`;
  } catch {
    return trimmed;
  }
}

function asTimestamp(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return toIso(value) ?? '';
  }
  return '';
}

function walk(
  node: RawNode,
  folder: string[],
  browser: string,
  profile: string,
  out: Bookmark[],
): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'folder' && Array.isArray(node.children)) {
    const name = typeof node.name === 'string' && node.name ? node.name : 'Unnamed folder';
    for (const child of node.children) {
      if (child && typeof child === 'object') {
        walk(child as RawNode, [...folder, name], browser, profile, out);
      }
    }
    return;
  }

  if (node.type !== 'url') return;
  if (typeof node.url !== 'string' || !node.url.trim()) return;

  const url = normalizeUrl(node.url);
  if (!url) return;

  out.push({
    url,
    title: typeof node.name === 'string' ? node.name : '',
    folder,
    addedAt: asTimestamp(node.date_added),
    browser,
    profile,
  });
}

export function parseBookmarks(
  filePath: string,
  browser: string,
  profile: string,
): Bookmark[] {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new SchemaError(filePath, error instanceof Error ? error.message : String(error));
  }

  let raw: RawBookmarks;
  try {
    raw = JSON.parse(text) as RawBookmarks;
  } catch {
    throw new SchemaError(filePath, 'invalid JSON');
  }

  const version = raw && typeof raw.version === 'number' ? raw.version : 'missing';
  if (!raw || typeof raw.roots !== 'object' || raw.roots === null) {
    throw new SchemaError(filePath, `unsupported schema (version: ${version})`);
  }

  const roots = raw.roots as Record<string, RawNode>;
  const keys = [...ROOT_ORDER.filter((key) => key in roots), ...Object.keys(roots).filter((key) => !ROOT_ORDER.includes(key))];
  const out: Bookmark[] = [];

  for (const key of keys) {
    const root = roots[key];
    if (!root || typeof root !== 'object') continue;
    const rootName = typeof root.name === 'string' && root.name ? root.name : key;
    if (root.type === 'folder' && Array.isArray(root.children)) {
      for (const child of root.children) {
        if (child && typeof child === 'object') walk(child as RawNode, [rootName], browser, profile, out);
      }
    } else {
      walk(root, [rootName], browser, profile, out);
    }
  }

  return out;
}
