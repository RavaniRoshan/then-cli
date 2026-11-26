import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const fixtureProfileDir = join(here, 'profile', 'Default');

/** Build a tiny Chrome-like History database. Never touches a real profile. */
export function createFixtureHistory() {
  mkdirSync(fixtureProfileDir, { recursive: true });
  const db = new DatabaseSync(join(fixtureProfileDir, 'History'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT,
      visit_count INTEGER DEFAULT 0,
      typed_count INTEGER DEFAULT 0,
      last_visit_time INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY,
      url INTEGER NOT NULL,
      visit_time INTEGER NOT NULL,
      from_visit INTEGER DEFAULT 0,
      transition INTEGER DEFAULT 0,
      segment_id INTEGER DEFAULT 0,
      visit_duration INTEGER DEFAULT 0
    );
    DELETE FROM urls;
    DELETE FROM visits;
  `);

  const urls = [
    [1, 'https://github.com/alpha/', 'Alpha project', 2, 13439606400000000],
    [2, 'https://news.example.org/story', 'A story', 1, 13439606400000000],
    [3, 'https://today.example.net/post', 'Recent', 1, 13440038400000000],
    [4, 'https://old.example.com/kept', 'Window start', 1, 13432348800000000],
  ];
  const insertUrl = db.prepare(
    'INSERT INTO urls (id, url, title, visit_count, last_visit_time) VALUES (?, ?, ?, ?, ?)',
  );
  for (const row of urls) insertUrl.run(...row);

  const insertVisit = db.prepare('INSERT INTO visits (id, url, visit_time) VALUES (?, ?, ?)');
  insertVisit.run(1, 1, 13432348800000000);
  insertVisit.run(2, 1, 13439606400000000);
  insertVisit.run(3, 2, 13439606400000000);
  insertVisit.run(4, 3, 13440038400000000);
  insertVisit.run(5, 4, 13432348800000000);
  db.close();
  return fixtureProfileDir;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createFixtureHistory();
  process.stdout.write(`Fixture history written to ${fixtureProfileDir}\n`);
}
