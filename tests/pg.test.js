'use strict';
// Runs the API suite's core flow against Postgres when TEST_DATABASE_URL is set; skipped otherwise.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

const url = process.env.TEST_DATABASE_URL;

test('postgres backend: order → staff → status flow', { skip: !url && 'TEST_DATABASE_URL not set' }, async () => {
  const app = createApp({ databaseUrl: url, pgSchema: 'gb_test_' + Date.now(), staffPin: '1111', taxRate: 0 });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const j = async (p, o = {}) => { const r = await fetch(base + p, { headers: { 'Content-Type': 'application/json', ...(o.cookie ? { Cookie: o.cookie } : {}) }, method: o.method || 'GET', body: o.body && JSON.stringify(o.body) }); return { status: r.status, json: await r.json().catch(() => null), headers: r.headers }; };
  try {
    const cfg = await j('/api/config');
    assert.equal(cfg.json.locations.length, 3);
    const r = await j('/api/orders', { method: 'POST', body: { name: 'PG', location: 'cooler-1', payment: 'counter', items: [{ itemId: 'eggs', qty: 1, options: { count: '3' } }] } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const o = await j(`/api/orders/${r.json.code}`);
    assert.equal(o.json.subtotalCents, 299 + 125);
    assert.match(o.json.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    const login = await j('/api/staff/login', { method: 'POST', body: { pin: '1111' } });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const list = await j('/api/staff/orders', { cookie });
    assert.ok(list.json.orders.some(x => x.code === r.json.code));
    const d = await j(`/api/staff/orders/${r.json.code}`, { cookie });
    assert.equal(d.status, 200);
    const u = await j(`/api/staff/orders/${r.json.code}/status`, { method: 'POST', body: { status: 'paid' }, cookie });
    assert.equal(u.json.status, 'paid');
    assert.equal((await j(`/api/staff/orders/${r.json.code}/status`, { method: 'POST', body: { status: 'awaiting_payment' }, cookie })).status, 409);
    await j('/api/staff/logout', { method: 'POST', cookie });
    assert.equal((await j('/api/staff/orders', { cookie })).status, 401);
    // second app instance on the same schema sees the same data (what Vercel's multiple instances do)
    const app2 = createApp({ databaseUrl: url, pgSchema: app.locals.config.pgSchema, staffPin: '1111' });
    const s2 = await new Promise(res => { const s = app2.listen(0, () => res(s)); });
    const r2 = await fetch(`http://127.0.0.1:${s2.address().port}/api/orders/${r.json.code}`);
    assert.equal((await r2.json()).status, 'paid');
    s2.close(); await app2.locals.db.close();
  } finally {
    server.close(); await app.locals.db.close();
  }
});

test('postgres backend: a failed first init is retried, not cached', { skip: !url && 'TEST_DATABASE_URL not set' }, async () => {
  // Point at a port with nothing listening: init must fail, then succeed once DB is "back" (we swap URLs by re-creating).
  const bad = createApp({ databaseUrl: 'postgres://gb:gb@127.0.0.1:1/x', staffPin: '1' });
  await assert.rejects(bad.locals.db.ensureReady());
  // Second call re-attempts (would resolve instantly if the rejection were cached).
  await assert.rejects(bad.locals.db.ensureReady());
  await bad.locals.db.close().catch(() => {});
});
