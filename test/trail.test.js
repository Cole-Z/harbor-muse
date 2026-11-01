const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const trail = require('../lib/trail');
const { ingest, trailOf } = require('../server');
const H = 60 * 60e3;

test('longer defaults: 240 points / 2 h / 15 m step', () => {
  assert.strictEqual(trail.MAX, 240); assert.strictEqual(trail.AGE_MS, 2 * H); assert.strictEqual(trail.MIN_STEP_M, 15);
});
test('ring buffer caps at MAX points, dropping oldest', () => {
  const s = {}; for (let i = 0; i < 300; i++) trail.push(s, 27 + i / 1000, -97, 1000 + i);
  assert.strictEqual(s.trail.length, 240); assert.strictEqual(s.trail[0].lat, 27.06);
});
test('points older than 2 h are trimmed; stationary ship does not pile up', () => {
  const s = {}; trail.push(s, 27, -97, 0); trail.push(s, 27.1, -97, 60 * 60e3);
  trail.push(s, 27.1, -97, 61 * 60e3); assert.strictEqual(s.trail.length, 2);
  assert.deepStrictEqual(trail.trim(s, 2.1 * H).map((p) => p.lat), [27.1]);
  assert.strictEqual(trail.trim(s, 4 * H).length, 0);
});
test('sub-15 m jitter refreshes the last point instead of adding zigzags', () => {
  const s = {}; trail.push(s, 27, -97, 0);
  trail.push(s, 27.00005, -97.00005, 1000); trail.push(s, 26.99996, -97, 2000);
  assert.strictEqual(s.trail.length, 1); assert.strictEqual(s.trail[0].t, 2000);
  trail.push(s, 27.001, -97, 3000); assert.strictEqual(s.trail.length, 2);
});
test('ingest feeds the trail; trailOf returns {lat,lon,t}', () => {
  const store = new Map(), pos = (lat, t) => ingest(store, { MessageType: 'PositionReport', MetaData: { MMSI: 367000001 },
    Message: { PositionReport: { Latitude: lat, Longitude: -97.2, Sog: 5, Cog: 90, TrueHeading: 90 } } }, t);
  pos(27.7, 1000); pos(27.71, 2000);
  assert.deepStrictEqual(trailOf(store.get(367000001), 3000), [{ lat: 27.7, lon: -97.2, t: 1000 }, { lat: 27.71, lon: -97.2, t: 2000 }]);
});
test('client draws only the selected ship trail with subtle fading styling', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /fetch\('\/ships\/'\+id\+'\/trail'/);
  assert.match(html, /lineMetrics:true/); assert.match(html, /'line-gradient'/);
  assert.match(html, /id:'trail-case'/); assert.doesNotMatch(html, /'#d00'/);
});
