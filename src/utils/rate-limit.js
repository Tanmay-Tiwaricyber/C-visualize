'use strict';

/**
 * Fixed-window, per-IP rate limiter (in-memory, intentionally simple).
 *
 * Two limits are used: a strict one for work-creating requests (POST) and a
 * generous one for reads, because the browser polls a running session for its
 * status and that poll must never be mistaken for abuse.
 */

const config = require('../config');
const { tooManyRequests } = require('./errors');

const buckets = new Map();

function makeLimiter(name, max) {
  return function rateLimit(req, _res, next) {
    const key = `${name}:${req.ip || 'unknown'}`;
    const now = Date.now();
    const windowMs = 60 * 1000;
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return next(tooManyRequests(`Rate limit exceeded (${max} requests per minute).`));
    }
    return next();
  };
}

const readLimiter = makeLimiter('read', config.rateLimitPerMinute * 20);
const writeLimiter = makeLimiter('write', config.rateLimitPerMinute);

/** Strict limit for requests that start compilation or execution work. */
function rateLimit(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return readLimiter(req, res, next);
  return writeLimiter(req, res, next);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > 2 * 60 * 1000) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

module.exports = { rateLimit };
