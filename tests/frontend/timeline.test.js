import test from 'node:test';
import assert from 'node:assert/strict';
import { findStep, nextBreakpoint, outputAt, previousBreakpoint, summariseStep } from '../../public/js/timeline.js';
import { highlightC } from '../../public/js/editor.js';

const steps = [
  { index: 0, line: 3, depth: 1, variables: [], output: [] },
  { index: 1, line: 4, depth: 1, variables: [], output: [{ stream: 'stdout', text: 'a\n' }] },
  { index: 2, line: 2, depth: 2, variables: [], output: [] },
  { index: 3, line: 5, depth: 2, variables: [], output: [{ stream: 'stdout', text: 'b\n' }] },
  { index: 4, line: 6, depth: 1, variables: [], output: [] },
];

test('next and previous walk one recorded step at a time', () => {
  assert.equal(findStep(steps, 0, 'next'), 1);
  assert.equal(findStep(steps, 4, 'next'), 4);
  assert.equal(findStep(steps, 0, 'prev'), 0);
  assert.equal(findStep(steps, 3, 'prev'), 2);
});

test('step over skips deeper frames', () => {
  assert.equal(findStep(steps, 1, 'over'), 4);
});

test('step out returns to the caller depth', () => {
  assert.equal(findStep(steps, 2, 'out'), 4);
});

test('output accumulates with the cursor', () => {
  assert.equal(outputAt(steps, 0), '');
  assert.equal(outputAt(steps, 1), 'a\n');
  assert.equal(outputAt(steps, 3), 'a\nb\n');
  assert.equal(outputAt(steps, 4), 'a\nb\n');
});

test('breakpoint navigation only matches breakpoint lines', () => {
  const breakpoints = new Set([5]);
  assert.equal(nextBreakpoint(steps, 0, breakpoints), 3);
  assert.equal(previousBreakpoint(steps, 4, breakpoints), 3);
  assert.equal(nextBreakpoint(steps, 3, breakpoints), -1);
  assert.equal(nextBreakpoint(steps, 0, new Set()), -1);
});

test('step summaries stay readable', () => {
  const summary = summariseStep({ line: 4, reason: 'step', variables: [{ name: 'i', changed: true, previousDisplay: '0', display: '1' }], output: [] }, steps[0]);
  assert.match(summary, /i 0 → 1/);
});

test('the editor tokeniser escapes HTML and colours keywords', () => {
  const html = highlightC('#include <stdio.h>\nint main(void) { return 0; }');
  assert.match(html, /tok-preproc/);
  assert.match(html, /tok-keyword/);
  assert.ok(!html.includes('<stdio.h>'));
  assert.match(html, /&lt;stdio\.h&gt;/);
});
