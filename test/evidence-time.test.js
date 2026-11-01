const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const tm = require('../lib/tellMore'), ask = require('../lib/ask'), st = require('../public/scenetime');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('badge copy separates scene from freshness', () => {
  assert.strictEqual(st.badgeText('replay', true), 'REPLAY · Corpus Christi demo');
  assert.strictEqual(st.badgeText('live', false), 'LIVE · now');
  assert.strictEqual(st.badgeText('waiting'), 'WAITING');
  assert.strictEqual(st.ageLabel('replay'), 'Last fix (replay)');
  assert.strictEqual(st.ageLabel('live'), 'Last position');
  assert.strictEqual(st.ageText(12, false, 'replay'), '12 s ago on replay clock');
  assert.strictEqual(st.ageText(150, true, 'live'), '3 min ago (stale)');
  assert.strictEqual(st.ageText(null, false, 'live'), 'unknown');
});
test('tell-more prompt: labels, conflicts, retrieval-fail, replay scene', () => {
  const r = tm.EVIDENCE_RULES;
  for (const w of ['(Reported)', '(Inferred)', '(Unknown)', 'disagreement', 'AIS data only', 'one sentence']) assert.ok(r.includes(w), w);
  const b = tm.buildBody({ mmsi: 367000001, name: 'SABINE', mode: 'replay', asOf: '2026-11-01T11:00:00Z', ageSec: 42.4 });
  assert.match(b.input, /SCENE mode=replay asOf=2026-11-01T11:00:00Z lastPositionAgeSec=42 \(RECORDED replay scene/);
  assert.match(tm.buildBody({ mmsi: 1, mode: 'live' }).input, /SCENE mode=live\./);
});
test('ask: SYSTEM evidence/time rules + SCENE line', () => {
  for (const w of ['(Reported)', '(Inferred)', '(Unknown)', 'mode=replay', 'disagree']) assert.ok(ask.SYSTEM.includes(w), w);
  const m = ask.userMessage('what is it', null, null, { candidates: [], snapshot: [] }, { mode: 'replay', asOf: 'T' });
  assert.match(m, /\nSCENE: mode=replay asOf=T\n/);
  assert.ok(!ask.userMessage('x', null, null, { candidates: [], snapshot: [] }).includes('SCENE'));
});
test('UI wires labels and scene copy', () => {
  assert.match(html, /<script src="\/scenetime.js"><\/script>/);
  assert.match(html, /\.ev-reported\{/); assert.match(html, /evLabels\(think,d\.answer\)/);
  assert.match(html, /badgeText\(d\.mode,d\.demo,d\.asOf\)/); assert.match(html, /ageText\(s\.ageSec,s\.stale,sceneMode\)/);
});
