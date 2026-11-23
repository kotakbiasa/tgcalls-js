import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { test } from 'node:test';
import { RtmpPublisher } from '../src/rtmp.js';

class Encoder extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  signals: string[] = [];
  exitCode: number | null = null;
  kill(signal = 'SIGTERM') {
    this.signals.push(signal);
    if (signal === 'SIGTERM' || signal === 'SIGKILL') queueMicrotask(() => this.end(null, signal));
    return true;
  }
  end(code: number | null, signal: string | null = null) {
    this.exitCode = code;
    this.emit('close', code, signal);
  }
  progress() { this.stdout.write('frame=1\nout_time_us=100000\nprogress=continue\n'); }
}
function fixture(options: Record<string, unknown> = {}) {
  const encoders: Encoder[] = [];
  const commands: string[][] = [];
  const errors: Error[] = [];
  const publisher = new RtmpPublisher('rtmp://localhost/live', 'private-stream-key', {
    onError: (error: Error) => errors.push(error),
    ...options,
    spawn: (command, args) => {
      commands.push([command, ...args]);
      const encoder = new Encoder();
      encoders.push(encoder);
      return encoder as unknown as ChildProcess;
    },
  });
  return { publisher, encoders, commands };
}
test('RTMP retries are bounded, redact failures and stop cancels backoff', async () => {
  const errors: Error[] = [];
  const { publisher, encoders } = fixture({
    reconnect: { maxAttempts: 2, maxDelayMs: 5, baseDelayMs: 1 },
    onError: (error: Error) => errors.push(error),
  });
  const started = publisher.play(source);
  await turn();
  encoders[0].progress();
  await started;
  for (let i = 0; i < 3; i++) {
    encoders[i].stderr.write('network lost rtmp://localhost/live/private-stream-key\n');
    encoders[i].end(1);
    if (i < 2) {
      for (let n = 0; n < 50 && encoders.length <= i + 1; n++) await new Promise(resolve => setTimeout(resolve, 2));
      assert.equal(encoders.length, i + 2);
      encoders[i + 1].progress();
    }
  }
  await turn();
  assert.equal(publisher.state, 'failed');
  assert.equal(encoders.length, 3, 'retry budget is not reset after progress');
  assert.equal(errors.length, 1);
  assert.ok(!errors[0].message.includes('private-stream-key'));
  await publisher.close();

  const next = fixture({ reconnect: { maxAttempts: 2, maxDelayMs: 200, baseDelayMs: 200 } });
  const pending = next.publisher.play(source);
  const rejected = assert.rejects(pending, /cancel/i);
  await turn();
  next.encoders[0].end(1);
  assert.equal(next.publisher.state, 'reconnecting');
  await next.publisher.stop();
  await rejected;
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.equal(next.encoders.length, 1);
  assert.equal(next.publisher.state, 'stopped');
});

test('RTMP queue, hold, skip, pause, resume and close own encoder lifecycle', async () => {
  const { publisher, encoders, commands } = fixture();
  const started = publisher.play(source);
  await turn(); encoders[0].progress(); await started;
  assert.equal(publisher.queue({ kind: 'file', path: '/media/two.mp4' }), 1);
  publisher.hold({ kind: 'file', path: '/media/hold.mp4' });
  encoders[0].end(0);
  await turn();
  assert.ok(commands[1].includes('/media/two.mp4'));
  encoders[1].progress();
  assert.equal(await publisher.pause(), true);
  assert.equal(publisher.state, 'paused');
  assert.ok(encoders[1].signals.includes('SIGSTOP'));
  assert.equal(await publisher.resume(), true);
  assert.ok(encoders[1].signals.includes('SIGCONT'));
  const skipped = publisher.skip();
  await turn();
  assert.ok(commands[2].includes('/media/hold.mp4'));
  encoders[2].progress(); await skipped;
  encoders[2].end(0);
  await turn();
  assert.ok(commands[3].includes('/media/hold.mp4'), 'hold loops when the queue is empty');
  encoders[3].progress();
  await publisher.close();
  assert.equal(publisher.state, 'stopped');
  await assert.rejects(publisher.play(source), /closed/i);
});

test('RTMP rejects malformed targets, unsupported sources and sanitizes auth errors without retries', async () => {
  assert.throws(() => new RtmpPublisher('https://example.com/live', 'key'), /rtmp/i);
  assert.throws(() => new RtmpPublisher('rtmp://example.com/live', 'key\nsecret'), /key/i);
  const { publisher, encoders } = fixture({ reconnect: { maxAttempts: 3, maxDelayMs: 1 } });
  await assert.rejects(publisher.play({ kind: 'shell', command: 'pcm' }), /file|URL/i);
  await assert.rejects(publisher.play(source, { width: 0, height: 90 }), /width/i);
  const pending = publisher.play(source);
  const rejected = assert.rejects(pending, (error: Error) => {
    assert.match(error.message, /auth|denied/i);
    assert.ok(!error.message.includes('private-stream-key'));
    return true;
  });
  await turn();
  encoders[0].stderr.write('Authentication denied: rtmp://localhost/live/private-stream-key\n');
  encoders[0].end(1);
  await rejected;
  assert.equal(encoders.length, 1);
  assert.equal(publisher.state, 'failed');
  await publisher.close();
});

test('RTMP stop from a state observer cancels startup before spawning', async () => {
  let publisher!: RtmpPublisher;
  const encoders: Encoder[] = [];
  publisher = new RtmpPublisher('rtmp://localhost/live', 'key', {
    onStateChange(state) { if (state === 'starting') void publisher.stop(); },
    spawn() { const encoder = new Encoder(); encoders.push(encoder); return encoder as unknown as ChildProcess; },
  });
  await assert.rejects(publisher.play(source), /cancel/i);
  assert.equal(encoders.length, 0, 'cancellation from an observer must not leave an orphan encoder');
  await publisher.close();
});

test('RTMP concurrent stop and close both await the actual encoder exit', async () => {
  const { publisher, encoders } = fixture({ stopTimeoutMs: 100 });
  const started = publisher.play(source);
  await turn(); encoders[0].progress(); await started;
  encoders[0].kill = (signal = 'SIGTERM') => { encoders[0].signals.push(signal); return true; };
  let stopped = false; let closed = false;
  const stopping = publisher.stop().then(() => { stopped = true; });
  const closing = publisher.close().then(() => { closed = true; });
  await turn();
  assert.equal(stopped, false);
  assert.equal(closed, false, 'close must await an already running stop');
  encoders[0].end(null, 'SIGTERM');
  await Promise.all([stopping, closing]);
});

test('RTMP sanitizes credentials split across stderr chunks', async () => {
  const { publisher, encoders } = fixture({ onError() {} });
  const rejected = assert.rejects(publisher.play(source), (error: Error) => {
    assert.ok(!/private-|stream-key/.test(error.message), error.message);
    return true;
  });
  await turn();
  encoders[0].stderr.write('Authorization failed: rtmp://localhost/live/private-');
  encoders[0].stderr.write('stream-key\n');
  encoders[0].end(1);
  await rejected;
  await publisher.close();
});

test('RTMP readiness timeout rejects with its cause and stop escalates a stuck encoder', async () => {
  const { publisher, encoders } = fixture({ readyTimeoutMs: 10, stopTimeoutMs: 5, onError() {} });
  const timeout = assert.rejects(publisher.play(source), /readiness timeout/i);
  await timeout;
  assert.equal(publisher.state, 'failed');
  assert.ok(encoders[0].signals.includes('SIGTERM'));
  await publisher.close();

  const hung = fixture({ stopTimeoutMs: 5 });
  const started = hung.publisher.play(source);
  await turn(); hung.encoders[0].progress(); await started;
  hung.encoders[0].kill = (signal = 'SIGTERM') => {
    hung.encoders[0].signals.push(signal);
    if (signal === 'SIGKILL') queueMicrotask(() => hung.encoders[0].end(null, signal));
    return true;
  };
  await hung.publisher.stop();
  assert.deepEqual(hung.encoders[0].signals, ['SIGTERM', 'SIGKILL']);
  await hung.publisher.close();
});

test('RTMP real loopback publishes decodable H264/AAC FLV to an ffmpeg listener', { timeout: 25_000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'tgcalls-rtmp-'));
  let publisher: RtmpPublisher | undefined;
  let listener: ReturnType<typeof command> | undefined;
  try {
    const input = join(dir, 'fixture.mp4');
    const output = join(dir, 'received.flv');
    const generated = await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10',
      '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', input]).done;
    assert.equal(generated.code, 0, generated.stderr);
    const server = createServer();
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = (server.address() as { port: number }).port;
    await new Promise<void>(resolve => server.close(() => resolve()));
    listener = command('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-listen', '1', '-i', `rtmp://127.0.0.1:${port}/live/loopback-fixture`,
      '-t', '1.2', '-c', 'copy', '-f', 'flv', '-y', output]);
    for (let i = 0; ; i++) {
      const sockets = await readFile('/proc/net/tcp', 'utf8');
      if (sockets.split('\n').some(line => { const fields = line.trim().split(/\s+/); return fields[1]?.endsWith(`:${port.toString(16).toUpperCase().padStart(4, '0')}`) && fields[3] === '0A'; })) break;
      assert.ok(i < 300, 'ffmpeg listener did not bind its RTMP socket');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    publisher = new RtmpPublisher(`rtmp://127.0.0.1:${port}/live`, 'loopback-fixture', { onError() {}, readyTimeoutMs: 8_000 });
    await publisher.play({ kind: 'file', path: input }, { width: 160, height: 90, fps: 10 });
    assert.equal(publisher.state, 'publishing');
    const received = await listener.done;
    assert.equal(received.code, 0, received.stderr);
    await publisher.close();
    const probe = await command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]).done;
    assert.equal(probe.code, 0, probe.stderr);
    const info = JSON.parse(probe.stdout) as { streams: Array<{ codec_type: string; codec_name: string }>; format: { duration: string; size: string; format_name: string } };
    assert.equal(info.streams.find(stream => stream.codec_type === 'video')?.codec_name, 'h264');
    assert.equal(info.streams.find(stream => stream.codec_type === 'audio')?.codec_name, 'aac');
    assert.equal(info.format.format_name, 'flv');
    assert.ok(Number(info.format.duration) >= 1);
    assert.ok(Number(info.format.size) > 1024);
    const decoded = await command('ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-']).done;
    assert.equal(decoded.code, 0, decoded.stderr);
    t.diagnostic(JSON.stringify({ loopback: true, codecs: info.streams.map(stream => stream.codec_name), ...info.format }));
  } finally {
    await publisher?.close();
    listener?.child.kill('SIGKILL');
    if (listener) await listener.done;
    await rm(dir, { recursive: true, force: true });
  }
});

function command(binary: string, args: string[]) {
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (bytes: Buffer) => { stdout += bytes.toString(); });
  child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString(); });
  const done = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 12_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
  return { child, done };
}

const source = { kind: 'file', path: '/media/one.mp4' } as const;
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

test('RTMP becomes publishing only after real encoder progress', async () => {
  const { publisher, encoders, commands } = fixture();
  assert.equal(publisher.state, 'ready');
  let ready = false;
  const started = publisher.play(source, { width: 160, height: 90, fps: 10 }).then(() => { ready = true; });
  await turn();
  assert.equal(ready, false);
  assert.notEqual(publisher.state, 'publishing');
  encoders[0].stdout.write('out_time_us=0\nprogress=continue\n');
  await turn();
  assert.equal(ready, false, 'a progress marker without media is not readiness');
  encoders[0].progress();
  await started;
  assert.equal(publisher.state, 'publishing');
  for (const arg of ['libx264', 'aac', 'yuv420p', 'flv', 'pipe:1']) assert.ok(commands[0].includes(arg));
  assert.equal(commands[0].at(-1), 'rtmp://localhost/live/private-stream-key');
  await publisher.stop();
  assert.equal(publisher.state, 'stopped');
});
