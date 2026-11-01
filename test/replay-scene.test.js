const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const st = require('../public/scenetime');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const T = '2026-11-01T12:23:00Z', t = st.clock(T);

test('replay badge: REPLAY + Corpus Christi demo + scene time, never LIVE', () => {
  assert.ok(t && /\d:\d\d/.test(t));
  const b = st.badgeText('replay', true, T);
  assert.strictEqual(b, 'REPLAY · Corpus Christi demo · Scene ' + t);
  assert.ok(!/LIVE|now/.test(b));
});
test('live badge: LIVE + as-of time; falls back to now', () => {
  assert.strictEqual(st.badgeText('live', false, T), 'LIVE · as of ' + t);
  assert.strictEqual(st.badgeText('live', true, T), 'LIVE · Corpus Christi · as of ' + t);
  assert.strictEqual(st.badgeText('live', false, 'bad'), 'LIVE · now');
});
test('quiet feed + demoAvailable points at the replay; no auto-switch', () => {
  const Q = 'No live ships here — play the Corpus Christi replay for the demo.';
  assert.strictEqual(st.noteText({ mode: 'waiting', ships: [], note: 'No ships nearby right now', demoAvailable: true }, false), Q);
  assert.strictEqual(st.noteText({ mode: 'live', ships: [], demoAvailable: true }, false), Q);
  assert.strictEqual(st.noteText({ mode: 'waiting', ships: [], note: 'No ships nearby right now', demoAvailable: false }, false), 'No ships nearby right now');
  assert.strictEqual(st.noteText({ mode: 'replay', ships: [{}] }, true), 'Demo: Corpus Christi replay');
  assert.strictEqual(st.noteText({ mode: 'live', ships: [{}] }, false), '');
});
test('UI: demo button shown when demoAvailable, one tap toggles demo + polls', () => {
  assert.match(html, /const nt=noteText\(d,demo\)/);
  assert.match(html, /btn\.style\.display=\(d\.demoAvailable\|\|demo\)\?'inline-block':'none'/);
  assert.match(html, /\$\('demoBtn'\)\.onclick=\(\)=>\{demo=!demo;.*poll\(\)\};/);
  assert.match(html, /Watch Corpus Christi demo \(replay\)/);
});
