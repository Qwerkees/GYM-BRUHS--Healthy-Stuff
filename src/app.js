'use strict';

const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const QRCode = require('qrcode');
const { openDb } = require('./db');
const { CATEGORIES, ITEMS, itemById, priceLine } = require('./menu');

const ORDER_STATUSES = ['awaiting_payment', 'paid', 'ready', 'picked_up', 'cancelled'];
// Letters/digits that are hard to misread when a human types the code.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeCode() {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function nowIso() { return new Date().toISOString(); }

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function cleanPhone(v) {
  const s = cleanText(v, 32).replace(/[^\d+\-() ]/g, '');
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length < 7 || digits.length > 15) return null; // invalid
  return s;
}

/**
 * Build the app. Everything configurable is passed in so tests can run
 * without env vars, a real Stripe account, or a file on disk.
 */
function createApp(config = {}) {
  const cfg = {
    dbFile: config.dbFile || process.env.DB_FILE || path.join(__dirname, '..', 'data', 'gym-bruhs.sqlite'),
    staffPin: config.staffPin ?? process.env.STAFF_PIN ?? '',
    taxRate: Number(config.taxRate ?? process.env.TAX_RATE ?? 0),
    baseUrl: (config.baseUrl ?? process.env.BASE_URL ?? '').replace(/\/+$/, ''),
    stripeSecret: config.stripeSecret ?? process.env.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: config.stripeWebhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? '',
    demoPayments: String(config.demoPayments ?? process.env.DEMO_PAYMENTS ?? '') === '1',
    stripeClient: config.stripeClient || null,
  };
  if (!(cfg.taxRate >= 0 && cfg.taxRate < 1)) throw new Error('TAX_RATE must be between 0 and 1');

  const db = openDb(cfg.dbFile);
  const stripe = cfg.stripeClient || (cfg.stripeSecret ? require('stripe')(cfg.stripeSecret) : null);
  const cardEnabled = Boolean(stripe) || cfg.demoPayments;

  const q = {
    locations: db.prepare('SELECT slug, name, kind FROM locations WHERE active = 1 ORDER BY id'),
    location: db.prepare('SELECT slug, name, kind FROM locations WHERE slug = ? AND active = 1'),
    insertOrder: db.prepare(`INSERT INTO orders
      (code, location_slug, customer_name, phone, lang, items_json, subtotal_cents, tax_cents, total_cents, payment_method, status)
      VALUES (@code, @location_slug, @customer_name, @phone, @lang, @items_json, @subtotal_cents, @tax_cents, @total_cents, @payment_method, @status)`),
    order: db.prepare('SELECT * FROM orders WHERE code = ?'),
    setStatus: db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE code = ?'),
    setStripe: db.prepare('UPDATE orders SET stripe_session = ?, updated_at = ? WHERE code = ?'),
    recent: db.prepare(`SELECT * FROM orders WHERE created_at >= ? ORDER BY created_at DESC LIMIT 300`),
    insertSession: db.prepare('INSERT INTO staff_sessions (token, expires_at) VALUES (?, ?)'),
    session: db.prepare('SELECT token FROM staff_sessions WHERE token = ? AND expires_at > ?'),
    deleteSession: db.prepare('DELETE FROM staff_sessions WHERE token = ?'),
    purgeSessions: db.prepare('DELETE FROM staff_sessions WHERE expires_at <= ?'),
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Stripe needs the raw body to verify webhook signatures — mount before json().
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    if (!stripe || !cfg.stripeWebhookSecret) return res.status(404).json({ error: 'Webhook not configured' });
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], cfg.stripeWebhookSecret);
    } catch (err) {
      return res.status(400).json({ error: 'Bad signature' });
    }
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const code = session.metadata && session.metadata.order_code;
      if (code && session.payment_status === 'paid') markPaid(code, session.id);
    }
    res.json({ received: true });
  });

  app.use(express.json({ limit: '64kb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'");
    next();
  });

  // Simple in-memory rate limit for order creation and staff login.
  const buckets = new Map();
  function limited(key, max, windowMs) {
    const now = Date.now();
    const b = buckets.get(key) || { n: 0, reset: now + windowMs };
    if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
    b.n += 1;
    buckets.set(key, b);
    if (buckets.size > 5000) buckets.clear();
    return b.n > max;
  }

  function markPaid(code, stripeSession) {
    const o = q.order.get(code);
    if (!o) return false;
    if (stripeSession) q.setStripe.run(stripeSession, nowIso(), code);
    if (o.status === 'awaiting_payment') q.setStatus.run('paid', nowIso(), code);
    return true;
  }

  function publicOrder(o) {
    return {
      code: o.code,
      location: o.location_slug,
      name: o.customer_name,
      lang: o.lang,
      items: JSON.parse(o.items_json),
      subtotalCents: o.subtotal_cents,
      taxCents: o.tax_cents,
      totalCents: o.total_cents,
      paymentMethod: o.payment_method,
      status: o.status,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
    };
  }

  function originOf(req) {
    return cfg.baseUrl || `${req.protocol}://${req.get('host')}`;
  }

  // ---------- public API ----------

  app.get('/api/healthz', (req, res) => res.json({ ok: true, time: nowIso() }));

  app.get('/api/config', (req, res) => {
    res.json({
      cardEnabled,
      demoPayments: cfg.demoPayments,
      taxRate: cfg.taxRate,
      locations: q.locations.all(),
    });
  });

  app.get('/api/menu', (req, res) => {
    res.json({ categories: CATEGORIES, items: ITEMS });
  });

  app.post('/api/orders', (req, res) => {
    if (limited(`order:${req.ip}`, 30, 10 * 60 * 1000)) return res.status(429).json({ error: 'Too many orders, slow down.' });
    const body = req.body || {};
    const name = cleanText(body.name, 60);
    if (name.length < 1) return res.status(400).json({ error: 'Name is required.' });
    const phone = cleanPhone(body.phone);
    if (phone === null) return res.status(400).json({ error: 'Phone number looks wrong.' });
    const lang = body.lang === 'es' ? 'es' : 'en';
    const loc = q.location.get(cleanText(body.location, 40) || 'front-counter');
    if (!loc) return res.status(400).json({ error: 'Unknown pickup location.' });
    const payment = body.payment === 'card' ? 'card' : body.payment === 'counter' ? 'counter' : null;
    if (!payment) return res.status(400).json({ error: 'Pick a payment method.' });
    if (payment === 'card' && !cardEnabled) return res.status(400).json({ error: 'Card payments are not set up yet. Choose pay at counter.' });
    if (!Array.isArray(body.items) || body.items.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });
    if (body.items.length > 25) return res.status(400).json({ error: 'Too many lines in one order.' });

    let lines;
    try {
      lines = body.items.map(priceLine);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const subtotal = lines.reduce((s, l) => s + l.lineCents, 0);
    if (subtotal <= 0) return res.status(400).json({ error: 'Order total must be above zero.' });
    const tax = Math.round(subtotal * cfg.taxRate);
    const total = subtotal + tax;

    let code;
    for (let i = 0; i < 5; i++) {
      code = makeCode();
      if (!q.order.get(code)) break;
      code = null;
    }
    if (!code) return res.status(500).json({ error: 'Could not allocate an order code.' });

    q.insertOrder.run({
      code, location_slug: loc.slug, customer_name: name, phone: phone || null, lang,
      items_json: JSON.stringify(lines), subtotal_cents: subtotal, tax_cents: tax, total_cents: total,
      payment_method: payment, status: 'awaiting_payment',
    });

    const origin = originOf(req);
    const orderUrl = `${origin}/order/${code}`;

    if (payment === 'card' && stripe) {
      return stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: lines.map(l => ({
          quantity: l.qty,
          price_data: {
            currency: 'usd',
            unit_amount: l.unitCents,
            product_data: { name: itemById.get(l.itemId)[lang === 'es' ? 'es' : 'en'] },
          },
        })).concat(tax > 0 ? [{ quantity: 1, price_data: { currency: 'usd', unit_amount: tax, product_data: { name: lang === 'es' ? 'Impuesto' : 'Sales tax' } } }] : []),
        metadata: { order_code: code },
        client_reference_id: code,
        success_url: `${orderUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${orderUrl}?cancelled=1`,
      }).then(session => {
        q.setStripe.run(session.id, nowIso(), code);
        res.status(201).json({ code, orderUrl, checkoutUrl: session.url });
      }).catch(() => {
        q.setStatus.run('cancelled', nowIso(), code);
        res.status(502).json({ error: 'Card checkout is unavailable right now. Try pay at counter.' });
      });
    }

    res.status(201).json({ code, orderUrl, checkoutUrl: null });
  });

  app.get('/api/orders/:code', (req, res) => {
    const o = q.order.get(String(req.params.code).toUpperCase());
    if (!o) return res.status(404).json({ error: 'Order not found.' });
    res.json(publicOrder(o));
  });

  // After Stripe redirects back, confirm the session server-side (works even without webhooks).
  app.post('/api/orders/:code/confirm', (req, res) => {
    const code = String(req.params.code).toUpperCase();
    const o = q.order.get(code);
    if (!o) return res.status(404).json({ error: 'Order not found.' });
    if (o.status !== 'awaiting_payment') return res.json(publicOrder(o));
    const sessionId = cleanText(req.body && req.body.sessionId, 200);

    if (cfg.demoPayments && sessionId === 'demo') {
      markPaid(code, 'demo');
      return res.json(publicOrder(q.order.get(code)));
    }
    if (!stripe || !sessionId || !o.stripe_session || !safeEqual(sessionId, o.stripe_session)) {
      return res.status(400).json({ error: 'Payment could not be confirmed.' });
    }
    stripe.checkout.sessions.retrieve(sessionId).then(session => {
      if (session.payment_status === 'paid' && session.metadata && session.metadata.order_code === code) {
        markPaid(code, session.id);
      }
      res.json(publicOrder(q.order.get(code)));
    }).catch(() => res.status(502).json({ error: 'Could not reach the payment provider.' }));
  });

  app.get('/api/orders/:code/qr.svg', (req, res) => {
    const code = String(req.params.code).toUpperCase();
    const o = q.order.get(code);
    if (!o) return res.status(404).type('text/plain').send('Order not found');
    const url = `${originOf(req)}/staff?code=${code}`;
    QRCode.toString(url, { type: 'svg', margin: 1, width: 320, errorCorrectionLevel: 'M' }, (err, svg) => {
      if (err) return res.status(500).type('text/plain').send('QR failed');
      res.setHeader('Cache-Control', 'no-store');
      res.type('image/svg+xml').send(svg);
    });
  });

  // Printable QR for a cooler/counter: scanning opens the menu for that spot.
  app.get('/api/locations/:slug/qr.svg', (req, res) => {
    const loc = q.location.get(cleanText(req.params.slug, 40));
    if (!loc) return res.status(404).type('text/plain').send('Location not found');
    const url = `${originOf(req)}/?loc=${encodeURIComponent(loc.slug)}`;
    QRCode.toString(url, { type: 'svg', margin: 1, width: 480, errorCorrectionLevel: 'H' }, (err, svg) => {
      if (err) return res.status(500).type('text/plain').send('QR failed');
      res.type('image/svg+xml').send(svg);
    });
  });

  // ---------- staff API ----------

  function readCookie(req, name) {
    const raw = req.headers.cookie || '';
    for (const part of raw.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
  }

  function requireStaff(req, res, next) {
    const token = readCookie(req, 'gb_staff');
    if (!token || !q.session.get(token, nowIso())) return res.status(401).json({ error: 'Staff sign-in required.' });
    next();
  }

  app.post('/api/staff/login', (req, res) => {
    if (limited(`login:${req.ip}`, 10, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
    if (!cfg.staffPin) return res.status(503).json({ error: 'Staff PIN is not configured on the server (STAFF_PIN).' });
    const pin = cleanText(req.body && req.body.pin, 64);
    if (!pin || !safeEqual(pin, cfg.staffPin)) return res.status(401).json({ error: 'Wrong PIN.' });
    q.purgeSessions.run(nowIso());
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + 12 * 60 * 60 * 1000);
    q.insertSession.run(token, expires.toISOString());
    const secure = req.secure ? '; Secure' : '';
    res.setHeader('Set-Cookie', `gb_staff=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure}`);
    res.json({ ok: true });
  });

  app.post('/api/staff/logout', (req, res) => {
    const token = readCookie(req, 'gb_staff');
    if (token) q.deleteSession.run(token);
    res.setHeader('Set-Cookie', 'gb_staff=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    res.json({ ok: true });
  });

  app.get('/api/staff/me', requireStaff, (req, res) => res.json({ ok: true }));

  app.get('/api/staff/orders', requireStaff, (req, res) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    res.json({ orders: q.recent.all(since).map(publicOrder) });
  });

  app.get('/api/staff/orders/:code', requireStaff, (req, res) => {
    const o = q.order.get(String(req.params.code).toUpperCase());
    if (!o) return res.status(404).json({ error: 'Order not found.' });
    res.json({ ...publicOrder(o), phone: o.phone });
  });

  const ALLOWED = {
    awaiting_payment: ['paid', 'cancelled'],
    paid: ['ready', 'picked_up', 'cancelled'],
    ready: ['picked_up', 'cancelled'],
    picked_up: [],
    cancelled: [],
  };

  app.post('/api/staff/orders/:code/status', requireStaff, (req, res) => {
    const code = String(req.params.code).toUpperCase();
    const o = q.order.get(code);
    if (!o) return res.status(404).json({ error: 'Order not found.' });
    const next = cleanText(req.body && req.body.status, 20);
    if (!ORDER_STATUSES.includes(next)) return res.status(400).json({ error: 'Unknown status.' });
    if (!ALLOWED[o.status].includes(next)) return res.status(409).json({ error: `Cannot go from ${o.status} to ${next}.` });
    q.setStatus.run(next, nowIso(), code);
    res.json(publicOrder(q.order.get(code)));
  });

  // ---------- pages ----------

  const pub = path.join(__dirname, '..', 'public');
  app.use(express.static(pub, { index: 'index.html', extensions: ['html'] }));
  app.get('/order/:code', (req, res) => res.sendFile(path.join(pub, 'order.html')));
  app.get('/staff', (req, res) => res.sendFile(path.join(pub, 'staff.html')));
  app.get('/print', (req, res) => res.sendFile(path.join(pub, 'print.html')));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad JSON.' });
    res.status(500).json({ error: 'Server error.' });
  });

  app.locals.db = db;
  app.locals.config = cfg;
  return app;
}

module.exports = { createApp, makeCode, ORDER_STATUSES };
