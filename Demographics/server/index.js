/**
 * Demographics Tool - Express server
 *
 * Proxies public data APIs (Census ACS, TIGERweb, EPA Walkability) so the
 * Census API key stays server-side. Serves the static frontend in ../public.
 *
 * Designed as a drop-in module: you can mount the router from routes/*
 * into any existing Express app instead of running this as a standalone server.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const geocode = require('./routes/geocode');
const tracts = require('./routes/tracts');
const demographics = require('./routes/demographics');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS. If ALLOWED_ORIGINS is empty, allow all (dev convenience).
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowed.length ? allowed : true,
  })
);
app.use(express.json());

// Simple request log
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// API routes
app.use('/api/geocode', geocode);
app.use('/api/tracts', tracts);
app.use('/api/demographics', demographics);

// Serve the static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Catch-all error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Demographics tool listening on http://localhost:${PORT}`);
  console.log(`  Frontend: http://localhost:${PORT}/`);
  console.log(`  API:      http://localhost:${PORT}/api`);
  if (!process.env.CENSUS_API_KEY) {
    console.log('  (no CENSUS_API_KEY set - Census ACS will be called unkeyed)');
  }
});
