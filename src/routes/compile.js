'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/errors');
const { validateExecutionRequest } = require('../validators/request-validation');
const { compileOnly } = require('../services/execution-service');

const router = express.Router();

/** POST /api/compile - compile only, returning normalised diagnostics. */
router.post(
  '/compile',
  asyncHandler(async (req, res) => {
    const { source, options } = validateExecutionRequest(req.body);
    const result = await compileOnly({ source, options });
    res.json({ ok: true, result });
  }),
);

module.exports = router;
