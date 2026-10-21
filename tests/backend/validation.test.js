'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateExecutionRequest, validateIdentifier } = require('../../src/validators/request-validation');

test('accepts a minimal program and applies defaults', () => {
  const result = validateExecutionRequest({ source: 'int main(void){return 0;}' });
  assert.equal(result.source, 'int main(void){return 0;}');
  assert.equal(result.stdin, '');
  assert.equal(typeof result.options.maxSteps, 'number');
  assert.equal(result.options.sanitize, false);
});

test('rejects a missing body', () => {
  assert.throws(() => validateExecutionRequest(null), /JSON object/);
  assert.throws(() => validateExecutionRequest([]), /JSON object/);
});

test('rejects an empty program', () => {
  assert.throws(() => validateExecutionRequest({ source: '   \n ' }), /empty/);
});

test('rejects a non-string source', () => {
  assert.throws(() => validateExecutionRequest({ source: 42 }), /must be a string/);
});

test('rejects NUL bytes', () => {
  assert.throws(() => validateExecutionRequest({ source: 'int main(){}\u0000' }), /NUL/);
});

test('enforces the source size limit', () => {
  const huge = 'a'.repeat(200 * 1024);
  assert.throws(() => validateExecutionRequest({ source: huge }), /byte limit/);
});

test('enforces the stdin size limit', () => {
  assert.throws(
    () => validateExecutionRequest({ source: 'int main(void){return 0;}', stdin: 'x'.repeat(32 * 1024) }),
    /Standard input/,
  );
});

test('clamps maxSteps into the supported range', () => {
  const low = validateExecutionRequest({ source: 'int main(void){return 0;}', options: { maxSteps: 1 } });
  assert.equal(low.options.maxSteps, 50);
  const high = validateExecutionRequest({ source: 'int main(void){return 0;}', options: { maxSteps: 1e9 } });
  assert.equal(high.options.maxSteps, 20000);
});

test('propagates the sanitizer flag', () => {
  const result = validateExecutionRequest({ source: 'int main(void){return 0;}', options: { sanitize: true } });
  assert.equal(result.options.sanitize, true);
});

test('validates session identifiers', () => {
  assert.throws(() => validateIdentifier('../../etc/passwd', 'id'), /valid identifier/);
  assert.throws(() => validateIdentifier('short', 'id'), /valid identifier/);
  assert.equal(validateIdentifier('0f3c9a44-1b2c-4d5e-8f90-aabbccddeeff', 'id'), '0f3c9a44-1b2c-4d5e-8f90-aabbccddeeff');
});
