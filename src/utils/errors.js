'use strict';

/** Error type that carries an HTTP status and a stable machine-readable code. */
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new ApiError(400, 'bad_request', message, details);
const payloadTooLarge = (message) => new ApiError(413, 'payload_too_large', message);
const notFound = (message) => new ApiError(404, 'not_found', message);
const tooManyRequests = (message) => new ApiError(429, 'rate_limited', message);
const serviceUnavailable = (message, details) => new ApiError(503, 'unavailable', message, details);
const gatewayTimeout = (message) => new ApiError(504, 'timeout', message);

/** Wraps async route handlers so rejected promises reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function errorMiddleware(err, req, res, _next) {
  // Body parser failures are the client's fault, not a server fault.
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      ok: false,
      error: { code: 'bad_request', message: 'Request body is not valid JSON.' },
    });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      ok: false,
      error: { code: 'payload_too_large', message: 'Request body is too large.' },
    });
  }
  const status = err instanceof ApiError ? err.status : 500;
  const code = err instanceof ApiError ? err.code : 'internal_error';
  if (status >= 500) {
    require('./logger').error('request failed', { path: req.path, code, message: err.message });
  }
  res.status(status).json({
    ok: false,
    error: {
      code,
      message: status >= 500 && !(err instanceof ApiError) ? 'Internal server error' : err.message,
      details: err.details,
    },
  });
}

module.exports = {
  ApiError,
  badRequest,
  payloadTooLarge,
  notFound,
  tooManyRequests,
  serviceUnavailable,
  gatewayTimeout,
  asyncHandler,
  errorMiddleware,
};
