/**
 * Make two spellings of the same page joinable. Keeps the query intact because
 * two distinct pages can differ only by query string. Platform-agnostic; shared
 * by the CLI and browser-extension front ends.
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
