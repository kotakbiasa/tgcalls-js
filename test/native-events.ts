import assert from 'node:assert/strict';
import { NativeEventRouter } from '../src/native-events.js';

const registered = new Map<string, (...args: any[]) => void>();
let wires = 0;
const native = {
  onFrames: (cb: (...args: any[]) => void) => {wires++; registered.set('frames', cb);},
  onConnectionChange: (cb: (...args: any[]) => void) => {registered.set('connectionChange', cb);},
};
const errors: unknown[] = [];
const router = new NativeEventRouter(native as never, (error) => errors.push(error));
const seen: string[] = [];
const stopGroup = router.on('frames', (id) => {seen.push(`group:${id}`);});
const stopP2p = router.on('frames', async (id) => {seen.push(`p2p:${id}`);});
router.on('frames', () => {throw new Error('observer failed');});
registered.get('frames')!(7n, 1, 2, []);
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(seen, ['group:7', 'p2p:7']);
assert.equal(wires, 1, 'all consumers share one actual native callback');
assert.equal(errors.length, 1, 'one bad observer is reported and does not block others');
stopP2p();
seen.length = 0;
registered.get('frames')!(8n, 1, 2, []);
assert.deepEqual(seen, ['group:8']);
stopGroup();
router.dispose();
seen.length = 0;
registered.get('frames')!(9n, 1, 2, []);
assert.deepEqual(seen, [], 'disposed callbacks cannot receive late native events');
assert.throws(() => router.on('frames', () => {}), /disposed/i);
console.log('Native event router: one registration, independent consumers, errors and teardown passed.');
