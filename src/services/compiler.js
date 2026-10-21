'use strict';

/**
 * Compiler service: turns C source into a debuggable binary and normalised
 * compiler diagnostics. Uses the real system compiler (gcc by default).
 */

const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const sandbox = require('../sandbox/sandbox-adapter');

const BASE_FLAGS = [
  '-std=c11',
  '-g3',
  '-O0',
  '-Wall',
  '-Wextra',
  '-fdiagnostics-format=json',
  '-fdiagnostics-color=never',
];

const SANITIZER_FLAGS = ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-fno-sanitize-recover=undefined'];

function parseDiagnostics(rawOutput) {
  const diagnostics = [];
  const text = (rawOutput || '').trim();
  if (!text) return diagnostics;

  // GCC's JSON diagnostics are a top-level array; anything else is a hard
  // failure (missing compiler, driver error, ...).
  const start = text.indexOf('[');
  if (start !== -1) {
    try {
      const parsed = JSON.parse(text.slice(start));
      for (const item of parsed) collectDiagnostic(item, diagnostics);
      return diagnostics;
    } catch (_) {
      /* fall through to plain text parsing */
    }
  }

  for (const line of text.split('\n')) {
    const match = /^(.*?):(\d+):(\d+):\s+(fatal error|error|warning|note):\s+(.*)$/.exec(line);
    if (match) {
      diagnostics.push({
        severity: match[4] === 'warning' ? 'warning' : match[4] === 'note' ? 'note' : 'error',
        file: path.basename(match[1]),
        line: Number(match[2]),
        column: Number(match[3]),
        message: match[5],
        raw: line,
      });
    } else if (line.trim()) {
      diagnostics.push({ severity: 'error', message: line.trim(), raw: line });
    }
  }
  return diagnostics;
}

function collectDiagnostic(item, target) {
  if (!item || typeof item !== 'object') return;
  const location = Array.isArray(item.locations) && item.locations[0] && item.locations[0].caret;
  const severity =
    item.kind === 'warning' ? 'warning' : item.kind === 'note' ? 'note' : item.kind === 'error' ? 'error' : 'note';
  if (item.kind === 'error' || item.kind === 'warning') {
    target.push({
      severity,
      file: location && location.file ? path.basename(location.file) : 'prog.c',
      line: location ? location.line : undefined,
      column: location ? location.column : undefined,
      message: item.message,
      option: item.option,
      url: item.option_url,
      children: (item.children || []).map((child) => ({ kind: child.kind, message: child.message })),
    });
  }
  for (const child of item.children || []) {
    if (item.kind === 'error' || item.kind === 'warning') continue;
    collectDiagnostic(child, target);
  }
}

/**
 * Compile `source` inside an existing job directory.
 * @returns {Promise<{ok:boolean, diagnostics:Array, binaryPath:string, sanitized:boolean, stderr:string}>}
 */
async function compileSource(job, source, options = {}) {
  const sanitized = options.sanitize === true;
  const sourcePath = job.file('prog.c');
  const binaryPath = job.file('prog');

  await sandbox.writeTextFile(sourcePath, source);

  const args = [...BASE_FLAGS];
  if (sanitized) args.push(...SANITIZER_FLAGS);
  args.push('-o', binaryPath, sourcePath, '-lm');

  const started = Date.now();
  const { child, done } = sandbox.spawnLimited({
    command: config.compiler,
    args,
    cwd: job.dir,
    timeoutMs: config.compileTimeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (chunk) => {
    if (stderr.length < 256 * 1024) stderr += chunk.toString('utf8');
  });
  child.stdout.on('data', (chunk) => {
    if (stdout.length < 64 * 1024) stdout += chunk.toString('utf8');
  });

  const result = await done;
  const diagnostics = parseDiagnostics(stderr || stdout);
  const durationMs = Date.now() - started;

  if (result.error && result.error.code === 'ENOENT') {
    logger.error('compiler missing', { compiler: config.compiler });
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          message: `The C compiler "${config.compiler}" is not available on this server. Install GCC or set CVIS_CC.`,
        },
      ],
      binaryPath: null,
      sanitized,
      stderr,
      durationMs,
    };
  }

  if (result.timedOut) {
    diagnostics.push({
      severity: 'error',
      message: `Compilation timed out after ${config.compileTimeoutMs} ms.`,
    });
    return { ok: false, diagnostics, binaryPath: null, sanitized, stderr, durationMs };
  }

  const ok = result.code === 0;
  if (!ok && diagnostics.length === 0) {
    diagnostics.push({
      severity: 'error',
      message: stderr.trim() || `The compiler exited with status ${result.code}.`,
    });
  }

  return { ok, diagnostics, binaryPath: ok ? binaryPath : null, sanitized, stderr, durationMs };
}

module.exports = { compileSource, parseDiagnostics };
