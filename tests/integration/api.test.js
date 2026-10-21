'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const hasToolchain =
  spawnSync('gcc', ['--version']).status === 0 && spawnSync('gdb', ['--version']).status === 0;

let server;
let base;

test.before(async () => {
  const app = require('../../src/app');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  if (server) server.close();
});

async function post(path, body, headers = {}) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('GET /api/health reports the toolchain', async () => {
  const response = await fetch(`${base}/api/health`);
  const body = await response.json();
  assert.equal(typeof body.ok, 'boolean');
  assert.ok(body.limits.maxSteps > 0);
  assert.equal(typeof body.toolchain.compiler.available, 'boolean');
});

test(
  'POST /api/compile returns diagnostics with a line number',
  { skip: !hasToolchain && 'gcc/gdb not installed' },
  async () => {
    const { status, body } = await post('/api/compile', {
      source: '#include <stdio.h>\nint main(void) {\n    int x = ;\n    return 0;\n}\n',
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.result.ok, false);
    const error = body.result.diagnostics.find((item) => item.severity === 'error');
    assert.ok(error, 'expected an error diagnostic');
    assert.equal(error.line, 3);
  },
);

test('POST /api/execute rejects an empty program', async () => {
  const { status, body } = await post('/api/execute', { source: '  ' });
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'bad_request');
});

test('POST /api/execute rejects a non-JSON payload', async () => {
  const response = await fetch(`${base}/api/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  });
  assert.equal(response.status, 400);
});

test('unknown API routes return a JSON 404', async () => {
  const response = await fetch(`${base}/api/nope`);
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error.code, 'not_found');
});

test('POST /api/execute records a real trace', { skip: !hasToolchain && 'gcc/gdb not installed' }, async () => {
  const source = [
    '#include <stdio.h>',
    'int main(void) {',
    '    int a = 2;',
    '    int b = 3;',
    '    int sum = a + b;',
    '    printf("%d\\n", sum);',
    '    return 0;',
    '}',
  ].join('\n');
  const { status, body } = await post('/api/execute', { source });
  assert.equal(status, 200);
  const result = body.result;
  assert.equal(result.status, 'completed');
  assert.ok(result.trace.steps.length >= 4, 'expected several recorded steps');
  assert.equal(result.program.stdout.trim(), '5');
  const last = result.trace.steps[result.trace.steps.length - 1];
  const sum = last.variables.find((variable) => variable.name === 'sum');
  assert.equal(sum.display, '5');
  assert.ok(sum.address.startsWith('0x'));
});

test('session lifecycle drives a background run', { skip: !hasToolchain && 'gcc/gdb not installed' }, async () => {
  const created = await post('/api/sessions', {
    source: '#include <stdio.h>\nint main(void){ printf("hi\\n"); return 0; }\n',
  });
  assert.equal(created.status, 202);
  const { id, token } = created.body.session;
  assert.ok(id && token);

  const deadline = Date.now() + 30000;
  let session = null;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/api/sessions/${id}`, { headers: { 'x-session-token': token } });
    const body = await response.json();
    session = body.session;
    if (session.status === 'finished') break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(session.status, 'finished');
  assert.ok(session.result.trace.steps.length > 0);

  const unauthorised = await fetch(`${base}/api/sessions/${id}`);
  assert.equal(unauthorised.status, 400);
});
