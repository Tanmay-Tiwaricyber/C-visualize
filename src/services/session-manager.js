'use strict';

/**
 * Session manager.
 *
 * A session is one background execution job. Because this build records the
 * whole timeline in a single traced run (rather than driving a live debugger
 * step by step), a session exposes status, the finished result and a stop
 * control - it does not expose per-step debugger commands.
 */

const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const { executeProgram } = require('./execution-service');

const sessions = new Map();

function nowIso() {
  return new Date().toISOString();
}

function pruneExpired() {
  const cutoff = Date.now() - config.sessionTtlMs;
  for (const [id, session] of sessions) {
    if (session.updatedAt < cutoff && session.status !== 'running') {
      sessions.delete(id);
    }
  }
  if (sessions.size > config.maxSessions) {
    const finished = [...sessions.values()]
      .filter((session) => session.status !== 'running')
      .sort((a, b) => a.updatedAt - b.updatedAt);
    while (sessions.size > config.maxSessions && finished.length) {
      sessions.delete(finished.shift().id);
    }
  }
}

function createSession({ source, stdin, options }) {
  pruneExpired();
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString('hex');
  const session = {
    id,
    token,
    status: 'running',
    createdAt: nowIso(),
    updatedAt: Date.now(),
    result: null,
    message: null,
    kill: null,
  };
  sessions.set(id, session);

  executeProgram({
    source,
    stdin,
    options: {
      ...options,
      onProcess: (kill) => {
        session.kill = kill;
      },
    },
  })
    .then((result) => {
      if (session.status === 'terminated') return;
      session.result = result;
      session.status = 'finished';
      session.message = result.message || null;
      session.updatedAt = Date.now();
    })
    .catch((error) => {
      logger.error('session failed', { id, message: error.message });
      session.status = 'failed';
      session.message = error.message;
      session.updatedAt = Date.now();
    });

  return { id, token, status: session.status };
}

function getSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  session.updatedAt = Date.now();
  return session;
}

function stopSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  if (session.status === 'running') {
    session.status = 'terminated';
    session.message = 'Stopped by the user.';
    session.updatedAt = Date.now();
    if (typeof session.kill === 'function') session.kill();
  }
  return session;
}

function publicView(session) {
  if (!session) return null;
  return {
    id: session.id,
    status: session.status,
    createdAt: session.createdAt,
    message: session.message,
    result: session.status === 'finished' ? session.result : null,
  };
}

function counts() {
  let running = 0;
  for (const session of sessions.values()) if (session.status === 'running') running += 1;
  return { total: sessions.size, running };
}

// Periodic cleanup so abandoned sessions cannot grow without bound.
setInterval(pruneExpired, 60 * 1000).unref();

module.exports = { createSession, getSession, stopSession, publicView, counts };
