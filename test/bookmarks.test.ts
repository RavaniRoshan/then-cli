import { describe, expect, it } from 'vitest';
import { normalizeUrl, parseBookmarks } from '../src/parse/bookmarks.ts';
import { fixtureProfileDir } from './fixtures/make-history.mjs';
import { join } from 'node:path';

describe('URL normalization', () => {
  it('lowercases the host and drops fragments, default ports, and trailing slashes', () => {
    expect(normalizeUrl('  HTTPS://WWW.Example.COM:443/Path/#frag  ')).toBe('https://www.example.com/Path');
    expect(normalizeUrl('http://example.com:80/')).toBe('http://example.com/');
  });

  it('keeps query strings and handles non-web schemes', () => {
    expect(normalizeUrl('https://example.com/a?b=1&c=2')).toBe('https://example.com/a?b=1&c=2');
    expect(normalizeUrl('about:blank')).toBe('about:blank');
    expect(normalizeUrl('file:///C:/tmp/a.txt')).toBe('file:///C:/tmp/a.txt');
  });

  it('passes through unparseable text unchanged', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
    expect(normalizeUrl('   ')).toBe('');
  });
});

describe('recursive bookmark walk', () => {
  const bookmarks = parseBookmarks(join(fixtureProfileDir, 'Bookmarks'), 'Chrome', 'Default');

  it('walks nested roots into a folder path', () => {
    expect(bookmarks).toHaveLength(6);
    expect(bookmarks[0]?.folder).toEqual(['Bookmarks bar']);
    expect(bookmarks[4]?.folder).toEqual(['Other bookmarks']);
    expect(bookmarks[5]?.folder).toEqual(['Mobile bookmarks']);
  });

  it('normalizes URLs and converts save dates to ISO UTC', () => {
    expect(bookmarks[3]?.url).toBe('https://github.com/alpha');
    expect(bookmarks[0]?.addedAt).toBe('2014-03-05T00:00:00.000Z');
  });

  it('fails loudly on a missing file', () => {
    expect(() => parseBookmarks(join(fixtureProfileDir, 'Missing'), 'Chrome', 'Default')).toThrow(/Cannot read bookmarks/);
  });
});
