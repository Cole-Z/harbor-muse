const test = require('node:test'), assert = require('node:assert');
const geo = require('../lib/geo');

test('validLoc rejects nonsense and non-US', () => {
  assert.ok(geo.validLoc(37.8, -122.4));
  for (const [a, b] of [[NaN, 1], ['37', -122], [91, 0], [51.5, -0.1], [null, null]]) assert.ok(!geo.validLoc(a, b));
});

test('SF viewer adds a ~0.4° box next to the CC box', () => {
  let t = 0; const v = geo.makeViewers(() => t);
  assert.deepStrictEqual(v.boxes(), [geo.CC_BOX]);
  assert.ok(v.set('a', 37.8, -122.4));
  assert.deepStrictEqual(v.boxes(), [geo.CC_BOX, [[37.6, -122.6], [38, -122.2]]]);
  v.set('b', 37.81, -122.41); // same snapped box -> deduped
  assert.strictEqual(v.boxes().length, 2);
  t = 11 * 60e3; assert.deepStrictEqual(v.boxes(), [geo.CC_BOX]); // expired
});

test('subscriber: change-only, ≤1/s, queued latest wins', () => {
  let t = 0; const sent = [], timers = [];
  const s = geo.makeSubscriber((b) => sent.push(b), { now: () => t, setT: (f, ms) => timers.push([f, t + ms]) });
  s.update([1]); assert.strictEqual(sent.length, 1);
  s.update([1]); assert.strictEqual(sent.length, 1);            // unchanged
  t = 100; s.update([2]); s.update([3]); assert.strictEqual(sent.length, 1); // throttled + queued
  assert.strictEqual(timers.length, 1); assert.strictEqual(timers[0][1], 1000);
  t = 1000; timers[0][0](); assert.deepStrictEqual(sent, [[1], [3]]);
  s.reset(); s.update([3]); assert.strictEqual(sent.length, 3); // reconnect resends immediately
});
