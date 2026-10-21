'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDiagnostics } = require('../../src/services/compiler');

test('parses gcc JSON diagnostics into structured records', () => {
  const raw = `[{"kind": "error", "message": "expected expression before ';' token", "locations": [{"caret": {"file": "prog.c", "line": 3, "column": 13}}], "children": []},
  {"kind": "warning", "message": "unused variable 'x'", "option": "-Wunused-variable", "locations": [{"caret": {"file": "prog.c", "line": 3, "column": 9}}], "children": []}]`;
  const diagnostics = parseDiagnostics(raw);
  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].severity, 'error');
  assert.equal(diagnostics[0].line, 3);
  assert.equal(diagnostics[0].column, 13);
  assert.equal(diagnostics[1].severity, 'warning');
  assert.equal(diagnostics[1].option, '-Wunused-variable');
});

test('falls back to plain text parsing for non-JSON output', () => {
  const raw = "prog.c:2:5: error: 'y' undeclared (first use in this function)\nprog.c:4:1: warning: control reaches end of non-void function";
  const diagnostics = parseDiagnostics(raw);
  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].severity, 'error');
  assert.equal(diagnostics[0].line, 2);
  assert.equal(diagnostics[1].severity, 'warning');
  assert.equal(diagnostics[1].line, 4);
});

test('returns an empty list for clean compiles', () => {
  assert.deepEqual(parseDiagnostics(''), []);
  assert.deepEqual(parseDiagnostics('  \n '), []);
});
