import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { MediaSource, StreamDevice, StreamMode } from 'ntgcalls';

const participantsModule = new URL('../src/participants.js', import.meta.url);

test('snapshot resolves signed SSRCs without conflating user and channel identities', async () => {
  assert.ok(existsSync(new URL('../src/participants.ts', import.meta.url)), 'ParticipantRegistry is not implemented');
  const { ParticipantRegistry } = await import(participantsModule.href);
  const registry = new ParticipantRegistry();
  registry.applySnapshot([
    { peer: { kind: 'user', id: 42n }, source: -1 },
    { peer: { kind: 'channel', id: 42n }, source: 300 },
  ], 10);
  assert.equal(registry.version, 10);
  assert.deepEqual(registry.lookup(-1n, 'microphone')?.peer, { kind: 'user', id: 42n });
  assert.deepEqual(registry.lookup(0xffffffffn, 'microphone')?.peer, { kind: 'user', id: 42n });
  assert.deepEqual(registry.lookup(300n, 'microphone')?.peer, { kind: 'channel', id: 42n });
  assert.equal(registry.lookup(999n, 'microphone'), undefined);
});

test('participant versions reorder bounded deltas and request a snapshot for unresolved gaps', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const changes: any[] = [];
  const registry = new ParticipantRegistry({ gapTimeoutMs: 5, maxPendingDeltas: 2 });
  registry.subscribe((change: unknown) => changes.push(change));
  const peer = { kind: 'user', id: 7n } as const;
  registry.applySnapshot([{ peer, source: 10 }], 3);
  assert.equal(registry.applyDelta([{ peer, source: 30, versioned: true }], 5), 'gap');
  assert.equal(registry.lookup(30, 'microphone'), undefined, 'gap cannot relabel incoming media');
  assert.equal(registry.applyDelta([{ peer, source: 20, versioned: true }], 4), 'applied');
  assert.equal(registry.version, 5);
  assert.equal(registry.lookup(10, 'microphone'), undefined);
  assert.equal(registry.lookup(30, 'microphone')?.peer.id, 7n);
  assert.equal(registry.applyDelta([{ peer, source: 99, versioned: true }], 3), 'ignored');
  assert.equal(registry.applyDelta([{ peer, source: 31 }], 1), 'applied', 'unversioned state applies regardless of version');
  assert.equal(registry.version, 5);
  registry.applyDelta([{ peer, source: 90, left: true }], 9);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(registry.needsResync, true);
  assert.equal(changes.at(-1).reason, 'gap');
  registry.applySnapshot([{ peer, source: 40 }], 9);
  assert.equal(registry.needsResync, false);
  registry.applyDelta([{ peer, source: 40, left: true }], 10);
  assert.equal(registry.lookup(40, 'microphone'), undefined);
  registry.dispose();
});

test('video sources retain endpoints, presentation audio and native aliases across replacements', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const registry = new ParticipantRegistry();
  const changes: any[] = [];
  registry.subscribe((change: unknown) => changes.push(change));
  const peer = { kind: 'channel', id: 88n } as const;
  registry.applySnapshot([{ peer, source: 8,
    video: { endpoint: 'old', sourceGroups: [{ semantics: 'SIM', sources: [-2, 12] }] },
    presentation: { endpoint: 'screen', audioSource: -3, sourceGroups: [{ semantics: 'FID', sources: [17, 18] }] },
  }], 1);
  registry.bindEndpoint('old', 100);
  registry.bindEndpoint('screen', 0);
  assert.equal(registry.lookup(100n, 'camera')?.endpoint, 'old');
  assert.equal(registry.lookup(-2n, 'camera')?.endpoint, 'old');
  assert.equal(registry.lookup(-3n, 'microphone')?.peer.kind, 'channel');
  assert.equal(registry.lookup(18n, 'screen')?.endpoint, 'screen');
  assert.equal(registry.lookup(0n, 'screen'), undefined, 'pending native SSRC 0 is never an identity');
  registry.applyDelta([{ peer, source: 8, video: { endpoint: 'new', sourceGroups: [{ semantics: 'SIM', sources: [19] }] }, versioned: true }], 2);
  assert.equal(registry.lookup(100n, 'camera'), undefined);
  assert.equal(registry.lookup(17n, 'screen'), undefined);
  assert.equal(registry.lookup(19n, 'camera')?.endpoint, 'new');
  assert.equal(changes.at(-1).origin, 'mtproto');
  assert.ok(changes.at(-1).sourceChanges.some((source: any) => source.endpoint === 'old' && source.state === 'stopped'));
  assert.ok(changes.at(-1).sourceChanges.some((source: any) => source.endpoint === 'new' && source.state === 'active'));
  const snapshot = registry.snapshot();
  snapshot[0].video.sourceGroups[0].sources[0] = 123;
  assert.equal(registry.lookup(19n, 'camera')?.endpoint, 'new', 'snapshot mutation cannot alter registry');
  registry.dispose();
});

test('registry refuses ambiguous SSRC ownership and invalid identities', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const registry = new ParticipantRegistry();
  registry.applySnapshot([{ peer: { kind: 'user', id: 1n }, source: 3 }, { peer: { kind: 'user', id: 2n }, source: 3 }], 1);
  assert.equal(registry.lookup(3, 'microphone'), undefined, 'collision is never last-writer-wins');
  assert.throws(() => registry.applySnapshot([{ peer: { kind: 'user', id: 0n }, source: 1 }], 2));
  assert.throws(() => registry.applySnapshot([{ peer: { kind: 'user', id: 1n }, source: 1.5 }], 2));
  assert.throws(() => registry.applySnapshot([], -1));
  assert.equal(registry.version, 1, 'invalid snapshot is atomic');
  registry.dispose();
});

const folderModule = new URL('../src/folder-recording.js', import.meta.url);
const handle = -100123n;
function tone(frequency: number, samples = 4800): Buffer {
  const result = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) { result.writeInt16LE(Math.round(12000 * Math.sin(2 * Math.PI * frequency * i / 48000)), i * 2); }
  return result;
}
function nativePort() {
  const calls: any[] = [];
  return {
    calls,
    async setStreamSources(id: bigint, mode: number, media: unknown) { calls.push(['playback', id, mode, media]); },
    async addIncomingVideo(id: bigint, peer: bigint, endpoint: string, groups: unknown) { calls.push(['add', id, peer, endpoint, groups]); return 909; },
    async removeIncomingVideo(id: bigint, endpoint: string) { calls.push(['remove', id, endpoint]); return true; },
    onFrames() { throw new Error('recorder must not replace the native callback'); },
  };
}
function probe(path: string) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function decode(path: string): Buffer {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 's16le', '-ar', '48000', '-ac', '1', 'pipe:1'], { timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout;
}
function amplitude(pcm: Buffer, frequency: number): number {
  let sin = 0, cos = 0;
  const samples = pcm.length / 2;
  for (let i = 0; i < samples; i++) {
    sin += pcm.readInt16LE(i * 2) * Math.sin(2 * Math.PI * frequency * i / 48000);
    cos += pcm.readInt16LE(i * 2) * Math.cos(2 * Math.PI * frequency * i / 48000);
  }
  return Math.hypot(sin, cos) / samples;
}

test('folder recording configures full EXTERNAL playback and saves isolated PCM before stopped events', async () => {
  assert.ok(existsSync(new URL('../src/folder-recording.ts', import.meta.url)), 'FolderRecorder is not implemented');
  const { ParticipantRegistry } = await import(participantsModule.href);
  const { FolderRecorder } = await import(folderModule.href);
  const registry = new ParticipantRegistry();
  registry.applySnapshot([{ peer: { kind: 'user', id: 1n }, source: -1 }, { peer: { kind: 'channel', id: 1n }, source: 2 }], 1);
  const dir = await mkdtemp(join(tmpdir(), 'folder-pcm-'));
  const native = nativePort();
  const stopped: any[] = [];
  let offCount = 0;
  const recorder = new FolderRecorder({ handle, dir, registry, native, video: true,
    subscribeFrames: () => () => { offCount++; },
    onStopped: (event: any) => { assert.ok(existsSync(event.path)); stopped.push(event); },
  });
  await recorder.start();
  const media = native.calls[0][3];
  assert.equal(media.microphone.mediaSource, MediaSource.EXTERNAL);
  assert.equal(media.camera.mediaSource, MediaSource.EXTERNAL);
  assert.equal(media.screen.mediaSource, MediaSource.EXTERNAL);
  assert.equal(native.calls[0][2], StreamMode.PLAYBACK);
  for (let i = 0; i < 10; i++) {
    recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: -1n, data: tone(440) }, { ssrc: 2n, data: tone(880) }]);
  }
  const [path1, path2] = await Promise.all([recorder.stop(), recorder.stop()]);
  assert.equal(path1, dir); assert.equal(path2, dir);
  assert.equal(await recorder.stop(), dir);
  assert.equal(offCount, 1);
  assert.equal(stopped.length, 2);
  for (const event of stopped) {
    assert.equal(event.status, 'saved');
    assert.equal(probe(event.path).streams[0].codec_name, 'pcm_s16le');
    const data = decode(event.path);
    const own = event.peer.kind === 'user' ? 440 : 880;
    const other = own === 440 ? 880 : 440;
    assert.ok(amplitude(data, own) > 5000);
    assert.ok(amplitude(data, other) < 1, 'no audio from another participant');
  }
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.state, 'stopped');
  assert.equal(manifest.segments.length, 2);
  assert.equal(manifest.segments[0].peer.id, '1');
  assert.deepEqual(native.calls.at(-1)[3], {});
  registry.dispose();
});

function i420(width: number, height: number): Buffer {
  const result = Buffer.alloc(width * height * 3 / 2, 128);
  result.fill(80, 0, width * height);
  return result;
}

test('camera and screen subscribe endpoints, rotate on resolution/endpoint and mux only the peer audio', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const { FolderRecorder } = await import(folderModule.href);
  const registry = new ParticipantRegistry();
  const peer = { kind: 'user', id: 11n } as const;
  const otherPeer = { kind: 'user', id: 22n } as const;
  const info = (endpoint: string, source: number) => ({ peer, source: 10,
    video: { endpoint, sourceGroups: [{ semantics: 'SIM', sources: [source] }] },
    presentation: { endpoint: 'desktop', audioSource: 12, sourceGroups: [{ semantics: 'FID', sources: [200, 201] }] },
  });
  registry.applySnapshot([info('front', -100), { peer: otherPeer, source: 20 }], 1);
  const dir = await mkdtemp(join(tmpdir(), 'folder-video-'));
  const native = nativePort();
  native.addIncomingVideo = async (id, user, endpoint, groups) => { native.calls.push(['add', id, user, endpoint, groups]); return endpoint === 'front' ? 909 : 0; };
  let now = 0;
  const recorder = new FolderRecorder({ handle, dir, registry, native, video: true, fps: 10, now: () => now });
  await recorder.start();
  assert.equal(native.calls.filter((call) => call[0] === 'add').length, 2);
  assert.equal(native.calls.find((call) => call[0] === 'add')[4][0].ssrcs[0], 4294967196);
  const feed = (cameraSsrc: bigint, width: number, height: number) => {
    for (let i = 0; i < 5; i++) {
      recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.CAMERA, [{ ssrc: cameraSsrc, data: i420(width, height), frameData: { width, height, absoluteCaptureTimestampMs: 999999999999n } }]);
      recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.SCREEN, [{ ssrc: 200n, data: i420(64, 48), frameData: { width: 64, height: 48 } }]);
      recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [
        { ssrc: 10n, data: tone(440) }, { ssrc: 12n, data: tone(660) }, { ssrc: 20n, data: tone(880) },
      ]);
      now += 100;
    }
  };
  feed(909n, 64, 48);
  await recorder.flush();
  feed(909n, 80, 64);
  await recorder.flush();
  registry.applyDelta([{ ...info('back', 102), versioned: true }], 2);
  await recorder.flush();
  assert.ok(native.calls.some((call) => call[0] === 'remove' && call[2] === 'front'));
  assert.equal(registry.lookup(909, 'camera'), undefined);
  feed(102n, 80, 64);
  await recorder.stop();
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const videos = manifest.segments.filter((segment: any) => segment.device !== 'microphone');
  assert.equal(videos.filter((segment: any) => segment.device === 'camera').length, 3);
  assert.equal(videos.filter((segment: any) => segment.device === 'screen').length, 1);
  for (const segment of videos) {
    assert.equal(segment.status, 'saved');
    const result = probe(segment.path);
    assert.equal(result.streams.find((stream: any) => stream.codec_type === 'video').codec_name, 'h264');
    assert.equal(result.streams.find((stream: any) => stream.codec_type === 'audio').codec_name, 'aac');
    const pcm = decode(segment.path);
    const own = segment.device === 'screen' ? 660 : 440;
    assert.ok(amplitude(pcm, own) > 1000, `${segment.path} includes its peer audio`);
    assert.ok(amplitude(pcm, 880) < amplitude(pcm, own) * 0.02, 'MP4 has no other peer audio');
  }
  assert.equal(new Set(manifest.segments.map((segment: any) => segment.path)).size, manifest.segments.length);
  assert.ok(videos.some((segment: any) => segment.reason === 'resolution-change'));
  assert.ok(videos.some((segment: any) => segment.reason === 'endpoint-change'));
  assert.ok(native.calls.some((call) => call[0] === 'remove' && call[2] === 'back'));
  registry.dispose();
});

test('unknown sources are bounded, looked up once and replayed only after a registry mapping', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const { FolderRecorder } = await import(folderModule.href);
  const registry = new ParticipantRegistry();
  registry.applySnapshot([], 1);
  const dir = await mkdtemp(join(tmpdir(), 'folder-unknown-'));
  const diagnostics: any[] = [], lookups: number[][] = [], stopped: any[] = [];
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => { complete = resolve; });
  const recorder = new FolderRecorder({ handle, dir, registry, native: nativePort(), maxUnknownBytes: 20000,
    unknownTimeoutMs: 20, onDiagnostic: (event: unknown) => diagnostics.push(event), onStopped: (event: any) => stopped.push(event),
    lookupUnknown: async (sources: number[]) => { lookups.push(sources); await pending; },
  });
  await recorder.start();
  const data = tone(440);
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: 70n, data }]);
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: 70n, data }]);
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: 71n, data }]);
  data.fill(0);
  assert.equal(lookups.length, 1);
  assert.ok(diagnostics.some((event) => event.code === 'unknown-buffer-full'));
  registry.applyDelta([{ peer: { kind: 'chat', id: 7n }, source: 70 }], 1);
  complete();
  await recorder.flush();
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: 72n, data: tone(880) }]);
  await new Promise((resolve) => setTimeout(resolve, 35));
  await recorder.stop();
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].peer.kind, 'chat');
  assert.ok(amplitude(decode(stopped[0].path), 440) > 5000, 'pending media owns a copy of frame data');
  assert.ok(diagnostics.some((event) => event.code === 'unknown-expired'));
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  assert.ok(manifest.droppedFrames >= 2);
  registry.dispose();
});

test('bounded frame queue reports overflow and a failed segment, while stop rejects once', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const { FolderRecorder } = await import(folderModule.href);
  const registry = new ParticipantRegistry();
  registry.applySnapshot([{ peer: { kind: 'user', id: 1n }, source: 1 }], 1);
  const dir = await mkdtemp(join(tmpdir(), 'folder-overflow-'));
  const errors: Error[] = [], stopped: any[] = [];
  const recorder = new FolderRecorder({ handle, dir, registry, native: nativePort(), maxQueuedBytes: 10000,
    onError: (error: Error) => errors.push(error), onStopped: (event: any) => stopped.push(event),
  });
  await recorder.start();
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: 1n, data: tone(440) }, { ssrc: 1n, data: tone(440) }]);
  await assert.rejects(recorder.stop(), /Folder recording failed/);
  await assert.rejects(recorder.stop(), /Folder recording failed/);
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].status, 'failed');
  assert.ok(errors.some((error) => /queue limit/.test(error.message)));
  registry.dispose();
});

test('encoder nonzero preserves recovery media and emits one failed stopped event', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const { FolderRecorder } = await import(folderModule.href);
  const registry = new ParticipantRegistry();
  registry.applySnapshot([{ peer: { kind: 'user', id: 1n }, source: 1, video: { endpoint: 'cam', sourceGroups: [{ semantics: 'SIM', sources: [2] }] } }], 1);
  const dir = await mkdtemp(join(tmpdir(), 'folder-encoder-'));
  const stopped: any[] = [], errors: Error[] = [];
  const recorder = new FolderRecorder({ handle, dir, registry, native: nativePort(), video: true, ffmpegPath: '/bin/false',
    onStopped: (event: any) => stopped.push(event), onError: (error: Error) => errors.push(error),
  });
  await recorder.start();
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.CAMERA, [{ ssrc: 2n, data: i420(64, 48), frameData: { width: 64, height: 48 } }]);
  await assert.rejects(recorder.stop(), /Folder recording failed/);
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].status, 'failed');
  assert.ok(errors.some((error) => /false failed/.test(error.message)));
  assert.ok((await readdir(dir)).some((name) => name.endsWith('.i420')));
  assert.ok((await readdir(dir)).some((name) => name.endsWith('.s16le')));
  registry.dispose();
});

test('left participants finalize once and cannot accept stale handle, capture or post-stop frames', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const { FolderRecorder } = await import(folderModule.href);
  const registry = new ParticipantRegistry();
  const peer = { kind: 'user', id: 1n } as const;
  registry.applySnapshot([{ peer, source: 1 }], 1);
  const dir = await mkdtemp(join(tmpdir(), 'folder-left-'));
  const stopped: any[] = [];
  const recorder = new FolderRecorder({ handle, dir, registry, native: nativePort(), onStopped: (event: any) => stopped.push(event) });
  await recorder.start();
  const frames = [{ ssrc: 1n, data: tone(440) }];
  recorder.consumeFrames(handle + 1n, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, frames);
  recorder.consumeFrames(handle, StreamMode.CAPTURE, StreamDevice.MICROPHONE, frames);
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, frames);
  registry.applyDelta([{ peer, source: 1, left: true }], 2);
  await recorder.flush();
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].reason, 'participant-left');
  await recorder.stop();
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, frames);
  assert.equal(stopped.length, 1);
  assert.equal(decode(stopped[0].path).length, tone(440).length);
  registry.dispose();
});

test('start failure rolls back playback and endpoint subscriptions; late start cannot escape stop', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const { FolderRecorder } = await import(folderModule.href);
  const registry = new ParticipantRegistry();
  registry.applySnapshot([{ peer: { kind: 'user', id: 1n }, source: 1, video: { endpoint: 'broken', sourceGroups: [] } }], 1);
  const dir = await mkdtemp(join(tmpdir(), 'folder-start-error-'));
  const native = nativePort();
  native.addIncomingVideo = async () => { throw new Error('endpoint RPC failed'); };
  let off = 0;
  const recorder = new FolderRecorder({ handle, dir, registry, native, video: true, subscribeFrames: () => () => { off++; } });
  await assert.rejects(recorder.start(), /endpoint RPC failed/);
  assert.deepEqual(native.calls.at(-1)[3], {});
  assert.equal(off, 1);
  const nextDir = await mkdtemp(join(tmpdir(), 'folder-start-stop-'));
  const secondNative = nativePort();
  let lateOff = 0, lateSubscriptions = 0;
  const second = new FolderRecorder({ handle, dir: nextDir, registry, native: secondNative,
    subscribeFrames: () => { lateSubscriptions++; return () => { lateOff++; }; },
  });
  const starting = second.start();
  const stopping = second.stop();
  await Promise.all([starting, stopping]);
  assert.equal(lateOff, lateSubscriptions, 'every established subscription is detached');
  const empty = JSON.parse(await readFile(join(nextDir, 'manifest.json'), 'utf8'));
  assert.equal(empty.state, 'stopped');
  assert.equal(empty.segments.length, 0);
  registry.dispose();
});

test('recorder observes disk, probe and native cleanup errors and rejects RTMP before side effects', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const { FolderRecorder } = await import(folderModule.href);
  const registry = new ParticipantRegistry();
  registry.applySnapshot([{ peer: { kind: 'user', id: 1n }, source: 1 }], 1);
  assert.throws(() => new FolderRecorder({ handle, dir: '/unused', registry, native: nativePort(), connectionMode: 'RTMP' }), /RTMP/);
  const probeDir = await mkdtemp(join(tmpdir(), 'folder-probe-error-'));
  const stopped: any[] = [];
  const badProbe = new FolderRecorder({ handle, dir: probeDir, registry, native: nativePort(), ffprobePath: '/does-not-exist-ffprobe', onStopped: (event: any) => stopped.push(event) });
  await badProbe.start();
  badProbe.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: 1n, data: tone(440) }]);
  await assert.rejects(badProbe.stop());
  assert.equal(stopped[0].status, 'failed');
  assert.ok(existsSync(stopped[0].path), 'failed probe never deletes recoverable WAV');
  const diskDir = await mkdtemp(join(tmpdir(), 'folder-disk-error-'));
  const native = nativePort();
  const first = new FolderRecorder({ handle, dir: diskDir, registry, native });
  await first.start(); await first.stop();
  const collision = new FolderRecorder({ handle, dir: diskDir, registry, native });
  const before = await readFile(join(diskDir, 'manifest.json'), 'utf8');
  await assert.rejects(collision.start(), /EEXIST/);
  assert.equal(await readFile(join(diskDir, 'manifest.json'), 'utf8'), before);
  const errorDir = await mkdtemp(join(tmpdir(), 'folder-cleanup-error-'));
  const badNative = nativePort();
  badNative.setStreamSources = async (id, mode, media) => {
    if (!Object.keys(media as object).length) { throw new Error('native cleanup failed'); }
    badNative.calls.push(['playback', id, mode, media]);
  };
  const errors: Error[] = [];
  const cleanup = new FolderRecorder({ handle, dir: errorDir, registry, native: badNative, onError: (error: Error) => errors.push(error) });
  await cleanup.start();
  await assert.rejects(cleanup.stop());
  assert.ok(errors.some((error) => /native cleanup failed/.test(error.message)));
  registry.dispose();
});

test('malformed frames fail the source and callbacks from a pending native start are detached by stop', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const { FolderRecorder } = await import(folderModule.href);
  const registry = new ParticipantRegistry();
  registry.applySnapshot([{ peer: { kind: 'user', id: 1n }, source: 1 }], 1);
  const dir = await mkdtemp(join(tmpdir(), 'folder-malformed-'));
  const stopped: any[] = [];
  const recorder = new FolderRecorder({ handle, dir, registry, native: nativePort(), onStopped: (event: any) => stopped.push(event) });
  await recorder.start();
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: 1n, data: tone(440) }]);
  await recorder.flush();
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.MICROPHONE, [{ ssrc: 1n, data: Buffer.alloc(3) }]);
  await assert.rejects(recorder.stop());
  assert.equal(stopped[0].status, 'failed');
  const pendingDir = await mkdtemp(join(tmpdir(), 'folder-pending-start-'));
  const native = nativePort();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  native.setStreamSources = async (id, mode, media) => { native.calls.push(['playback', id, mode, media]); if (Object.keys(media as object).length) { entered(); await gate; } };
  let off = 0;
  const pending = new FolderRecorder({ handle, dir: pendingDir, registry, native, subscribeFrames: () => () => { off++; } });
  const starting = pending.start();
  await ready;
  const stopping = pending.stop();
  release();
  await Promise.all([starting, stopping]);
  assert.equal(off, 1);
  assert.deepEqual(native.calls.at(-1)[3], {});
  await assert.rejects(pending.start(), /stopped/);
  registry.dispose();
});

test('video frame metadata is copied, finalized buffers are released, and native device mismatch stays separate', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const { FolderRecorder } = await import(folderModule.href);
  const registry = new ParticipantRegistry();
  const peer = { kind: 'user', id: 1n } as const;
  registry.applySnapshot([{ peer, source: 1, video: { endpoint: 'camera', sourceGroups: [{ semantics: 'SIM', sources: [2] }] } }], 1);
  const dir = await mkdtemp(join(tmpdir(), 'folder-buffers-'));
  const diagnostics: any[] = [];
  const recorder = new FolderRecorder({ handle, dir, registry, native: nativePort(), video: true, onDiagnostic: (event: unknown) => diagnostics.push(event) });
  await recorder.start();
  const frameData = { width: 64, height: 48 };
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.CAMERA, [{ ssrc: 2n, data: i420(64, 48), frameData }]);
  frameData.width = 80;
  await recorder.flush();
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.SCREEN, [{ ssrc: 2n, data: i420(64, 48), frameData: { width: 64, height: 48 } }]);
  await recorder.stop();
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const video = manifest.segments.find((segment: any) => segment.device === 'camera');
  assert.equal(video.width, 64, 'later native mutation cannot change queued dimensions');
  assert.equal(video.status, 'saved');
  assert.ok(diagnostics.some((event) => event.code === 'device-mismatch'));
  assert.ok((recorder as any).segments.every((segment: any) => segment.lastFrame === undefined));
  registry.dispose();
});

test('native video aliases expire on endpoint ownership/source revision changes', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const registry = new ParticipantRegistry();
  const stream = { endpoint: 'reused', sourceGroups: [{ semantics: 'SIM', sources: [10] }] };
  registry.applySnapshot([{ peer: { kind: 'user', id: 1n }, source: 1, video: stream }], 1);
  registry.bindEndpoint('reused', 900);
  assert.equal(registry.lookup(900, 'camera')?.peer.id, 1n);
  registry.applySnapshot([{ peer: { kind: 'user', id: 2n }, source: 2, video: stream }], 2);
  assert.equal(registry.lookup(900, 'camera'), undefined, 'old native alias cannot become a different peer');
  registry.bindEndpoint('reused', 901);
  registry.applyDelta([{ peer: { kind: 'user', id: 2n }, source: 2, versioned: true,
    video: { endpoint: 'reused', sourceGroups: [{ semantics: 'SIM', sources: [11] }] },
  }], 3);
  assert.equal(registry.lookup(901, 'camera'), undefined, 'changed stream revision requires fresh native alias');
  registry.dispose();
});

test('paused video rejects buffered native frames until MTProto resumes the endpoint', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const { FolderRecorder } = await import(folderModule.href);
  const registry = new ParticipantRegistry();
  const peer = { kind: 'user', id: 1n } as const;
  const stream = { endpoint: 'cam', sourceGroups: [{ semantics: 'SIM', sources: [2] }] };
  registry.applySnapshot([{ peer, source: 1, video: stream }], 1);
  const dir = await mkdtemp(join(tmpdir(), 'folder-paused-'));
  const stopped: any[] = [];
  const recorder = new FolderRecorder({ handle, dir, registry, native: nativePort(), video: true, onStopped: (event: any) => stopped.push(event) });
  await recorder.start();
  const frames = [{ ssrc: 2n, data: i420(64, 48), frameData: { width: 64, height: 48 } }];
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.CAMERA, frames);
  await recorder.flush();
  registry.applyDelta([{ peer, source: 1, video: { ...stream, paused: true }, versioned: true }], 2);
  recorder.consumeFrames(handle, StreamMode.PLAYBACK, StreamDevice.CAMERA, frames);
  await recorder.flush();
  await recorder.stop();
  assert.equal(stopped.length, 1, 'camera off cannot reopen a segment from stale frames');
  registry.dispose();
});

test('late native endpoint results cannot alias media to a replacement participant', async () => {
  const { ParticipantRegistry } = await import(participantsModule.href);
  const { FolderRecorder } = await import(folderModule.href);
  const registry = new ParticipantRegistry();
  const video = { endpoint: 'reused', sourceGroups: [{ semantics: 'SIM', sources: [2] }] };
  registry.applySnapshot([{ peer: { kind: 'user', id: 1n }, source: 1, video }], 1);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const native = nativePort();
  native.addIncomingVideo = async (_id, user) => { if (user === 1n) { entered(); await gate; return 900; } return 0; };
  const dir = await mkdtemp(join(tmpdir(), 'folder-stale-endpoint-'));
  const recorder = new FolderRecorder({ handle, dir, registry, native, video: true });
  const starting = recorder.start();
  await ready;
  registry.applySnapshot([{ peer: { kind: 'user', id: 2n }, source: 3, video }], 2);
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await starting; await recorder.flush();
  assert.equal(registry.lookup(900, 'camera'), undefined, 'late peer-1 subscription cannot attribute packets to peer 2');
  await recorder.stop();
  registry.dispose();
});
