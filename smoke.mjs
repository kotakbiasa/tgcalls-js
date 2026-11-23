import assert from 'node:assert/strict';
import {
  TgCallsClient,
  resolveYouTube,
  pcmCommand,
  audioDescription,
  loadTl,
  resetTlCache,
  GramjsAdapter,
  MtcuteAdapter,
  isMtcuteClient,
  isGramjsClient,
  createAdapter,
  RtmpPublisher,
  BroadcastController,
  ConferenceController,
  ParticipantRegistry,
  FolderRecorder,
  StateStore,
  ResumeController,
  MediaDependencyError,
  pushExternalAudioFrame,
  pushExternalVideoFrame,
} from './dist/index.js';

console.log('🔍 Running smoke tests on dist/index.js...');

assert.equal(typeof TgCallsClient, 'function', 'TgCallsClient should be exported as a class/function');
assert.equal(typeof resolveYouTube, 'function', 'resolveYouTube should be exported');
assert.equal(typeof pcmCommand, 'function', 'pcmCommand should be exported');
assert.equal(typeof audioDescription, 'function', 'audioDescription should be exported');
assert.equal(typeof loadTl, 'function', 'loadTl should be exported');
assert.equal(typeof resetTlCache, 'function', 'resetTlCache should be exported');
assert.equal(typeof GramjsAdapter, 'function', 'GramjsAdapter should be exported');
assert.equal(typeof MtcuteAdapter, 'function', 'MtcuteAdapter should be exported');
assert.equal(typeof isMtcuteClient, 'function', 'isMtcuteClient should be exported');
assert.equal(typeof isGramjsClient, 'function', 'isGramjsClient should be exported');
assert.equal(typeof createAdapter, 'function', 'createAdapter should be exported');


for (const value of [RtmpPublisher, BroadcastController, ConferenceController, ParticipantRegistry,
  FolderRecorder, StateStore, ResumeController, MediaDependencyError,
  pushExternalAudioFrame, pushExternalVideoFrame]) assert.equal(typeof value, 'function');
for (const name of ['canRequestCall', 'getCallDenialReason', 'joinRtmp', 'joinStreamMode', 'createConference',
  'joinConference', 'resumeFromState', 'flushState', 'pushAudioFrame', 'pushVideoFrame', 'onAudioFrame',
  'seek', 'setVolume', 'setSpeed', 'setLoop', 'getLoop', 'getPlaybackControls']) assert.equal(typeof TgCallsClient.prototype[name], 'function');

console.log('✅ Smoke test passed: all exports verified successfully!');
