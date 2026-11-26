import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const OUT_DIR = join(process.cwd(), 'then-out');

export function ensureOutDir(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const gitignore = join(OUT_DIR, '.gitignore');
  const wanted = '*\n';
  if (!existsSync(gitignore) || readFileSync(gitignore, 'utf8') !== wanted) {
    writeFileSync(gitignore, wanted, 'utf8');
  }
}

export function outputPath(name: string): string {
  return join(OUT_DIR, name);
}

export function writeText(name: string, content: string): string {
  ensureOutDir();
  const path = outputPath(name);
  writeFileSync(path, content, 'utf8');
  return path;
}

export function writeBytes(name: string, content: Uint8Array): string {
  ensureOutDir();
  const path = outputPath(name);
  writeFileSync(path, content);
  return path;
}

export function readJson<T>(name: string, fallback: T): T {
  const path = outputPath(name);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(name: string, value: unknown): string {
  return writeText(name, `${JSON.stringify(value, null, 2)}\n`);
}

export function openFile(path: string): void {
  const command = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    const child = spawn(command, [path], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // Opening the file is a convenience; never fail the run over it.
  }
}
