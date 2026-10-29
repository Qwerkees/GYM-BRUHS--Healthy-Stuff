'use strict';
// End-to-end run in a real (headless) browser at phone size:
// customer builds an order with drop-downs → places it → pays (demo) → staff finds it by code → marks picked up.
// Usage: node tests/browser-smoke.js   (writes screenshots to test-results/)

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createApp } = require('../src/app');

const OUT = path.join(__dirname, '..', 'test-results');
fs.mkdirSync(OUT, { recursive: true });

function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

(async () => {
  const app = createApp({ dbFile: ':memory:', staffPin: '2468', taxRate: 0.078, demoPayments: '1' });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('/api/orders/ZZZ')) errors.push(`HTTP ${r.status()} ${r.url()}`); });

  try {
    // 1. Scan a cooler QR → menu opens with that location preselected
    await page.goto(`${base}/?loc=cooler-2`);
    await page.waitForSelector('.card');
    assert(await page.inputValue('#loc') === 'cooler-2', 'cooler preselected from QR link');
    const cards = await page.locator('.card').count();
    assert(cards >= 15, `menu renders (${cards} cards)`);
    await page.screenshot({ path: path.join(OUT, '01-menu.png'), fullPage: false });

    // 2. Healthier-swap link jumps to the alternative
    await page.click('button.pill:has-text("Nuts")');
    await page.click('.swap button');
    await page.waitForTimeout(400);
    assert(await page.locator('[data-item="almonds"]').isVisible(), 'swap scrolls to almonds');

    // 3. Customize a shake with drop-downs + add-ons, add 2
    await page.click('button.pill:has-text("Shakes")');
    const shake = page.locator('[data-item="shake-choc"]');
    await shake.locator('select[name="shake-choc-size"]').selectOption('l');
    await shake.locator('select[name="shake-choc-protein"]').selectOption('plant');
    await shake.locator('input[value="pb"]').check();
    await shake.locator('.qty button[aria-label="More"]').click();
    const shown = await shake.locator('.price').textContent();
    assert(shown.replace(/[^\d.]/g, '') === '20.98', `card price updates with options (${shown})`);
    await shake.locator('button.add').click();
    await page.screenshot({ path: path.join(OUT, '02-shake-options.png') });

    // 4. Add a yogurt with a topping, open cart
    await page.click('button.pill:has-text("Protein")');
    const yog = page.locator('[data-item="yogurt"]');
    await yog.locator('select').selectOption('berries');
    await yog.locator('button.add').click();
    await page.waitForSelector('#cartbar:not([hidden])');
    const barTotal = await page.textContent('#cartTotal');
    // (699+250+100)*2 + (399+100) = 2098 + 499 = 2597 ; tax 7.8% = 203 → 2800
    assert(barTotal.replace(/[^\d.]/g, '') === '28.00', `cart total with tax (${barTotal})`);
    await page.click('#openCart');
    await page.waitForSelector('#sheet.open');
    assert((await page.locator('#lines .line').count()) === 2, 'two cart lines');
    await page.screenshot({ path: path.join(OUT, '03-cart.png') });

    // 5. Checkout with card (demo) — Spanish toggle on the way
    await page.fill('#name', 'Sal');
    await page.fill('#phone', '480-555-0199');
    await page.click('#payCard');
    await page.click('#placeBtn');
    await page.waitForURL(/\/order\/[A-Z0-9]{6}$/);
    const code = page.url().split('/').pop();
    await page.waitForSelector('#qr img');
    assert((await page.textContent('#status')).includes('Awaiting'), 'order awaits payment');
    await page.click('#langBtn');
    assert((await page.textContent('#status')).includes('Pendiente'), 'Spanish status');
    await page.click('#langBtn');
    await page.screenshot({ path: path.join(OUT, '04-order-unpaid.png') });
    await page.click('#demoPay');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Paid'));
    await page.screenshot({ path: path.join(OUT, '05-order-paid.png') });

    // 6. QR image is a real SVG pointing at the staff lookup
    const svg = await (await fetch(`${base}/api/orders/${code}/qr.svg`)).text();
    assert(svg.includes('<svg'), 'order QR is SVG');

    // 7. Staff: open the link the QR encodes, sign in, order is auto-looked-up, mark picked up
    const staff = await browser.newPage({ viewport: { width: 390, height: 844 } });
    staff.on('pageerror', e => errors.push('staff pageerror: ' + e.message));
    await staff.goto(`${base}/staff?code=${code}`);
    await staff.fill('#pin', '0000');
    await staff.click('#loginForm button[type=submit]');
    await staff.waitForFunction(() => document.querySelector('#loginErr').textContent.includes('Wrong'));
    await staff.fill('#pin', '2468');
    await staff.click('#loginForm button[type=submit]');
    await staff.waitForSelector('#found .order-row');
    assert((await staff.textContent('#found .c')) === code, 'staff auto-lookup from QR link');
    assert((await staff.textContent('#found .st')).includes('Paid'), 'staff sees paid');
    await staff.screenshot({ path: path.join(OUT, '06-staff-found.png') });
    await staff.click('#found button:has-text("Ready")');
    await staff.waitForFunction(() => document.querySelector('#found .st') && document.querySelector('#found .st').textContent.includes('Ready'));
    await staff.click('#found button:has-text("Picked up")');
    await staff.waitForFunction(() => document.querySelector('#found .st') && document.querySelector('#found .st').textContent.includes('Picked'));

    // 8. Customer page polls and reflects pickup
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Picked'), null, { timeout: 8000 });
    await page.screenshot({ path: path.join(OUT, '07-order-pickedup.png') });

    // 9. Print sheet renders a QR per location
    await staff.goto(`${base}/print`);
    await staff.waitForSelector('.print-card img');
    assert((await staff.locator('.print-card').count()) === 3, 'three cooler/counter QR cards');
    await staff.screenshot({ path: path.join(OUT, '08-print-qr.png'), fullPage: true });

    // 10. Desktop layout sanity
    const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await desk.goto(base); await desk.waitForSelector('.card');
    await desk.screenshot({ path: path.join(OUT, '09-desktop.png') });

    assert(errors.length === 0, 'no browser/HTTP errors:\n' + errors.join('\n'));
    console.log(`BROWSER SMOKE PASS — order ${code}, screenshots in test-results/`);
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, 'FAIL.png') }).catch(() => {});
    console.error('BROWSER SMOKE FAIL:', e.message);
    if (errors.length) console.error(errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
