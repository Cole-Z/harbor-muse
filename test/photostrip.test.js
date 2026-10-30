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
test('photo strip is ~72px on phone and ~96px on wide screens', () => {
  const css = html.match(/#sPhoto\{[^]*?#sPhoto a\{[^}]*\}/)[0];
  assert.match(css, /#sPhoto img\{[^}]*height:72px/);
  assert.match(css, /@media\(min-width:768px\)\{#sPhoto img\{height:96px\}\}/);
  assert.doesNotMatch(css, /height:140px/);
});
test('hidden photo strip is display:none so it does not take card space', () => {
  assert.match(html, /#sPhoto\[hidden\]\{display:none!important\}/);
});
