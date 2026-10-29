'use strict';

const { createApp } = require('./src/app');

const port = Number(process.env.PORT || 3000);
const app = createApp();

if (!app.locals.config.staffPin) {
  console.warn('[gym-bruhs] STAFF_PIN is not set — the staff screen cannot sign in until you set it in .env');
}
if (!app.locals.config.stripeSecret && !app.locals.config.demoPayments) {
  console.warn('[gym-bruhs] STRIPE_SECRET_KEY not set — only "pay at counter" is offered to customers');
}

app.listen(port, () => {
  console.log(`GYM BRUHS running on http://localhost:${port}`);
});
