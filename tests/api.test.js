'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { priceLine, ITEMS } = require('../src/menu');

let server, base;
const PIN = '4321';

// A fake Stripe client so the card path is exercised without network or keys.
const fakeStripe = {
  sessions: new Map(),
  checkout: {
    sessions: {
      create: async (params) => {
        const id = `cs_test_${Math.random().toString(36).slice(2)}`;
        fakeStripe.sessions.set(id, { id, payment_status: 'unpaid', metadata: params.metadata, params });
        return { id, url: `https://checkout.stripe.com/pay/${id}` };
      },
      retrieve: async (id) => {
        const s = fakeStripe.sessions.get(id);
        if (!s) throw new Error('No such session');
        return s;
      },
    },
  },
  webhooks: { constructEvent: () => { throw new Error('not used'); } },
};

async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}

before(async () => {
  const app = createApp({ dbFile: ':memory:', staffPin: PIN, taxRate: 0.08, baseUrl: 'https://gym.test', stripeClient: fakeStripe });
  await new Promise(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('health and config', async () => {
  const h = await api('/api/healthz');
  assert.equal(h.status, 200); assert.equal(h.json.ok, true);
  const c = await api('/api/config');
  assert.equal(c.json.cardEnabled, true);
  assert.equal(c.json.taxRate, 0.08);
  assert.ok(c.json.locations.some(l => l.slug === 'front-counter'));
});

test('menu: every item has macros, a price, and valid swaps/options', async () => {
  const { json } = await api('/api/menu');
  assert.ok(json.items.length >= 15);
  const ids = new Set(json.items.map(i => i.id));
  for (const i of json.items) {
    for (const k of ['kcal', 'protein', 'carbs', 'sugar', 'fat']) assert.equal(typeof i[k], 'number', `${i.id}.${k}`);
    assert.ok(i.price > 0);
    assert.ok(i.en && i.es && i.desc_en && i.desc_es);
    if (i.swap) assert.ok(ids.has(i.swap.to), `${i.id} swap target exists`);
    for (const g of i.options) {
      assert.ok(g.choices.length >= 2, `${i.id}.${g.id} has choices`);
      assert.equal(new Set(g.choices.map(c => c.id)).size, g.choices.length, `${i.id}.${g.id} unique choice ids`);
    }
  }
});

test('priceLine computes server-side prices from options', () => {
  const l = priceLine({ itemId: 'shake-choc', qty: 2, options: { size: 'l', protein: 'plant', addons: ['pb', 'chia'] } });
  assert.equal(l.unitCents, 699 + 250 + 0 + 100 + 75);
  assert.equal(l.lineCents, l.unitCents * 2);
  const d = priceLine({ itemId: 'apple-pb', qty: 1, options: { butter: 'none' } });
  assert.equal(d.unitCents, 399 - 150);
  assert.throws(() => priceLine({ itemId: 'nope', qty: 1 }), /Unknown item/);
  assert.throws(() => priceLine({ itemId: 'shake-choc', qty: 0 }), /quantity/);
  assert.throws(() => priceLine({ itemId: 'shake-choc', qty: 1, options: { size: 'xxl' } }), /Bad size/);
  assert.throws(() => priceLine({ itemId: 'shake-choc', qty: 1, options: { addons: ['gold'] } }), /add-on/);
  // defaults apply when options are omitted
  assert.equal(priceLine({ itemId: 'yogurt', qty: 1 }).unitCents, 399);
});

test('order validation rejects bad input', async () => {
  const good = { name: 'Sal', location: 'front-counter', payment: 'counter', items: [{ itemId: 'almonds', qty: 1, options: { style: 'raw' } }] };
  assert.equal((await api('/api/orders', { method: 'POST', body: { ...good, name: '' } })).status, 400);
  assert.equal((await api('/api/orders', { method: 'POST', body: { ...good, items: [] } })).status, 400);
  assert.equal((await api('/api/orders', { method: 'POST', body: { ...good, location: 'moon' } })).status, 400);
  assert.equal((await api('/api/orders', { method: 'POST', body: { ...good, payment: 'crypto' } })).status, 400);
  assert.equal((await api('/api/orders', { method: 'POST', body: { ...good, phone: '12' } })).status, 400);
  assert.equal((await api('/api/orders', { method: 'POST', body: { ...good, items: [{ itemId: 'almonds', qty: 1, options: { style: 'gold' } }] } })).status, 400);
  // client-supplied prices are ignored, not trusted
  const r = await api('/api/orders', { method: 'POST', body: { ...good, items: [{ itemId: 'almonds', qty: 1, options: { style: 'raw' }, unitCents: 1 }] } });
  assert.equal(r.status, 201);
  const o = (await api(`/api/orders/${r.json.code}`)).json;
  assert.equal(o.subtotalCents, 249);
});

test('pay-at-counter order: totals, tax, QR, staff flow', async () => {
  const r = await api('/api/orders', {
    method: 'POST',
    body: { name: 'Luke', phone: '(480) 555-0101', location: 'cooler-1', payment: 'counter', lang: 'es',
      items: [{ itemId: 'shake-berry', qty: 1, options: { size: 'm', protein: 'whey', addons: ['creatine'] } }, { itemId: 'water', qty: 2, options: { kind: 'sparkling' } }] },
  });
  assert.equal(r.status, 201, r.text);
  const { code, orderUrl, checkoutUrl } = r.json;
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(orderUrl, `https://gym.test/order/${code}`);
  assert.equal(checkoutUrl, null);

  const o = (await api(`/api/orders/${code}`)).json;
  const sub = (699 + 150 + 100) + 2 * (149 + 50);
  assert.equal(o.subtotalCents, sub);
  assert.equal(o.taxCents, Math.round(sub * 0.08));
  assert.equal(o.totalCents, sub + Math.round(sub * 0.08));
  assert.equal(o.status, 'awaiting_payment');
  assert.equal(o.lang, 'es');
  assert.equal(o.phone, undefined, 'phone is not exposed publicly');

  const qr = await fetch(`${base}/api/orders/${code}/qr.svg`);
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get('content-type'), /svg/);
  assert.match(await qr.text(), /<svg/);

  // staff: unauthenticated is blocked
  assert.equal((await api('/api/staff/orders')).status, 401);
  assert.equal((await api(`/api/staff/orders/${code}/status`, { method: 'POST', body: { status: 'paid' } })).status, 401);
  assert.equal((await api('/api/staff/login', { method: 'POST', body: { pin: '0000' } })).status, 401);

  const login = await api('/api/staff/login', { method: 'POST', body: { pin: PIN } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);

  const list = await api('/api/staff/orders', { cookie });
  assert.ok(list.json.orders.some(x => x.code === code));
  const detail = await api(`/api/staff/orders/${code}`, { cookie });
  assert.equal(detail.json.phone, '(480) 555-0101');

  // illegal transition
  assert.equal((await api(`/api/staff/orders/${code}/status`, { method: 'POST', body: { status: 'ready' }, cookie })).status, 409);
  // legal path
  for (const s of ['paid', 'ready', 'picked_up']) {
    const u = await api(`/api/staff/orders/${code}/status`, { method: 'POST', body: { status: s }, cookie });
    assert.equal(u.status, 200, u.text); assert.equal(u.json.status, s);
  }
  assert.equal((await api(`/api/staff/orders/${code}/status`, { method: 'POST', body: { status: 'cancelled' }, cookie })).status, 409);

  const out = await api('/api/staff/logout', { method: 'POST', cookie });
  assert.equal(out.status, 200);
  assert.equal((await api('/api/staff/orders', { cookie })).status, 401);
});

test('card order: Stripe session is created and confirmed server-side', async () => {
  const r = await api('/api/orders', { method: 'POST', body: { name: 'Liz', location: 'front-counter', payment: 'card', items: [{ itemId: 'protein-bar', qty: 1, options: { flavor: 'pb' } }] } });
  assert.equal(r.status, 201, r.text);
  assert.match(r.json.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
  const sid = r.json.checkoutUrl.split('/').pop();
  const created = fakeStripe.sessions.get(sid);
  assert.equal(created.metadata.order_code, r.json.code);
  assert.equal(created.params.line_items[0].price_data.unit_amount, 349);
  assert.equal(created.params.success_url, `https://gym.test/order/${r.json.code}?session_id={CHECKOUT_SESSION_ID}`);

  // unpaid session must not mark the order paid
  let c = await api(`/api/orders/${r.json.code}/confirm`, { method: 'POST', body: { sessionId: sid } });
  assert.equal(c.json.status, 'awaiting_payment');
  // wrong session id is rejected
  assert.equal((await api(`/api/orders/${r.json.code}/confirm`, { method: 'POST', body: { sessionId: 'cs_test_other' } })).status, 400);
  // demo confirm is rejected when demo mode is off
  assert.equal((await api(`/api/orders/${r.json.code}/confirm`, { method: 'POST', body: { sessionId: 'demo' } })).status, 400);

  created.payment_status = 'paid';
  c = await api(`/api/orders/${r.json.code}/confirm`, { method: 'POST', body: { sessionId: sid } });
  assert.equal(c.json.status, 'paid');
});

test('card option is refused when no payment provider is configured', async () => {
  const app = createApp({ dbFile: ':memory:', staffPin: PIN });
  const s = await new Promise(resolve => { const srv = app.listen(0, () => resolve(srv)); });
  const b = `http://127.0.0.1:${s.address().port}`;
  const cfg = await (await fetch(`${b}/api/config`)).json();
  assert.equal(cfg.cardEnabled, false);
  const r = await fetch(`${b}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'A', payment: 'card', items: [{ itemId: 'water', qty: 1 }] }) });
  assert.equal(r.status, 400);
  s.close();
});

test('location QR and unknown routes', async () => {
  const qr = await fetch(`${base}/api/locations/cooler-2/qr.svg`);
  assert.equal(qr.status, 200);
  assert.equal((await fetch(`${base}/api/locations/nope/qr.svg`)).status, 404);
  assert.equal((await api('/api/orders/ZZZZZZ')).status, 404);
  assert.equal((await api('/api/nothing')).status, 404);
  const bad = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(bad.status, 400);
});

test('pages are served', async () => {
  for (const p of ['/', '/order/ABC123', '/staff', '/print', '/manifest.webmanifest']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
  }
  const home = await (await fetch(base + '/')).text();
  assert.match(home, /GYM BRUHS/);
  assert.equal(ITEMS.length >= 15, true);
});
