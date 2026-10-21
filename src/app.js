'use strict';

const path = require('path');
const express = require('express');
const config = require('./config');
const { errorMiddleware, notFound } = require('./utils/errors');
const { rateLimit } = require('./utils/rate-limit');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));

// Security headers for the static app. No external origins are needed: the
// frontend ships its own fonts, icons and editor.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // The app must be embeddable (hosting previews render it inside an iframe),
  // and it is designed to be embedded in course material. Re-add
  // `X-Frame-Options: SAMEORIGIN` if you host it standalone.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors *",
  );
  next();
});

app.use('/api', rateLimit);
app.use('/api', require('./routes/health'));
app.use('/api', require('./routes/execute'));
app.use('/api', require('./routes/compile'));
app.use('/api', require('./routes/sessions'));

app.use('/api', (req, _res, next) => next(notFound(`No API route matches ${req.method} ${req.originalUrl}.`)));

app.use(express.static(config.publicDir, { extensions: ['html'], maxAge: '5m' }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(config.publicDir, 'index.html'));
});

app.use(errorMiddleware);


module.exports = app;
