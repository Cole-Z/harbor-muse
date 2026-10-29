const test = require('node:test'), assert = require('node:assert');
const trail = require('../lib/trail');
const { ingest, trailOf } = require('../server');

test('ring buffer caps at 20 points', () => {
  const s = {}; for (let i = 0; i < 30; i++) trail.push(s, 27 + i / 100, -97, 1000 + i);
  assert.strictEqual(s.trail.length, 20); assert.strictEqual(s.trail[0].lat, 27.1);
});
test('points older than 15 min are trimmed; stationary ship does not pile up', () => {
  const s = {}; trail.push(s, 27, -97, 0); trail.push(s, 27.1, -97, 10 * 60e3);
  trail.push(s, 27.1, -97, 11 * 60e3); assert.strictEqual(s.trail.length, 2);
  assert.deepStrictEqual(trail.trim(s, 16 * 60e3).map((p) => p.lat), [27.1]);
  assert.strictEqual(trail.trim(s, 40 * 60e3).length, 0);
});
test('ingest feeds the trail; trailOf returns {lat,lon,t}', () => {
  const store = new Map(), pos = (lat, t) => ingest(store, { MessageType: 'PositionReport', MetaData: { MMSI: 367000001 },
    Message: { PositionReport: { Latitude: lat, Longitude: -97.2, Sog: 5, Cog: 90, TrueHeading: 90 } } }, t);
  pos(27.7, 1000); pos(27.71, 2000);
  assert.deepStrictEqual(trailOf(store.get(367000001), 3000), [{ lat: 27.7, lon: -97.2, t: 1000 }, { lat: 27.71, lon: -97.2, t: 2000 }]);
});
