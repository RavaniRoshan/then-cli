export type Bookmark = {
  url: string;
  title: string;
  folder: string[];
  addedAt: string;
  browser: string;
  profile: string;
};

export type Visit = {
  url: string;
  lastVisitAt: string | null;
  visitCount: number;
};

export type LinkState = 'alive' | 'dead' | 'redirected' | 'blocked' | 'unchecked';

export type Status = {
  url: string;
  state: LinkState;
  http?: number;
  finalUrl?: string;
  checkedAt?: string;
};

export type Snapshot = {
  url: string;
  available: boolean;
  snapshotUrl?: string;
  snapshotAt?: string;
};

export type Row = Bookmark & {
  visit: Visit;
  status: Status;
  snapshot?: Snapshot;
  duplicateCount: number;
};

export type HistoryWindow = {
  start: string | null;
  end: string | null;
  available: boolean;
};

export type YearStats = {
  year: number;
  count: number;
  dead: number;
  topDomains: Array<{ domain: string; count: number }>;
};

export type Stats = {
  total: number;
  dead: number;
  blocked: number;
  unchecked: number;
  notOpenedRecently: number;
  neverOpened: number;
  years: YearStats[];
  earliestYear: number | null;
  latestYear: number | null;
  topDeadDomains: Array<{ domain: string; count: number }>;
};

export type ProfileInfo = {
  browser: string;
  name: string;
  dir: string;
  bookmarksPath: string;
  historyPath: string;
};

export type Options = {
  profile?: string;
  year?: number;
  noCheck: boolean;
  redact: boolean;
  command: 'report' | 'card' | 'rescue';
  rescueWrite: boolean;
  rescueDryRun: boolean;
};

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export class SchemaError extends UserError {
  constructor(filePath: string, detail: string) {
    super(`Cannot read bookmarks at ${filePath}: ${detail}`);
    this.name = 'SchemaError';
  }
}
