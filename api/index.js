'use strict';
// Vercel entry point: every request is rewritten here (see vercel.json) and handled by the Express app.
const { createApp } = require('../src/app');

if (process.env.VERCEL && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required on Vercel (the filesystem is read-only, so SQLite cannot be used).');
}

module.exports = createApp();
