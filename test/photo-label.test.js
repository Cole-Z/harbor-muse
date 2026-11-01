const test = require('node:test'); const assert = require('node:assert');
const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
const { typePhoto, TYPE_PHOTO_CAPTION } = require('../lib/shipPhoto');
const SENT = 'Representative vessel-type photo — not this specific ship';
test('type fallback carries the full representative-photo caption', () => {
  assert.strictEqual(TYPE_PHOTO_CAPTION, SENT);
  for (const k of ['cargo', 'tanker', 'bogus']) { const p = typePhoto(k); assert.strictEqual(p.match, 'type'); assert.strictEqual(p.attribution, SENT); }
});
test('client: Commons hits render attribution link only; badge only in the type branch', () => {
  const line = html.match(/cap\.textContent='';if\(p\.match==='name'[^\n]*/)[0];
  const [commons, fallback] = line.split('}else{');
  assert.match(commons, /a\.textContent=p\.attribution\+/); assert.doesNotMatch(commons, /pbadge|Not this ship/);
  assert.match(fallback, /className='pbadge'/); assert.match(fallback, /Not this ship/); assert.match(fallback, /p\.attribution/);
  assert.doesNotMatch(html, /Type photo \(not this vessel\)/);
});
test('badge is small (11px) and high contrast', () => {
  assert.match(html, /#sPhoto \.pbadge\{[^}]*font-size:11px[^}]*background:#1e293b;color:#fff/);
});
