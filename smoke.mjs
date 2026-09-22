import assert from 'node:assert/strict';
import {
  TgCallsClient,
  resolveYouTube,
  pcmCommand,
  audioDescription,
  loadTl,
  resetTlCache,
} from './dist/index.js';

console.log('🔍 Running smoke tests on dist/index.js...');

assert.equal(typeof TgCallsClient, 'function', 'TgCallsClient should be exported as a class/function');
assert.equal(typeof resolveYouTube, 'function', 'resolveYouTube should be exported');
assert.equal(typeof pcmCommand, 'function', 'pcmCommand should be exported');
assert.equal(typeof audioDescription, 'function', 'audioDescription should be exported');
assert.equal(typeof loadTl, 'function', 'loadTl should be exported');
assert.equal(typeof resetTlCache, 'function', 'resetTlCache should be exported');

console.log('✅ Smoke test passed: all exports verified successfully!');
