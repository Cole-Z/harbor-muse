const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const { makeShipPhoto, usableName, typePhoto, KINDS } = require('../lib/shipPhoto');
const { makeLimiter } = require('../lib/ask');

const page = (title, lic, desc = '', artist = 'Jane Doe') => ({ index: 1, title, imageinfo: [{ url: 'https://upload.wikimedia.org/x.jpg', thumburl: 'https://upload.wikimedia.org/t.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(title), extmetadata: { LicenseShortName: { value: lic }, ImageDescription: { value: desc }, Artist: { value: `<a href="#">${artist}</a>` } } }] });
const fake = (pages) => { const f = async () => { f.calls++; return { ok: true, json: async () => ({ query: { pages: Object.fromEntries(pages.map((p, i) => [i, p])) } }) }; }; f.calls = 0; return f; };

test('usableName rejects empty/UNKNOWN/short/numeric names', () => {
  for (const n of ['', null, 'UNKNOWN', 'A', 'ABC', '123456789', 'ship']) assert.strictEqual(usableName(n), null, String(n));
  assert.strictEqual(usableName('  Ever given!'), 'EVER GIVEN');
});

test('named match: free license + word-bounded substring', async () => {
  const p = await makeShipPhoto({ fetchFn: fake([page('File:Ever Given in Suez.jpg', 'CC BY-SA 4.0')]) })('Ever Given', 'cargo');
  assert.strictEqual(p.match, 'name'); assert.strictEqual(p.license, 'CC BY-SA 4.0');
  assert.match(p.attribution, /^Photo: Jane Doe \/ Wikimedia Commons$/); assert.ok(p.thumbUrl && p.url);
});

test('non-free license or weak match falls back to type photo', async () => {
  const a = await makeShipPhoto({ fetchFn: fake([page('File:Ever Given.jpg', 'All rights reserved')]) })('Ever Given', 'cargo');
  assert.deepStrictEqual(a, typePhoto('cargo'));
  const b = await makeShipPhoto({ fetchFn: fake([page('File:Forever Givenchy.jpg', 'CC0')]) })('Ever Given', 'tanker');
  assert.strictEqual(b.match, 'type'); assert.strictEqual(b.url, '/assets/ship-photos/tanker.webp');
  const c = await makeShipPhoto({ fetchFn: async () => { throw new Error('offline'); } })('Ever Given', 'tug');
  assert.strictEqual(c.url, '/assets/ship-photos/tug.webp');
});

test('generic name skips Commons entirely; unknown kind -> unknown.webp', async () => {
  const f = fake([]); const p = await makeShipPhoto({ fetchFn: f })('UNKNOWN', 'spaceship');
  assert.strictEqual(f.calls, 0); assert.strictEqual(p.url, '/assets/ship-photos/unknown.webp');
  assert.strictEqual(p.attribution, 'Type photo (not this vessel)');
});

test('cache ~24h by normalized name', async () => {
  let t = 0; const f = fake([page('File:Ever Given.jpg', 'Public domain')]); const look = makeShipPhoto({ fetchFn: f, now: () => t });
  await look('Ever Given', 'cargo'); await look('ever-given', 'cargo'); assert.strictEqual(f.calls, 1);
  t = 25 * 3600e3; await look('Ever Given', 'cargo'); assert.strictEqual(f.calls, 2);
});

test('rate limit 30/min/IP', () => {
  const l = makeLimiter(30, 60e3);
  for (let i = 0; i < 30; i++) assert.ok(l.take('1.2.3.4', 1000));
  assert.strictEqual(l.take('1.2.3.4', 1000), false); assert.ok(l.take('5.6.7.8', 1000));
  assert.ok(l.take('1.2.3.4', 61001));
});

test('all six type WebPs are bundled', () => {
  for (const k of KINDS) { const b = fs.readFileSync(path.join(__dirname, '..', 'public/assets/ship-photos', k + '.webp')); assert.strictEqual(b.subarray(8, 12).toString(), 'WEBP'); }
});
