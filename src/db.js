'use strict';

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS locations (
  id    INTEGER PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL,
  kind  TEXT NOT NULL DEFAULT 'counter',   -- 'counter' | 'cooler'
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,         -- short pickup code, printed in the QR
  location_slug   TEXT NOT NULL,
  customer_name   TEXT NOT NULL,
  phone           TEXT,
  lang            TEXT NOT NULL DEFAULT 'en',
  items_json      TEXT NOT NULL,
  subtotal_cents  INTEGER NOT NULL,
  tax_cents       INTEGER NOT NULL,
  total_cents     INTEGER NOT NULL,
  payment_method  TEXT NOT NULL,                -- 'card' | 'counter'
  status          TEXT NOT NULL,                -- awaiting_payment | paid | ready | picked_up | cancelled
  stripe_session  TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS staff_sessions (
  token       TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT NOT NULL
);
`;

const DEFAULT_LOCATIONS = [
  { slug: 'front-counter', name: 'Front Counter', kind: 'counter' },
  { slug: 'cooler-1', name: 'Cooler 1 — Weight Room', kind: 'cooler' },
  { slug: 'cooler-2', name: 'Cooler 2 — Cardio Floor', kind: 'cooler' },
];

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  const insert = db.prepare('INSERT OR IGNORE INTO locations (slug, name, kind) VALUES (?, ?, ?)');
  for (const l of DEFAULT_LOCATIONS) insert.run(l.slug, l.name, l.kind);
  return db;
}

module.exports = { openDb };
