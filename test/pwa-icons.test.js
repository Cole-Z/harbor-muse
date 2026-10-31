const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pub = (f) => path.join(__dirname, '..', 'public', f);
function pngSize(f) {
  const b = fs.readFileSync(pub(f));
  assert.strictEqual(b.toString('latin1', 1, 4), 'PNG', f + ' is a PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20), b.length];
}
test('manifest icons are real PNGs at declared sizes', () => {
  const m = JSON.parse(fs.readFileSync(pub('manifest.webmanifest'), 'utf8'));
  for (const i of m.icons) {
    const [w, h, len] = pngSize(i.src.slice(1));
    assert.strictEqual(`${w}x${h}`, i.sizes);
    assert.ok(len > 1500, i.src + ' not a blank placeholder');
  }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});
test('apple-touch-icon is 180px ship mark and precached', () => {
  assert.deepStrictEqual(pngSize('apple-touch-icon.png').slice(0, 2), [180, 180]);
  assert.match(fs.readFileSync(pub('index.html'), 'utf8'), /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon.png"/);
  assert.match(fs.readFileSync(pub('sw.js'), 'utf8'), /'\/apple-touch-icon.png'/);
});
