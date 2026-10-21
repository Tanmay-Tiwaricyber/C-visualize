/**
 * Thin REST client for the C Visualizer backend.
 *
 * All failures surface as ApiFailure instances with a human readable message so
 * the UI can show what actually went wrong (compiler missing, backend down,
 * session expired, ...) instead of a generic error.
 */

export class ApiFailure extends Error {
  constructor(message, { code = 'request_failed', status = 0, details } = {}) {
    super(message);
    this.name = 'ApiFailure';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiFailure('Cannot reach the execution service. Is the backend running?', {
      code: 'network_error',
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }

  if (!response.ok || (payload && payload.ok === false)) {
    const error = (payload && payload.error) || {};
    throw new ApiFailure(error.message || `Request failed with status ${response.status}.`, {
      code: error.code || 'request_failed',
      status: response.status,
      details: error.details,
    });
  }

  return payload;
}

export async function checkHealth() {
  try {
    const payload = await request('/api/health');
    return payload;
  } catch (error) {
    return { ok: false, status: 'down', error: error.message };
  }
}

export async function compile(source, options = {}) {
  const payload = await request('/api/compile', {
    method: 'POST',
    body: { source, options },
  });
  return payload.result;
}

export async function startSession({ source, stdin, options }, signal) {
  const payload = await request('/api/sessions', {
    method: 'POST',
    body: { source, stdin, options },
    signal,
  });
  return payload.session;
}

export async function getSession(id, token) {
  const payload = await request(`/api/sessions/${encodeURIComponent(id)}`, {
    headers: { 'x-session-token': token },
  });
  return payload.session;
}

export async function stopSession(id, token) {
  const payload = await request(`/api/sessions/${encodeURIComponent(id)}/stop`, {
    method: 'POST',
    headers: { 'x-session-token': token },
  });
  return payload.session;
}

/**
 * Poll a session until it finishes. Polling (rather than one long request)
 * keeps Stop responsive and works through proxies with short timeouts.
 */
export async function waitForSession({ id, token, onStatus, signal, intervalMs = 300, timeoutMs = 60000 }) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;
  while (Date.now() < deadline) {
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const session = await getSession(id, token);
    if (session.status !== lastStatus) {
      lastStatus = session.status;
      if (onStatus) onStatus(session.status, session);
    }
    if (session.status === 'finished') return session.result;
    if (session.status === 'failed') {
      throw new ApiFailure(session.message || 'The execution session failed.', { code: 'session_failed' });
    }
    if (session.status === 'terminated') {
      throw new ApiFailure(session.message || 'The session was terminated.', { code: 'terminated' });
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new ApiFailure('The execution service did not respond in time.', { code: 'timeout' });
}
