'use strict';

const config = require('../config');
const { badRequest, payloadTooLarge } = require('../utils/errors');

const MAX_LOOP_BUDGET = 20000;

/** Validate the body of /api/execute, /api/compile and /api/sessions. */
function validateExecutionRequest(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Request body must be a JSON object.');
  }

  const { source, stdin, options } = body;

  if (typeof source !== 'string') {
    throw badRequest('Field "source" is required and must be a string of C code.');
  }
  if (source.trim().length === 0) {
    throw badRequest('The program is empty. Write some C code before running.');
  }
  if (Buffer.byteLength(source, 'utf8') > config.maxSourceBytes) {
    throw payloadTooLarge(`Source exceeds the ${config.maxSourceBytes} byte limit.`);
  }
  if (source.includes('\u0000')) {
    throw badRequest('Source code must not contain NUL bytes.');
  }

  if (stdin !== undefined && stdin !== null && typeof stdin !== 'string') {
    throw badRequest('Field "stdin" must be a string when provided.');
  }
  if (typeof stdin === 'string' && Buffer.byteLength(stdin, 'utf8') > config.maxStdinBytes) {
    throw payloadTooLarge(`Standard input exceeds the ${config.maxStdinBytes} byte limit.`);
  }

  const opts = options && typeof options === 'object' ? options : {};
  const maxSteps = clampInt(opts.maxSteps, config.maxSteps, 50, MAX_LOOP_BUDGET, 'options.maxSteps');
  const sanitize = opts.sanitize === true;

  return {
    source,
    stdin: typeof stdin === 'string' ? stdin : '',
    options: { maxSteps, sanitize },
  };
}

function clampInt(value, fallback, min, max, field) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw badRequest(`Field "${field}" must be a finite number.`);
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Very small guard against obviously malicious command-looking input. */
function validateIdentifier(value, field) {
  if (typeof value !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(value)) {
    throw badRequest(`Field "${field}" is not a valid identifier.`);
  }
  return value;
}

module.exports = { validateExecutionRequest, validateIdentifier };
