'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/errors');
const { validateExecutionRequest } = require('../validators/request-validation');
const { executeProgram } = require('../services/execution-service');

const router = express.Router();

/**
 * POST /api/execute
 * Compile and trace a program in one request. The trace is bounded by the
 * step limit and wall-clock limit, so the response time is predictable.
 */
router.post(
  '/execute',
  asyncHandler(async (req, res) => {
    const { source, stdin, options } = validateExecutionRequest(req.body);
    const result = await executeProgram({ source, stdin, options });
    res.json({ ok: true, result });
  }),
);

module.exports = router;
