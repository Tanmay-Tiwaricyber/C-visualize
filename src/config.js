'use strict';

/**
 * Central configuration. Everything is read from the environment so that the
 * same code can run locally and inside a hardened container.
 */
const path = require('path');

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

const config = {
  port: int('PORT', 3000),
  host: process.env.HOST || '0.0.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',

  maxSourceBytes: int('CVIS_MAX_SOURCE_BYTES', 128 * 1024),
  maxStdinBytes: int('CVIS_MAX_STDIN_BYTES', 16 * 1024),
  maxSteps: int('CVIS_MAX_STEPS', 5000),
  wallTimeoutMs: int('CVIS_WALL_TIMEOUT_MS', 20000),
  compileTimeoutMs: int('CVIS_COMPILE_TIMEOUT_MS', 15000),
  cpuSeconds: int('CVIS_CPU_SECONDS', 10),
  memoryMb: int('CVIS_MEMORY_MB', 1024),
  maxOutputBytes: int('CVIS_MAX_OUTPUT_BYTES', 256 * 1024),
  maxConcurrentJobs: int('CVIS_MAX_CONCURRENT_JOBS', 2),
  rateLimitPerMinute: int('CVIS_RATE_LIMIT_PER_MINUTE', 40),
  sessionTtlMs: int('CVIS_SESSION_TTL_MS', 10 * 60 * 1000),
  maxSessions: int('CVIS_MAX_SESSIONS', 100),

  compiler: process.env.CVIS_CC || 'gcc',
  gdb: process.env.CVIS_GDB || 'gdb',
  useNamespaces: bool('CVIS_USE_NAMESPACES', true),
  usePrlimit: bool('CVIS_USE_PRLIMIT', true),

  workRoot: process.env.CVIS_WORK_ROOT || path.join(require('os').tmpdir(), 'cvis-jobs'),
  tracerScript: path.join(__dirname, 'sandbox', 'gdb_tracer.py'),
  publicDir: path.join(__dirname, '..', 'public'),
};

module.exports = config;
