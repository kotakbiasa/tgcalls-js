import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { LogLevel, MediaSource, NTgCalls, setLogLevel, StreamMode } from 'ntgcalls';
import { TgCallsError } from '../src/errors.js';
import { audioDescription, probeVideo, recordingDescription, videoDescription } from '../src/media.js';
import type { TgCallsOptions } from '../src/types.js';

/**
 * #24 regression/research probe. Run separately: node --import tsx test/media-support.ts
 * All ffmpeg/ffprobe children finish BEFORE new NTgCalls(): spawning children with
 * native workers alive can deadlock. No Telegram client, credentials or live join.
 * Native FILE accepting a compressed path is explicitly NOT decoder evidence.
 */
const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'tgcalls-media-'));
const opts: TgCallsOptions = {
  client: {} as never,
  ffmpegPath: process.env.TGCALLS_TEST_FFMPEG ?? 'ffmpeg',
  ffprobePath: process.env.TGCALLS_TEST_FFPROBE ?? 'ffprobe',
};
const width = 160;
const height = 90;
const fps = 10;
const videoFrameBytes = width * height * 3 / 2;
const audioFrameBytes = 48000 * 2 * 2 / 100;
let nativeStarted = false;

function run(binary: string, args: string[], shell = false): Buffer {
  assert.equal(nativeStarted, false, 'ffmpeg/ffprobe must finish before native workers');
  const result = spawnSync(binary, args, {
    shell, timeout: 20_000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `${binary}: signal ${result.signal}`);
  assert.equal(result.status, 0, `${binary} ${args.join(' ')}\n${result.stderr?.toString()}`);
  return result.stdout;
}

function dependencyError(error: unknown, binary: string, option: string): boolean {
  assert.ok(error instanceof TgCallsError, 'missing executable must be a typed TgCallsError');
  assert.match(error.message, new RegExp(binary, 'i'));
  assert.match(error.message, new RegExp(option));
  assert.ok(error.message.includes('missing-media-binary'), 'error must identify the configured executable');
  return true;
}

async function missingDependencies(): Promise<void> {
  const missing = path.join(dir, 'missing-media-binary');
  const source = { kind: 'file' as const, path: path.join(dir, 'fixture.mp4') };
  const absent = { ...opts, ffmpegPath: missing, ffprobePath: missing };
  assert.throws(() => audioDescription(source, absent), (e: unknown) => dependencyError(e, 'ffmpeg', 'ffmpegPath'));
  assert.throws(() => audioDescription({ kind: 'url', url: 'https://example.invalid/media.mp4' }, absent),
    (e: unknown) => dependencyError(e, 'ffmpeg', 'ffmpegPath'));
  assert.throws(() => videoDescription(source, { width, height, fps }, absent),
    (e: unknown) => dependencyError(e, 'ffmpeg', 'ffmpegPath'));
  assert.throws(() => recordingDescription(path.join(dir, 'record.wav'), 48000, 1, missing),
    (e: unknown) => dependencyError(e, 'ffmpeg', 'ffmpegPath'));
  await assert.rejects(() => probeVideo(source.path, absent),
    (e: unknown) => dependencyError(e, 'ffprobe', 'ffprobePath'));
  assert.equal(audioDescription({ kind: 'shell', command: 'caller-owned-raw-pcm' }, absent).input,
    'caller-owned-raw-pcm', 'a caller-owned raw shell source does not require ffmpeg');
  console.log('PASS missing dependencies: typed errors before native sources; caller-owned shell preserved');
}

async function main(): Promise<void> {
  console.log(run(opts.ffmpegPath!, ['-version']).toString().split('\n')[0]);
  console.log(run(opts.ffprobePath!, ['-version']).toString().split('\n')[0]);
  // Keep the research checks observable while the separately-owned dependency
  // guard is RED. Retain and rethrow that failure: it can never become a pass.
  let dependencyFailure: unknown;
  try {
    await missingDependencies();
  } catch (error: unknown) {
    dependencyFailure = error;
    console.error('FAIL missing-dependency guard (reported again after media probes):', error);
  }

  const fixtures = [
    { extension: 'mp4', codecs: ['h264', 'aac'], encoder: ['-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac'] },
    { extension: 'webm', codecs: ['vp9', 'opus'], encoder: ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus'] },
    { extension: 'mkv', codecs: ['hevc', 'aac'], encoder: ['-c:v', 'libx265', '-x265-params', 'pools=none:frame-threads=1:log-level=error', '-c:a', 'aac'] },
  ];
  for (const fixture of fixtures) {
    const file = path.join(dir, `fixture.${fixture.extension}`);
    // Synthetic one-second inputs, really encoded and then decoded by ffmpeg.
    run(opts.ffmpegPath!, ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=${fps}`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '1', '-map', '0:v:0', '-map', '1:a:0', ...fixture.encoder,
      '-threads', '1', '-pix_fmt', 'yuv420p', '-ac', '2', file]);
    const metadata = JSON.parse(run(opts.ffprobePath!, [
      '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
    ]).toString()) as { streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }> };
    for (const codec of fixture.codecs) {
      assert.ok(metadata.streams.some((s) => s.codec_name === codec), `${fixture.extension} contains ${codec}`);
    }
    assert.ok(metadata.streams.some((s) => s.codec_type === 'video' && s.width === width && s.height === height));
    const source = { kind: 'file' as const, path: file };
    const dimensions = await probeVideo(file, opts, { width, height, fps });
    assert.deepEqual(dimensions, { width, height, fps });
    const audio = audioDescription(source, opts);
    const video = videoDescription(source, dimensions, opts);
    assert.equal(audio.mediaSource, MediaSource.SHELL, 'wrapper file audio uses the real ffmpeg shell decoder');
    assert.equal(video.mediaSource, MediaSource.SHELL, 'wrapper file video uses the real ffmpeg shell decoder');
    const pcm = run(audio.input, [], true);
    const i420 = run(video.input, [], true);
    assert.equal(pcm.length % 4, 0, 's16le stereo sample alignment');
    assert.ok(pcm.length >= 48000 * 4 * 0.9 && pcm.length <= 48000 * 4 * 1.2,
      `${fixture.extension} PCM duration should be approximately one second`);
    let peak = 0;
    for (let i = 0; i < pcm.length; i += 2) {peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));}
    assert.ok(peak > 100, `${fixture.extension} decoded audio is not silence`);
    assert.equal(i420.length, videoFrameBytes * fps, 'ten complete decoded I420 frames');
    assert.ok(new Set(i420.subarray(0, width * height)).size > 16, 'decoded luma has test pattern detail');
    console.log(JSON.stringify({ test: 'ffmpeg-container-decode', container: fixture.extension,
      codecs: fixture.codecs, width, height, fps, pcmBytes: pcm.length, pcmPeak: peak,
      i420Bytes: i420.length, videoFrames: i420.length / videoFrameBytes,
      sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
    if (fixture.extension === 'mp4') {
      fs.writeFileSync(path.join(dir, 'audio.s16le'), pcm.subarray(0, Math.floor(pcm.length / audioFrameBytes) * audioFrameBytes));
      fs.writeFileSync(path.join(dir, 'video.i420'), i420);
    }
  }
  // Corrupt container fails a real decode; a resolved configuration promise cannot
  // replace this check. The shell invocation is still before native workers.
  const corrupt = path.join(dir, 'corrupt.mp4');
  fs.writeFileSync(corrupt, 'This is not a media container.');
  const rejected = spawnSync(audioDescription({ kind: 'file', path: corrupt }, opts).input, {
    shell: true, timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(rejected.error);
  assert.equal(rejected.signal, null);
  assert.notEqual(rejected.status, 0, 'ffmpeg rejects an invalid compressed source');
  assert.equal(rejected.stdout.length, 0);
  console.log(`PASS corrupt container: ffmpeg exit=${rejected.status}, decodedBytes=${rejected.stdout.length}`);

  const require = createRequire(import.meta.url);
  const nativePackage = JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve('ntgcalls')), 'package.json'), 'utf8')) as { version: string };
  assert.equal(nativePackage.version, '3.0.7', 're-evaluate the pinned decoder limits when upgrading ntgcalls');
  assert.equal(NTgCalls.ping(), 'pong');
  setLogLevel(LogLevel.SILENT);
  nativeStarted = true;
  const native = new NTgCalls();
  const ids: bigint[] = [];
  const create = async () => {
    const id = 2400n + BigInt(ids.length);
    await native.createP2pCall(id);
    ids.push(id);
    return id;
  };
  const mic = { mediaSource: MediaSource.FILE, input: path.join(dir, 'audio.s16le'),
    sampleRate: 48000, channelCount: 2, keepOpen: false };
  const camera = { mediaSource: MediaSource.FILE, input: path.join(dir, 'video.i420'),
    width, height, fps, keepOpen: false };
  try {
    const rawId = await create();
    await native.setStreamSources(rawId, StreamMode.CAPTURE, { microphone: mic, camera });
    console.log('PASS native FILE: raw s16le stereo 48000Hz + I420 160x90@10 configured (offline; no delivered-frame claim)');
    for (const mode of [StreamMode.CAPTURE, StreamMode.PLAYBACK]) {
      const id = await create();
      await assert.rejects(() => native.setStreamSources(id, mode,
        { microphone: { ...mic, mediaSource: MediaSource.FFMPEG } }),
      (e: unknown) => e instanceof Error && e.message === 'FFmpeg encoder is not yet supported');
      console.log(`PASS native FFMPEG ${mode === StreamMode.CAPTURE ? 'CAPTURE' : 'PLAYBACK'}: FFmpeg encoder is not yet supported`);
    }
    const videoId = await create();
    await assert.rejects(() => native.setStreamSources(videoId, StreamMode.CAPTURE,
      { camera: { ...camera, mediaSource: MediaSource.FFMPEG } }),
    (e: unknown) => e instanceof Error && e.message === 'FFmpeg encoder is not yet supported');
    console.log('PASS native FFMPEG video CAPTURE: FFmpeg encoder is not yet supported');
    const counterexampleId = await create();
    await native.setStreamSources(counterexampleId, StreamMode.CAPTURE,
      { microphone: { ...mic, input: path.join(dir, 'fixture.mp4') } });
    console.log('COUNTEREXAMPLE native FILE accepted compressed MP4 configuration; this is NOT container decoding or playback evidence');
  } finally {
    for (const id of ids) {await native.stop(id);}
  }
  if (dependencyFailure !== undefined) {throw dependencyFailure;}
  console.log(`MEDIA SUPPORT PASS ntgcalls=${nativePackage.version}; ffmpeg decoded mp4/webm/mkv before native workers; no Telegram/live playback tested`);
}

const deadline = setTimeout(() => {console.error('media-support probe exceeded 90 seconds'); process.exit(124);}, 90_000);
main().then(() => {
  clearTimeout(deadline);
  fs.rmSync(dir, { recursive: true, force: true });
  // NTgCalls owns native worker loops; all calls above have been stopped.
  process.exit(0);
}, (error: unknown) => {
  clearTimeout(deadline);
  console.error(error);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
