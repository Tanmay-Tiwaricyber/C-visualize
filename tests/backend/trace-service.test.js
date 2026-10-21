'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTrace } = require('../../src/services/trace-service');

const lines = [
  { t: 'start', maxSteps: 100 },
  { t: 'compiled', instrumented: ['square'] },
  { t: 'note', level: 'info', message: 'tracing' },
  {
    t: 'step',
    i: 0,
    line: 4,
    fn: 'main',
    file: 'prog.c',
    frames: [{ fn: 'main', line: 4, depth: 0 }],
    vars: [{ name: 'a', kind: 'scalar', display: '3', cType: 'int', scope: 'local', address: '0x10' }],
    globals: [{ name: 'total', kind: 'scalar', display: '0', cType: 'int', scope: 'global' }],
  },
  { t: 'step', i: 1, line: 5, fn: 'main', frames: [{ fn: 'main', line: 5 }], vars: [{ name: 'a', kind: 'scalar', display: '4', cType: 'int' }] },
  { t: 'output', stream: 'stdout', text: 'hello\n' },
  {
    t: 'step',
    i: 2,
    line: 2,
    fn: 'square',
    frames: [
      { fn: 'square', line: 2, vars: [{ name: 'v', kind: 'scalar', display: '4', cType: 'int', scope: 'param' }] },
      { fn: 'main', line: 5 },
    ],
    vars: [{ name: 'v', kind: 'scalar', display: '4', cType: 'int', scope: 'param' }],
  },
  { t: 'end', reason: 'exit', exitCode: 0, steps: 3, truncated: false },
];

const raw = lines.map((line) => JSON.stringify(line)).join('\n');

test('builds a normalised timeline', () => {
  const trace = buildTrace(raw);
  assert.equal(trace.steps.length, 3);
  assert.equal(trace.steps[0].line, 4);
  assert.equal(trace.steps[0].frames[0].fn, 'main');
  assert.equal(trace.end.exitCode, 0);
  assert.equal(trace.functions[0], 'square');
  assert.equal(trace.notes[0].message, 'tracing');
});

test('attaches output to the step that produced it', () => {
  const trace = buildTrace(raw);
  assert.deepEqual(trace.steps[1].output, [{ stream: 'stdout', text: 'hello\n' }]);
  assert.deepEqual(trace.steps[0].output, []);
  assert.equal(trace.stdout, 'hello\n');
});

test('tracks variable changes per call path', () => {
  const trace = buildTrace(raw);
  const a = trace.steps[1].variables.find((variable) => variable.name === 'a');
  assert.equal(a.changed, true);
  assert.equal(a.previousDisplay, '3');
  // A different call path must not inherit the change flag from main.
  const v = trace.steps[2].variables.find((variable) => variable.name === 'v');
  assert.ok(!v.changed);
});

test('includes globals with a global scope', () => {
  const trace = buildTrace(raw);
  const total = trace.steps[0].variables.find((variable) => variable.name === 'total');
  assert.equal(total.scope, 'global');
});

test('classifies call and return events', () => {
  const trace = buildTrace(raw);
  assert.equal(trace.steps[0].reason, 'entry');
  assert.equal(trace.steps[2].reason, 'call');
});

test('ignores corrupt lines instead of throwing', () => {
  const trace = buildTrace('not json\n{"t":"step","line":1,"fn":"main","frames":[]}\n');
  assert.equal(trace.steps.length, 1);
});

test('marks sanitizer output and preserves stderr', () => {
  const withAsan = buildTrace(
    [
      { t: 'step', line: 1, fn: 'main', frames: [{ fn: 'main', line: 1 }] },
      { t: 'output', stream: 'stderr', text: '==1==ERROR: AddressSanitizer: heap-buffer-overflow' },
      { t: 'end', reason: 'signal', signal: 'SIGABRT', steps: 1 },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n'),
  );
  assert.match(withAsan.stderr, /AddressSanitizer/);
  assert.equal(withAsan.end.signal, 'SIGABRT');
});
