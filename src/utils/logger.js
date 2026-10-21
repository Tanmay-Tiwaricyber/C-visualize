'use strict';

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const config = require('../config');

function shouldLog(level) {
  return (levels[level] ?? 2) <= (levels[config.logLevel] ?? 2);
}

function emit(level, message, meta) {
  if (!shouldLog(level)) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(meta === undefined ? `${line}\n` : `${line} ${JSON.stringify(meta)}\n`);
}

module.exports = {
  error: (message, meta) => emit('error', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  info: (message, meta) => emit('info', message, meta),
  debug: (message, meta) => emit('debug', message, meta),
};
