'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChildEnv } = require('../../src/sandbox/sandbox-adapter');

test('child processes receive required runtime variables but not host secrets', () => {
  const childEnv = buildChildEnv(
    { CVIS_CONFIG: '/tmp/cvis-config.json' },
    {
      PATH: '/usr/bin',
      HOME: '/home/node',
      RENDER_API_KEY: 'do-not-pass-through',
      NODE_OPTIONS: '--require /tmp/injected.js',
    },
  );

  assert.equal(childEnv.PATH, '/usr/bin');
  assert.equal(childEnv.HOME, '/home/node');
  assert.equal(childEnv.CVIS_CONFIG, '/tmp/cvis-config.json');
  assert.equal('RENDER_API_KEY' in childEnv, false);
  assert.equal('NODE_OPTIONS' in childEnv, false);
});
