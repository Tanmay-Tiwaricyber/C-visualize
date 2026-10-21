'use strict';

const express = require('express');
const os = require('os');
const { spawnSync } = require('child_process');
const config = require('../config');
const { poolSnapshot } = require('../services/execution-service');
const manager = require('../services/session-manager');

const router = express.Router();

function probe(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 4000 });
  if (result.error) return { available: false, detail: result.error.code || result.error.message };
  const firstLine = (result.stdout || result.stderr || '').split('\n')[0].trim();
  return { available: result.status === 0, version: firstLine };
}

let cache = null;
let cacheAt = 0;

function toolchain() {
  const now = Date.now();
  if (cache && now - cacheAt < 30000) return cache;
  cache = {
    compiler: probe(config.compiler, ['--version']),
    debugger: probe(config.gdb, ['--version']),
  };
  cacheAt = now;
  return cache;
}

router.get('/health', (req, res) => {
  const tools = toolchain();
  const ready = tools.compiler.available && tools.debugger.available;
  res.status(ready ? 200 : 503).json({
    ok: ready,
    status: ready ? 'ready' : 'degraded',
    toolchain: tools,
    runtime: {
      node: process.version,
      platform: `${os.type()} ${os.release()}`,
      cpus: os.cpus().length,
    },
    isolation: {
      namespaces: config.useNamespaces,
      rlimits: config.usePrlimit,
      networkDisabled: config.useNamespaces,
    },
    limits: {
      maxSourceBytes: config.maxSourceBytes,
      maxSteps: config.maxSteps,
      wallTimeoutMs: config.wallTimeoutMs,
      memoryMb: config.memoryMb,
      maxOutputBytes: config.maxOutputBytes,
    },
    jobs: poolSnapshot(),
    sessions: manager.counts(),
  });
});

module.exports = router;
