import "server-only";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import catalog from "@/data/catalog.json";

/**
 * Single SQLite connection (Node's built-in driver). Migrations in
 * db/migrations run once, in filename order; the starter catalog is upserted
 * from src/data/catalog.json on boot.
 */

const DATA_DIR = process.env.SAPOR_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = process.env.SAPOR_DB ?? path.join(DATA_DIR, "sapor.db");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const CATALOG_SEEDED_AT = "2026-10-18T00:00:00.000Z";

const g = globalThis as unknown as { __saporDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!g.__saporDb) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const conn = new DatabaseSync(DB_PATH);
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    migrate(conn);
    seedCatalog(conn);
    g.__saporDb = conn;
  }
  return g.__saporDb;
}

function migrate(conn: DatabaseSync) {
  conn.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const dir = path.join(process.cwd(), "db", "migrations");
  const applied = new Set((conn.prepare("SELECT name FROM schema_migrations").all() as { name: string }[]).map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    tx(conn, () => {
      conn.exec(readFileSync(path.join(dir, file), "utf8"));
      conn.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
    });
  }
}

function seedCatalog(conn: DatabaseSync) {
  const r = catalog.retailer;
  tx(conn, () => {
    conn.prepare("INSERT INTO retailers (id, name, slug) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING").run(r.id, r.name, r.slug);
    const upsert = conn.prepare(`
      INSERT INTO products (id, retailer_id, name, slug, category, description, emoji, photo_url, photo_credit, photo_license,
                            photo_source, instagram_url, availability, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (retailer_id, slug) DO UPDATE SET
        name = excluded.name, category = excluded.category, description = excluded.description, emoji = excluded.emoji,
        photo_url = excluded.photo_url, photo_credit = excluded.photo_credit, photo_license = excluded.photo_license,
        photo_source = excluded.photo_source, instagram_url = excluded.instagram_url, availability = excluded.availability`);
    for (const p of catalog.products as (typeof catalog.products[number] & {
      photo?: { url: string; credit: string; license: string; source: string };
      instagramUrl?: string;
    })[]) {
      upsert.run(
        `p-${p.slug}`, r.id, p.name, p.slug, p.category, p.description, p.emoji ?? null,
        p.photo?.url ?? null, p.photo?.credit ?? null, p.photo?.license ?? null, p.photo?.source ?? null,
        p.instagramUrl ?? null, p.availability, CATALOG_SEEDED_AT, CATALOG_SEEDED_AT,
      );
    }
  });
}

/** Run fn in a transaction (all-or-nothing). Nested calls join the outer one. */
let depth = 0;
export function tx<T>(conn: DatabaseSync, fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  conn.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  } finally {
    depth--;
  }
}

export const transaction = <T>(fn: () => T) => tx(db(), fn);
export const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();
