import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { decryptString, encryptString } from "@/lib/crypto";
import { parseLimitMinutes } from "@/lib/limits";
import { IMAGE_KEY } from "@/lib/types";
import type {
  Account,
  AppSettings,
  Category,
  CategoryKind,
  RssFeed,
  SocialProviderId,
} from "@/lib/types";

type AccountRow = {
  id: string;
  provider: SocialProviderId;
  external_id: string;
  display_name: string;
  handle: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: number | null;
  instance_url: string | null;
  created_at: number;
};

type FeedRow = {
  id: string;
  category_id: string;
  url: string;
  title: string;
};

type CategoryRow = {
  id: string;
  name: string;
  kind: CategoryKind;
  created_at: number;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  handle TEXT NOT NULL,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_expires_at INTEGER,
  instance_url TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(provider, external_id)
);

CREATE TABLE IF NOT EXISTS oauth_pending (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code_verifier TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feeds (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_limits (
  source_key TEXT PRIMARY KEY,
  limit_minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  source_label TEXT NOT NULL,
  provider TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  elapsed_seconds INTEGER NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS atproto_state (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS atproto_session (
  did TEXT PRIMARY KEY,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mastodon_apps (
  instance_url TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS usage_samples_recorded_at ON usage_samples(recorded_at);
`;

const globalDb = globalThis as unknown as { smolfeedDb?: Database.Database };

export function getDb(): Database.Database {
  if (globalDb.smolfeedDb) return globalDb.smolfeedDb;
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "smolfeed.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  globalDb.smolfeedDb = db;
  return db;
}

function decryptMaybe(value: string | null): string | null {
  if (!value) return null;
  return decryptString(value);
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    displayName: row.display_name,
    handle: row.handle,
    accessToken: decryptMaybe(row.access_token_enc),
    refreshToken: decryptMaybe(row.refresh_token_enc),
    tokenExpiresAt: row.token_expires_at,
    instanceUrl: row.instance_url,
    createdAt: row.created_at,
  };
}

export type TokenUpdate = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
};

export type AccountInput = {
  provider: SocialProviderId;
  externalId: string;
  displayName: string;
  handle: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  instanceUrl: string | null;
};

export function listAccounts(): Account[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM accounts ORDER BY created_at ASC`,
    )
    .all() as AccountRow[];
  return rows.map(mapAccount);
}

export function getAccount(id: string): Account | null {
  const row = getDb()
    .prepare(`SELECT * FROM accounts WHERE id = ?`)
    .get(id) as AccountRow | undefined;
  return row ? mapAccount(row) : null;
}

export function upsertAccount(input: AccountInput): Account {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM accounts WHERE provider = ? AND external_id = ?`,
    )
    .get(input.provider, input.externalId) as { id: string } | undefined;
  const access = input.accessToken ? encryptString(input.accessToken) : null;
  const refresh = input.refreshToken ? encryptString(input.refreshToken) : null;
  if (existing) {
    db.prepare(
      `UPDATE accounts
       SET display_name = ?, handle = ?, access_token_enc = ?, refresh_token_enc = ?,
           token_expires_at = ?, instance_url = ?
       WHERE id = ?`,
    ).run(
      input.displayName,
      input.handle,
      access,
      refresh,
      input.expiresAt,
      input.instanceUrl,
      existing.id,
    );
    const updated = getAccount(existing.id);
    if (!updated) throw new Error("Account disappeared during update");
    return updated;
  }
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO accounts (
      id, provider, external_id, display_name, handle, access_token_enc,
      refresh_token_enc, token_expires_at, instance_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.provider,
    input.externalId,
    input.displayName,
    input.handle,
    access,
    refresh,
    input.expiresAt,
    input.instanceUrl,
    Date.now(),
  );
  const created = getAccount(id);
  if (!created) throw new Error("Account disappeared during insert");
  return created;
}

export function updateAccountTokens(id: string, tokens: TokenUpdate): Account {
  getDb()
    .prepare(
      `UPDATE accounts
       SET access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ?
       WHERE id = ?`,
    )
    .run(
      encryptString(tokens.accessToken),
      tokens.refreshToken ? encryptString(tokens.refreshToken) : null,
      tokens.expiresAt,
      id,
    );
  const updated = getAccount(id);
  if (!updated) throw new Error("Account disappeared during token update");
  return updated;
}

export function deleteAccount(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM source_limits WHERE source_key = ?`).run(
    `account:${id}`,
  );
  db.prepare(`DELETE FROM accounts WHERE id = ?`).run(id);
}

export type PendingAuth = {
  state: string;
  provider: string;
  codeVerifier: string | null;
  payload: Record<string, string>;
};

export function createPending(input: {
  provider: string;
  codeVerifier?: string | null;
  payload?: Record<string, string>;
}): string {
  const db = getDb();
  const cutoff = Date.now() - 15 * 60 * 1000;
  db.prepare(`DELETE FROM oauth_pending WHERE created_at < ?`).run(cutoff);
  const state = crypto.randomUUID();
  db.prepare(
    `INSERT INTO oauth_pending (state, provider, code_verifier, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    state,
    input.provider,
    input.codeVerifier ?? null,
    JSON.stringify(input.payload ?? {}),
    Date.now(),
  );
  return state;
}

export function takePending(
  state: string,
  provider: string,
): PendingAuth | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT state, provider, code_verifier, payload_json, created_at
       FROM oauth_pending WHERE state = ? AND provider = ?`,
    )
    .get(state, provider) as
    | {
        state: string;
        provider: string;
        code_verifier: string | null;
        payload_json: string;
        created_at: number;
      }
    | undefined;
  if (!row) return null;
  db.prepare(`DELETE FROM oauth_pending WHERE state = ?`).run(state);
  if (Date.now() - row.created_at > 15 * 60 * 1000) return null;
  const payload = JSON.parse(row.payload_json) as Record<string, string>;
  return {
    state: row.state,
    provider: row.provider,
    codeVerifier: row.code_verifier,
    payload,
  };
}

export function listCategories(): Category[] {
  const db = getDb();
  const categories = db
    .prepare(`SELECT * FROM categories ORDER BY created_at ASC`)
    .all() as CategoryRow[];
  const feeds = db
    .prepare(`SELECT * FROM feeds ORDER BY rowid ASC`)
    .all() as FeedRow[];
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    kind: category.kind,
    feeds: feeds
      .filter((feed) => feed.category_id === category.id)
      .map((feed) => ({
        id: feed.id,
        categoryId: feed.category_id,
        url: feed.url,
        title: feed.title,
      })),
  }));
}

export function createCategory(input: {
  name: string;
  kind: CategoryKind;
  feeds: { url: string; title: string }[];
}): Category {
  const db = getDb();
  const id = crypto.randomUUID();
  const insertFeed = db.prepare(
    `INSERT INTO feeds (id, category_id, url, title) VALUES (?, ?, ?, ?)`,
  );
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO categories (id, name, kind, created_at) VALUES (?, ?, ?, ?)`,
    ).run(id, input.name, input.kind, Date.now());
    for (const feed of input.feeds) {
      insertFeed.run(crypto.randomUUID(), id, feed.url, feed.title);
    }
  });
  write();
  const created = listCategories().find((category) => category.id === id);
  if (!created) throw new Error("Category disappeared during insert");
  return created;
}

export function deleteCategory(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM source_limits WHERE source_key = ?`).run(
    `category:${id}`,
  );
  db.prepare(`DELETE FROM feeds WHERE category_id = ?`).run(id);
  db.prepare(`DELETE FROM categories WHERE id = ?`).run(id);
}

export function getSettings(): AppSettings {
  const db = getDb();
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const limits = db
    .prepare(`SELECT source_key, limit_minutes FROM source_limits`)
    .all() as { source_key: string; limit_minutes: number }[];
  const sourceLimits: Record<string, number> = {};
  for (const limit of limits) {
    if (limit.limit_minutes > 0) {
      sourceLimits[limit.source_key] = limit.limit_minutes;
    }
  }
  return {
    sessionLimitMinutes: parseLimitMinutes(map.get("session_limit_minutes")),
    deterEnabled: map.get("deter_enabled") === "1",
    sourceLimits,
    imageSources: parseImageSources(map.get("image_sources")),
  };
}

const parseImageSources = (raw: string | undefined): string[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (key): key is string => typeof key === "string" && IMAGE_KEY.test(key),
    );
  } catch {
    return [];
  }
};

export function saveSettings(patch: {
  sessionLimitMinutes?: number | null;
  deterEnabled?: boolean;
  sourceLimits?: { sourceKey: string; limitMinutes: number | null }[];
  imageSources?: string[];
}): AppSettings {
  const db = getDb();
  const write = db.transaction(() => {
    if (patch.sessionLimitMinutes !== undefined) {
      if (patch.sessionLimitMinutes == null) {
        db.prepare(`DELETE FROM settings WHERE key = ?`).run(
          "session_limit_minutes",
        );
      } else {
        db.prepare(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ).run("session_limit_minutes", String(patch.sessionLimitMinutes));
      }
    }
    if (patch.deterEnabled !== undefined) {
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run("deter_enabled", patch.deterEnabled ? "1" : "0");
    }
    if (patch.imageSources) {
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run("image_sources", JSON.stringify([...new Set(patch.imageSources)]));
    }
    if (patch.sourceLimits) {
      const upsert = db.prepare(
        `INSERT INTO source_limits (source_key, limit_minutes) VALUES (?, ?)
         ON CONFLICT(source_key) DO UPDATE SET limit_minutes = excluded.limit_minutes`,
      );
      const remove = db.prepare(
        `DELETE FROM source_limits WHERE source_key = ?`,
      );
      for (const limit of patch.sourceLimits) {
        if (limit.limitMinutes == null || limit.limitMinutes <= 0) {
          remove.run(limit.sourceKey);
        } else {
          upsert.run(limit.sourceKey, limit.limitMinutes);
        }
      }
    }
  });
  write();
  return getSettings();
}

export type UsageSampleInput = {
  sourceKey: string;
  sourceLabel: string;
  provider: string;
  seconds: number;
};

export function recordUsage(input: {
  sessionId: string;
  startedAt: number;
  elapsedSeconds: number;
  paused: boolean;
  samples: UsageSampleInput[];
}): void {
  const db = getDb();
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO sessions (id, started_at, elapsed_seconds, paused)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         elapsed_seconds = excluded.elapsed_seconds,
         paused = excluded.paused`,
    ).run(
      input.sessionId,
      input.startedAt,
      input.elapsedSeconds,
      input.paused ? 1 : 0,
    );
    const insert = db.prepare(
      `INSERT INTO usage_samples (source_key, source_label, provider, seconds, recorded_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    for (const sample of input.samples) {
      if (sample.seconds <= 0) continue;
      insert.run(
        sample.sourceKey,
        sample.sourceLabel,
        sample.provider,
        sample.seconds,
        now,
      );
    }
  });
  write();
}

export type DayUsageRow = {
  day: string;
  sourceKey: string;
  sourceLabel: string;
  provider: string;
  seconds: number;
};

export function usageSince(sinceMs: number): DayUsageRow[] {
  return getDb()
    .prepare(
      `SELECT date(recorded_at / 1000, 'unixepoch', 'localtime') AS day,
              source_key AS sourceKey,
              source_label AS sourceLabel,
              provider,
              SUM(seconds) AS seconds
       FROM usage_samples
       WHERE recorded_at >= ?
       GROUP BY day, source_key`,
    )
    .all(sinceMs) as DayUsageRow[];
}

export function sessionPeaksSince(sinceMs: number): number[] {
  const rows = getDb()
    .prepare(
      `SELECT elapsed_seconds AS elapsed FROM sessions WHERE started_at >= ?`,
    )
    .all(sinceMs) as { elapsed: number }[];
  return rows.map((row) => row.elapsed);
}

export function getMastodonApp(instanceUrl: string): {
  clientId: string;
  clientSecret: string;
} | null {
  const row = getDb()
    .prepare(
      `SELECT client_id, client_secret FROM mastodon_apps WHERE instance_url = ?`,
    )
    .get(instanceUrl) as
    | { client_id: string; client_secret: string }
    | undefined;
  if (!row) return null;
  return { clientId: row.client_id, clientSecret: row.client_secret };
}

export function saveMastodonApp(input: {
  instanceUrl: string;
  clientId: string;
  clientSecret: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO mastodon_apps (instance_url, client_id, client_secret)
       VALUES (?, ?, ?)
       ON CONFLICT(instance_url) DO UPDATE SET
         client_id = excluded.client_id,
         client_secret = excluded.client_secret`,
    )
    .run(input.instanceUrl, input.clientId, input.clientSecret);
}

export function readAtprotoState(key: string): string | null {
  const row = getDb()
    .prepare(`SELECT json FROM atproto_state WHERE key = ?`)
    .get(key) as { json: string } | undefined;
  return row ? decryptString(row.json) : null;
}

export function writeAtprotoState(key: string, json: string): void {
  getDb()
    .prepare(
      `INSERT INTO atproto_state (key, json) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET json = excluded.json`,
    )
    .run(key, encryptString(json));
}

export function deleteAtprotoState(key: string): void {
  getDb().prepare(`DELETE FROM atproto_state WHERE key = ?`).run(key);
}

export function readAtprotoSession(did: string): string | null {
  const row = getDb()
    .prepare(`SELECT json FROM atproto_session WHERE did = ?`)
    .get(did) as { json: string } | undefined;
  return row ? decryptString(row.json) : null;
}

export function writeAtprotoSession(did: string, json: string): void {
  getDb()
    .prepare(
      `INSERT INTO atproto_session (did, json) VALUES (?, ?)
       ON CONFLICT(did) DO UPDATE SET json = excluded.json`,
    )
    .run(did, encryptString(json));
}

export function deleteAtprotoSession(did: string): void {
  getDb().prepare(`DELETE FROM atproto_session WHERE did = ?`).run(did);
}

export type { RssFeed };
