// Regression: the photo <img> lives in a hidden <figure>; lazy-loaded images that aren't rendered never load,
// so onload never fired and the strip stayed hidden forever.
const test = require('node:test'); const assert = require('node:assert');
const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
test('photo img is not lazy-loaded (it starts inside a hidden figure)', () => {
  const img = html.match(/<img id="sPhotoImg"[^>]*>/)[0];
  assert.ok(!/loading="lazy"/.test(img), img);
});
test('photo strip sits after the card fields and before the ask button', () => {
  const dl = html.indexOf('<dd id="sAge">'), fig = html.indexOf('<figure id="sPhoto"'), ask = html.indexOf('id="askAbout"');
  assert.ok(dl > 0 && dl < fig && fig < ask);
});
