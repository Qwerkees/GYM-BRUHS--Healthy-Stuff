'use strict';

// Storage layer with two interchangeable backends:
//   - SQLite (better-sqlite3): local dev, tests, single-box deploys. Default.
//   - Postgres (pg): hosted deploys (Vercel + Neon). Chosen when DATABASE_URL is set.
// Both expose the same small async API so src/app.js never knows which is in use.

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_LOCATIONS = [
  { slug: 'front-counter', name: 'Front Counter', kind: 'counter' },
  { slug: 'cooler-1', name: 'Cooler 1 — Weight Room', kind: 'cooler' },
  { slug: 'cooler-2', name: 'Cooler 2 — Cardio Floor', kind: 'cooler' },
];

const ORDER_COLS = 'code, location_slug, customer_name, phone, lang, items_json, subtotal_cents, tax_cents, total_cents, payment_method, status';

// ---------------------------------------------------------------- SQLite

function openSqlite(file) {
  const Database = require('better-sqlite3');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'counter', active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, location_slug TEXT NOT NULL,
      customer_name TEXT NOT NULL, phone TEXT, lang TEXT NOT NULL DEFAULT 'en', items_json TEXT NOT NULL,
      subtotal_cents INTEGER NOT NULL, tax_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL,
      payment_method TEXT NOT NULL, status TEXT NOT NULL, stripe_session TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status, created_at);
    CREATE TABLE IF NOT EXISTS staff_sessions (
      token TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), expires_at TEXT NOT NULL);
  `);
  const ins = db.prepare('INSERT OR IGNORE INTO locations (slug, name, kind) VALUES (?, ?, ?)');
  for (const l of DEFAULT_LOCATIONS) ins.run(l.slug, l.name, l.kind);

  const s = {
    locations: db.prepare('SELECT slug, name, kind FROM locations WHERE active = 1 ORDER BY id'),
    location: db.prepare('SELECT slug, name, kind FROM locations WHERE slug = ? AND active = 1'),
    insertOrder: db.prepare(`INSERT INTO orders (${ORDER_COLS}) VALUES (@code, @location_slug, @customer_name, @phone, @lang, @items_json, @subtotal_cents, @tax_cents, @total_cents, @payment_method, @status)`),
    order: db.prepare('SELECT * FROM orders WHERE code = ?'),
    setStatus: db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE code = ?'),
    setStripe: db.prepare('UPDATE orders SET stripe_session = ?, updated_at = ? WHERE code = ?'),
    recent: db.prepare('SELECT * FROM orders WHERE created_at >= ? ORDER BY created_at DESC LIMIT 300'),
    insertSession: db.prepare('INSERT INTO staff_sessions (token, expires_at) VALUES (?, ?)'),
    session: db.prepare('SELECT token FROM staff_sessions WHERE token = ? AND expires_at > ?'),
    deleteSession: db.prepare('DELETE FROM staff_sessions WHERE token = ?'),
    purgeSessions: db.prepare('DELETE FROM staff_sessions WHERE expires_at <= ?'),
  };
  return {
    kind: 'sqlite',
    ensureReady: () => Promise.resolve(),
    async locations() { return s.locations.all(); },
    async location(slug) { return s.location.get(slug) || null; },
    async insertOrder(row) { s.insertOrder.run(row); },
    async order(code) { return s.order.get(code) || null; },
    async setStatus(status, now, code) { s.setStatus.run(status, now, code); },
    async setStripe(sid, now, code) { s.setStripe.run(sid, now, code); },
    async recent(since) { return s.recent.all(since); },
    async insertSession(token, expires) { s.insertSession.run(token, expires); },
    async session(token, now) { return s.session.get(token, now) || null; },
    async deleteSession(token) { s.deleteSession.run(token); },
    async purgeSessions(now) { s.purgeSessions.run(now); },
    async close() { db.close(); },
  };
}

// -------------------------------------------------------------- Postgres

function openPostgres(url, schema) {
  const { Pool } = require('pg');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // Hosted providers (Neon etc.) present publicly-trusted certs, so full verification is kept.
  const pool = new Pool({ connectionString: url, max: 5, ssl: local ? false : (/sslmode=/.test(url) ? undefined : { rejectUnauthorized: true }) });
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('PG_SCHEMA must be a simple identifier');
  // Fully-qualified table names: no per-connection SET search_path, which is both
  // pooler-unfriendly and raced with other queries on the same client.
  const T = { locations: `${schema}.locations`, orders: `${schema}.orders`, sessions: `${schema}.staff_sessions` };

  async function initSchema() {
    const c = await pool.connect();
    try {
      await c.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await c.query(`
        CREATE TABLE IF NOT EXISTS ${T.locations} (
          id SERIAL PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'counter', active BOOLEAN NOT NULL DEFAULT TRUE);
        CREATE TABLE IF NOT EXISTS ${T.orders} (
          id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, location_slug TEXT NOT NULL,
          customer_name TEXT NOT NULL, phone TEXT, lang TEXT NOT NULL DEFAULT 'en', items_json TEXT NOT NULL,
          subtotal_cents INTEGER NOT NULL, tax_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL,
          payment_method TEXT NOT NULL, status TEXT NOT NULL, stripe_session TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
        CREATE INDEX IF NOT EXISTS orders_status_idx ON ${T.orders}(status, created_at);
        CREATE TABLE IF NOT EXISTS ${T.sessions} (
          token TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL);
      `);
      for (const l of DEFAULT_LOCATIONS) {
        await c.query(`INSERT INTO ${T.locations} (slug, name, kind) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING`, [l.slug, l.name, l.kind]);
      }
    } finally { c.release(); }
  }

  // Memoised, but a failure (e.g. a dropped TLS handshake on a cold start) is NOT cached:
  // the next request retries instead of leaving this instance permanently broken.
  let readyPromise = null;
  function ensureReady() {
    if (!readyPromise) {
      readyPromise = (async () => {
        let lastErr;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try { await initSchema(); return; }
          catch (err) { lastErr = err; await new Promise(r => setTimeout(r, 150 * attempt)); }
        }
        throw lastErr;
      })().catch(err => { readyPromise = null; throw err; });
    }
    return readyPromise;
  }

  // Normalise timestamps to the same ISO strings SQLite produces.
  const iso = (v) => (v instanceof Date ? v.toISOString() : v);
  const rowOut = (r) => (r ? { ...r, created_at: iso(r.created_at), updated_at: iso(r.updated_at) } : null);
  const one = async (sql, params) => rowOut((await pool.query(sql, params)).rows[0]);
  const all = async (sql, params) => (await pool.query(sql, params)).rows.map(rowOut);

  return {
    kind: 'postgres',
    ensureReady,
    locations: () => all(`SELECT slug, name, kind FROM ${T.locations} WHERE active ORDER BY id`),
    location: (slug) => one(`SELECT slug, name, kind FROM ${T.locations} WHERE slug = $1 AND active`, [slug]),
    async insertOrder(r) {
      await pool.query(`INSERT INTO ${T.orders} (${ORDER_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [r.code, r.location_slug, r.customer_name, r.phone, r.lang, r.items_json, r.subtotal_cents, r.tax_cents, r.total_cents, r.payment_method, r.status]);
    },
    order: (code) => one(`SELECT * FROM ${T.orders} WHERE code = $1`, [code]),
    async setStatus(status, now, code) { await pool.query(`UPDATE ${T.orders} SET status = $1, updated_at = $2 WHERE code = $3`, [status, now, code]); },
    async setStripe(sid, now, code) { await pool.query(`UPDATE ${T.orders} SET stripe_session = $1, updated_at = $2 WHERE code = $3`, [sid, now, code]); },
    recent: (since) => all(`SELECT * FROM ${T.orders} WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 300`, [since]),
    async insertSession(token, expires) { await pool.query(`INSERT INTO ${T.sessions} (token, expires_at) VALUES ($1, $2)`, [token, expires]); },
    session: (token, now) => one(`SELECT token FROM ${T.sessions} WHERE token = $1 AND expires_at > $2`, [token, now]),
    async deleteSession(token) { await pool.query(`DELETE FROM ${T.sessions} WHERE token = $1`, [token]); },
    async purgeSessions(now) { await pool.query(`DELETE FROM ${T.sessions} WHERE expires_at <= $1`, [now]); },
    async close() { await pool.end(); },
  };
}

function openDb({ databaseUrl, sqliteFile, pgSchema = 'gym_bruhs' }) {
  if (databaseUrl) return openPostgres(databaseUrl, pgSchema);
  return openSqlite(sqliteFile);
}

module.exports = { openDb, DEFAULT_LOCATIONS };
