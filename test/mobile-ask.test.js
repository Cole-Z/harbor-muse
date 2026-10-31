const test = require('node:test'); const assert = require('node:assert');
const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
test('phone breakpoint is <768 and wide rail starts at 768', () => {
  assert.match(html, /@media \(max-width:767px\)\{/);
  assert.match(html, /@media \(min-width:768px\)\{\n  #askPanel\.open\{top:0;right:0;bottom:0;width:min\(400px,42vw\)/);
  assert.doesNotMatch(html, /max-width:699px|min-width:700px/);
});
test('phone Ask mode hides map + card and panel fills visual viewport', () => {
  assert.match(html, /body\.ask-open #map,body\.ask-open #sheet[^{]*\{visibility:hidden\}/);
  assert.match(html, /height:var\(--vvh,100dvh\)/);
  assert.match(html, /visualViewport\.addEventListener\('resize',fitViewport\)/);
});
test('compact chat bubbles 14px on phone', () => {
  assert.match(html, /body\.ask-open #askLog \.me,body\.ask-open #askLog \.ans,body\.ask-open #askLog \.err\{max-width:92%;font-size:14px/);
});
test('chip lives in the Ask top bar and exits Ask mode', () => {
  assert.ok(html.indexOf('id="askChip"') > html.indexOf('id="askHead"') && html.indexOf('id="askChip"') < html.indexOf('id="askX"'));
  assert.match(html, /\$\('askChip'\)\.onclick=\(\)=>\{const id=askId\(\);closeAsk\(\)/);
});
test('selected MMSI still sent on every /ask', () => {
  assert.match(html, /const id=askId\(\);syncAskMeta\(\);[^]*?if\(id\)body\.mmsi=\+id/);
});
