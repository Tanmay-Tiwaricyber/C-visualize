'use strict';

const express = require('express');
const { asyncHandler, badRequest, notFound, serviceUnavailable } = require('../utils/errors');
const { validateExecutionRequest, validateIdentifier } = require('../validators/request-validation');
const manager = require('../services/session-manager');

const router = express.Router();

function requireOwnership(req) {
  const id = validateIdentifier(req.params.id, 'id');
  const session = manager.getSession(id);
  if (!session) throw notFound('That session no longer exists (it may have expired).');
  const token = req.header('x-session-token');
  if (!token || token !== session.token) {
    throw badRequest('A valid x-session-token header is required for this session.');
  }
  return session;
}

/** POST /api/sessions - start a background execution job. */
router.post(
  '/sessions',
  asyncHandler(async (req, res) => {
    const { source, stdin, options } = validateExecutionRequest(req.body);
    const session = manager.createSession({ source, stdin, options });
    res.status(202).json({ ok: true, session: { id: session.id, status: session.status, token: session.token } });
  }),
);

/** GET /api/sessions/:id - poll status / fetch the finished result. */
router.get(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const session = requireOwnership(req);
    res.json({ ok: true, session: manager.publicView(session) });
  }),
);

/** POST /api/sessions/:id/stop - terminate a running session. */
router.post(
  '/sessions/:id/stop',
  asyncHandler(async (req, res) => {
    const session = requireOwnership(req);
    const stopped = manager.stopSession(session.id);
    if (!stopped) throw serviceUnavailable('The session could not be stopped.');
    res.json({ ok: true, session: manager.publicView(stopped) });
  }),
);

module.exports = router;
