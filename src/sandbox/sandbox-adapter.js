'use strict';

/**
 * Sandbox adapter.
 *
 * Submitted C code is never executed inside the Node process. Every job gets
 * its own scratch directory and runs in a separate process tree with:
 *   - rlimits (CPU, address space, process count, file size, open files)
 *   - a fresh user + network namespace (no loopback networking, no host net)
 *   - a wall-clock timeout enforced by killing the whole process group
 *
 * NOTE: this is process isolation, not a virtual machine. Read the security
 * section of the README before exposing the service to untrusted users.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const config = require('../config');
const logger = require('../utils/logger');

const CHILD_ENV_KEYS = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'SYSTEMROOT',
  'WINDIR',
  'SYSTEMDRIVE',
  'COMSPEC',
  'PATHEXT',
  'USERPROFILE',
];

function buildChildEnv(overrides = {}, parentEnv = process.env) {
  const env = {};
  for (const key of CHILD_ENV_KEYS) {
    if (parentEnv[key] !== undefined) env[key] = parentEnv[key];
  }
  return { ...env, ...overrides };
}

async function ensureWorkRoot() {
  await fsp.mkdir(config.workRoot, { recursive: true, mode: 0o700 });
}

async function createJobDir() {
  await ensureWorkRoot();
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(config.workRoot, `job-${id}`);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  return {
    id,
    dir,
    file(name) {
      return path.join(dir, name);
    },
    async cleanup() {
      try {
        await fsp.rm(dir, { recursive: true, force: true });
      } catch (error) {
        logger.warn('job cleanup failed', { dir, message: error.message });
      }
    },
  };
}

/** Prefix a command with the namespace / rlimit wrappers that are available. */
function wrapCommand(command, args, options = {}) {
  let finalCommand = command;
  let finalArgs = args;

  if (config.usePrlimit) {
    const limits = [`--cpu=${config.cpuSeconds}`];
    // AddressSanitizer reserves terabytes of virtual address space, so the
    // RLIMIT_AS guard is skipped for sanitizer builds (the CPU limit and the
    // wall-clock kill still apply).
    if (options.skipAddressSpaceLimit !== true) {
      limits.push(`--as=${config.memoryMb * 1024 * 1024}`);
    }
    limits.push('--nproc=64', '--nofile=256', '--fsize=16777216', '--core=0');
    finalArgs = [...limits, '--', finalCommand, ...finalArgs];
    finalCommand = 'prlimit';
  }

  if (config.useNamespaces) {
    // -U: map our uid inside a user namespace, -n: no network interfaces.
    finalArgs = ['-Urn', '--', finalCommand, ...finalArgs];
    finalCommand = 'unshare';
  }

  return { command: finalCommand, args: finalArgs };
}

/**
 * Spawn a wrapped process. Resolves with the exit status; the caller owns the
 * stdout/stderr streams.
 */
function spawnLimited({ command, args, cwd, env, stdio, timeoutMs, skipAddressSpaceLimit }) {
  const wrapped = wrapCommand(command, args, { skipAddressSpaceLimit });
  const child = spawn(wrapped.command, wrapped.args, {
    cwd,
    // Submitted programs inherit this environment too, so never pass through
    // Render credentials or unrelated host runtime settings.
    env: buildChildEnv(env),
    stdio: stdio || ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group so the whole tree can be killed
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killTree(child);
  }, timeoutMs);

  const done = new Promise((resolve) => {
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: null, signal: null, error, timedOut });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut });
    });
  });

  return { child, done, kill: () => killTree(child) };
}

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    try {
      child.kill('SIGKILL');
    } catch (_) {
      /* already gone */
    }
  }
}

async function writeTextFile(filePath, contents) {
  await fsp.writeFile(filePath, contents, { encoding: 'utf8', mode: 0o600 });
}

function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return '';
  }
}

module.exports = {
  createJobDir,
  ensureWorkRoot,
  buildChildEnv,
  wrapCommand,
  spawnLimited,
  killTree,
  writeTextFile,
  readIfExists,
};
