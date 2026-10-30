const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const { MID, midOf, flagOf, flagEmoji } = require('../public/mmsimid.js');
const { typeLabel } = require('../public/shiptype.js');

test('bundled MID table matches data/mmsiMid.json', () => {
  assert.deepStrictEqual(MID, JSON.parse(fs.readFileSync(path.join(__dirname, '../data/mmsiMid.json'), 'utf8')));
  assert.ok(Object.keys(MID).length > 250);
});
test('MMSI -> flag', () => {
  assert.deepStrictEqual(flagOf(366123456), { mid: '366', iso: 'US', country: 'United States', flag: '🇺🇸' });
  assert.strictEqual(flagOf('636012345').country, 'Liberia');
  assert.strictEqual(flagOf(351000001).country, 'Panama');
  assert.strictEqual(midOf('003669999'), '366'); assert.strictEqual(midOf('036699999'), '366');
  assert.strictEqual(midOf(111232001), '232'); assert.strictEqual(midOf(992351234), '235');
  for (const m of [null, 12345, 'abc', 800000000, 299123456, 1e10]) assert.strictEqual(flagOf(m), null, String(m));
  assert.strictEqual(flagEmoji('x'), '');
});
test('readable AIS type labels', () => {
  assert.strictEqual(typeLabel(70), 'Cargo'); assert.strictEqual(typeLabel(71), 'Cargo (hazardous cat. A)');
  assert.strictEqual(typeLabel(79), 'Cargo'); assert.strictEqual(typeLabel(84), 'Tanker (hazardous cat. D)');
  assert.strictEqual(typeLabel(52), 'Tug'); assert.strictEqual(typeLabel(37), 'Pleasure craft');
  assert.strictEqual(typeLabel(55), 'Law enforcement'); assert.strictEqual(typeLabel(15), 'Type 15');
  for (const t of [0, null, undefined, 'x', 100, -1]) assert.strictEqual(typeLabel(t), null);
});
