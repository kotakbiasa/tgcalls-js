import assert from 'node:assert/strict';
import { StreamMode, StreamType } from 'ntgcalls';
import { TgCallsClient, pcmCommand, videoDescription } from '../src/index.js';

// 1. pcmCommand & videoDescription filter generation
{
  const opts = { client: {} as never };
  const plain = pcmCommand({ kind: 'file', path: '/tmp/song.mp3' }, opts);
  assert.ok(!plain.includes('-ss ') && !plain.includes('-af '), 'default playback keeps clean ffmpeg command');

  const filtered = pcmCommand({ kind: 'file', path: '/tmp/song.mp3' }, opts, {
    startSec: 42.5,
    volume: 150,
    speed: 1.25,
  });
  assert.ok(filtered.includes('-ss 42.5 -i '), 'seek places -ss before -i');
  assert.ok(filtered.includes('-af volume=1.5,atempo=1.25 '), 'volume and speed combined in -af');

  const vid = videoDescription({ kind: 'file', path: '/tmp/v.mp4' }, { width: 640, height: 360, fps: 25 }, opts, {
    startSec: 12,
    speed: 2,
  });
  assert.ok(vid.input.includes('-ss 12 -i '), 'video seek places -ss before -i');
  assert.ok(vid.input.includes('-vf setpts=0.5*PTS,scale=640:360'), 'video speed adjusts PTS');
}

// 2. TgCallsClient seek / setVolume / setSpeed / setLoop ('one' & 'all')
{
  const chatId = -1007778889990n;
  const sources: string[] = [];
  let streamEndCb: ((id: bigint, type: StreamType) => void) | undefined;
  let fakeTime = 15;

  const adapter: any = {
    isAdapter: true,
    resolveChatId: async () => chatId,
    getGroupCall: async () => ({ id: 1n, accessHash: 2n }),
    joinGroupCall: async () => ({ params: '{"transport":"fixture"}' }),
    leaveGroupCall: async () => {},
    joinPresentationCall: async () => {},
    leavePresentationCall: async () => {},
    extractConnectionParams: (r: any) => r.params,
    installUpdateHandler: () => () => {},
    dispose: () => {},
  };

  const tg = new TgCallsClient({ client: adapter });
  for (const [name, fn] of Object.entries({
    createCall: async () => '{"ssrc":321}',
    connect: async () => {},
    stop: async () => {},
    time: async () => BigInt(fakeTime),
    setStreamSources: async (_id: bigint, mode: StreamMode, media: any) => {
      if (mode === StreamMode.CAPTURE && media?.microphone?.input) {
        sources.push(media.microphone.input);
      }
    },
    onStreamEnd: (cb: typeof streamEndCb) => { streamEndCb = cb; },
    onConnectionChange: () => {},
    onRemoteSourceChange: () => {},
  })) {
    Object.defineProperty(tg.ntg, name, { configurable: true, value: fn });
  }

  try {
    await tg.play(chatId, { kind: 'file', path: '/tmp/track1.mp3' });
    await tg.enqueue(chatId, { kind: 'file', path: '/tmp/track2.mp3' });

    assert.deepEqual(tg.getPlaybackControls(chatId), { volume: 100, speed: 1, loop: 'off', filter: 'off' });

    await tg.seek(chatId, 30);
    assert.ok(sources.at(-1)!.includes('-ss 30 -i '));

    await tg.setVolume(chatId, 60);
    assert.equal(tg.getPlaybackControls(chatId).volume, 60);
    assert.ok(sources.at(-1)!.includes('-ss 15 -i '), 'setVolume resumes near current time()');
    assert.ok(sources.at(-1)!.includes('-af volume=0.6 '));

    await tg.setSpeed(chatId, 1.5);
    assert.equal(tg.getPlaybackControls(chatId).speed, 1.5);
    assert.ok(sources.at(-1)!.includes('-af volume=0.6,atempo=1.5 '));

    await tg.setAudioFilter(chatId, 'bassboost');
    assert.equal(tg.getAudioFilter(chatId), 'bassboost');
    assert.ok(sources.at(-1)!.includes('equalizer=f=60:width_type=h:width=50:g=10'));

    await tg.setAudioFilter(chatId, { custom: 'aecho=0.8:0.9:1000:0.3' });
    assert.ok(sources.at(-1)!.includes('aecho=0.8:0.9:1000:0.3'));

    await tg.setAudioFilter(chatId, 'off');
    assert.equal(tg.getAudioFilter(chatId), 'off');

    // Advanced queue manipulation: playNext, moveQueueTrack, removeQueueTrack, shuffleQueue
    await tg.playNext(chatId, { kind: 'file', path: '/tmp/priority.mp3' });
    assert.equal((tg.getQueue(chatId)[0] as any).path, '/tmp/priority.mp3');
    assert.equal(await tg.moveQueueTrack(chatId, 0, 1), true);
    assert.equal((tg.getQueue(chatId)[1] as any).path, '/tmp/priority.mp3');
    await tg.shuffleQueue(chatId);
    assert.equal(tg.getQueue(chatId).length, 2);
    const removed = await tg.removeQueueTrack(chatId, tg.getQueue(chatId).findIndex((t: any) => t.path === '/tmp/priority.mp3'));
    assert.equal((removed as any)?.path, '/tmp/priority.mp3');
    assert.equal(tg.getQueue(chatId).length, 1);

    await assert.rejects(() => tg.seek(chatId, -1), /non-negative/i);
    await assert.rejects(() => tg.setVolume(chatId, 250), /between 0 and 200/i);
    await assert.rejects(() => tg.setSpeed(chatId, 3), /between 0\.5 and 2\.0/i);
    await assert.rejects(() => tg.setAudioFilter(chatId, { custom: '' }), /non-empty/i);

    // loop = 'one': replays track1 without consuming track2 from queue
    await tg.setLoop(chatId, 'one');
    assert.equal(tg.getLoop(chatId), 'one');
    streamEndCb!(chatId, StreamType.AUDIO);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(tg.getCurrent(chatId), { kind: 'file', path: '/tmp/track1.mp3' });
    assert.equal(tg.getQueue(chatId).length, 1);

    // loop = 'all': rotates track1 to back and plays track2
    await tg.setLoop(chatId, 'all');
    streamEndCb!(chatId, StreamType.AUDIO);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(tg.getCurrent(chatId), { kind: 'file', path: '/tmp/track2.mp3' });
    assert.deepEqual(tg.getQueue(chatId), [{ kind: 'file', path: '/tmp/track1.mp3' }]);

    await tg.leave(chatId);
    assert.deepEqual(tg.getPlaybackControls(chatId), { volume: 100, speed: 1, loop: 'off', filter: 'off' });
  } finally {
    await tg.dispose();
  }
}

console.log('Playback controls (seek, setVolume, setSpeed, setLoop one/all) passed.');
