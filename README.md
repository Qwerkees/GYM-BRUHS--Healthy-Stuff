# GYM BRUHS — Healthy Stuff 💪

Healthy-snack ordering app for gyms. Members scan a QR on a cooler or counter, pick snacks with
real macros shown on every item, customize with drop-downs (size, protein, flavor, add-ons),
pay on their phone, and show a QR code at pickup. Staff scan or type the code to mark orders
paid / ready / picked up.

Built by Maverick3 L.L.C.

## What's in the box

| Screen | URL | Who |
|---|---|---|
| Menu + cart + checkout (EN/ES toggle) | `/` and `/?loc=cooler-1` | Members |
| Order ticket with QR + live status | `/order/ABC123` | Members |
| Staff board: look up / scan codes, change status | `/staff` | Staff (PIN) |
| Printable QR posters for each cooler/counter | `/print` | Owner |

Features:

- **18 healthy items** in 5 categories, each with kcal / protein / carbs / sugar / fat.
- **Healthier pick** badges, and **"Swap to…"** suggestions on the less-lean items (e.g. Trail Mix → Almonds).
- **Drop-down options** per item (size, protein, flavor, milk, topping…) plus multi-select add-ons, all priced server-side — the browser never sets a price.
- **Pay now** via Stripe Checkout (cards, Apple Pay, Google Pay) **or pay at counter**.
- **Order QR** encodes a staff lookup link; the 6-character code uses only unambiguous characters.
- **Cooler QR** posters: scanning preselects that pickup spot.
- Staff screen can **scan QR with the phone camera** (browsers with BarcodeDetector) or type the code.
- Installable as a home-screen app (PWA manifest + icons).
- SQLite storage (one file), no external services required to run.

## Run it

```sh
npm install
cp .env.example .env     # set STAFF_PIN at minimum
npm start                # http://localhost:3000
```

`npm run dev` restarts on file changes.

### Environment

| Var | Purpose |
|---|---|
| `STAFF_PIN` | PIN for `/staff`. Required for staff sign-in. |
| `TAX_RATE` | Decimal, e.g. `0.078`. `0` hides the tax line. |
| `BASE_URL` | Public URL (used inside QR codes and Stripe redirects). Set this in production. |
| `STRIPE_SECRET_KEY` | Enables "Pay now". Leave empty → only "pay at counter" is offered. |
| `STRIPE_WEBHOOK_SECRET` | Optional. Lets Stripe push `checkout.session.completed` to `/api/stripe/webhook`. Without it, payment is still confirmed when the customer returns to the order page. |
| `DEMO_PAYMENTS` | `1` adds a fake "simulate card payment" button. **Local demos only.** |
| `DB_FILE` | SQLite path. Default `./data/gym-bruhs.sqlite`. |

### Stripe setup (when you're ready to take real money)

1. Create a Stripe account, copy the **secret key** (`sk_live_…` or `sk_test_…`) into `.env`.
2. Set `BASE_URL` to your public https URL.
3. Optional but recommended: add a webhook endpoint `https://YOUR-URL/api/stripe/webhook` for
   `checkout.session.completed`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
4. Apple Pay / Google Pay appear automatically in Stripe Checkout on supported devices.

## Verify

```sh
npm test              # 9 API tests (node:test) — validation, pricing, staff auth, Stripe flow, QR
npm run test:browser  # headless-browser run-through at phone size; screenshots in test-results/
```

The browser test needs Playwright + Chromium (`npm i -D playwright && npx playwright install chromium`).

## Deploy

**Docker**

```sh
docker build -t gym-bruhs .
docker run -d --env-file .env -p 3000:3000 -v gymbruhs-data:/data gym-bruhs
```

**Any Node host** (Railway, Render, Fly, a VPS): `npm ci && npm start`, set the env vars, mount
persistent storage for `DB_FILE`. The app sets `trust proxy`, so it works behind a TLS proxy.

> Vercel/Netlify functions are not a fit — the app keeps a SQLite file on disk.

## Editing the menu

Everything is in `src/menu.js`: items, categories, prices (cents), macros, option groups, swaps.
Restart the server after changes. Tests check that every item has macros and that every swap
points at a real item.

## Order lifecycle

`awaiting_payment → paid → ready → picked_up` (or `cancelled` from any active state).
Card orders become `paid` when Stripe confirms. Counter orders are marked paid by staff.

## Security notes

- Prices and totals are computed only on the server from `src/menu.js`.
- Staff sessions: random 256-bit token, HttpOnly + SameSite=Strict cookie, 12-hour expiry; PIN compared in constant time; login rate-limited.
- Order codes are random and unguessable in practice (31^6 ≈ 887 M); the public order endpoint exposes no phone number.
- CSP, nosniff, frame-ancestors none. No inline scripts.
- Stripe webhook signatures are verified with the raw body.
- Never commit `.env`.

## Not included yet

Loyalty points, inventory counts per cooler, push/SMS notifications, native store wrappers.
The structure (single Express app + SQLite) is the same as Y.E.S., so those can be added the same way.
