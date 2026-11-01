const test = require('node:test'); const assert = require('node:assert');
const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
test('Technical details collapses AIS extras + ids under details/summary', () => {
  assert.match(html, /<details id="sTech"><summary>Technical details<\/summary><p id="sExtra" hidden><\/p><p id="sIds"><\/p><\/details>/);
  assert.match(html, /\$\('sIds'\)\.textContent='MMSI '\+s\.mmsi/);
  assert.match(html, /function openCard\(mmsi\)\{if\(String\(mmsi\)!==String\(selected\)\)\$\('sTech'\)\.open=false/);
});
test('divider "Now talking about" when vessel changes, on both Ask and Explain', () => {
  assert.match(html, /function noteTopic\(id\)\{[^}]*if\(id===talkId\)return/);
  assert.match(html, /askBubble\('topic','Now talking about '\+/);
  assert.match(html, /const id=askId\(\);syncAskMeta\(\);noteTopic\(id\);/);
  assert.match(html, /openAsk\(sid\);noteTopic\(sid\);/);
});
test('Ask/Explain bind to open card ship', () => {
  assert.match(html, /function openCard\(mmsi\)\{[^}]*selected=mmsi;askMmsi=mmsi;/);
  assert.match(html, /function openAsk\(mmsi\)\{startCompass\(\);askMmsi=selected\|\|mmsi\|\|null;/);
  assert.match(html, /think\.dataset\.mmsi=sid/);
  assert.match(html, /b\.disabled=!ok\|\|!!tmBusy/);
});
test('noteTopic logic: silent first, divider on change, none on repeat', () => {
  const src = html.match(/let talkId=null;\n(function noteTopic[^\n]*)/)[1];
  const log = { lastChild: null, kids: [] };
  const $ = () => log, ships = { 1: { name: 'ALPHA' } };
  const askBubble = (c, t) => { const n = { c, t, dataset: {}, setAttribute() {} }; log.kids.push(n); log.lastChild = n; return n; };
  const f = new Function('$', 'ships', 'askBubble', 'let talkId=null;' + src + ';return noteTopic;')($, ships, askBubble);
  f(1); assert.equal(log.kids.length, 0); log.lastChild = {};
  f(1); assert.equal(log.kids.length, 0);
  f(2); assert.equal(log.kids.at(-1).t, 'Now talking about MMSI 2');
  f(1); assert.equal(log.kids.at(-1).t, 'Now talking about ALPHA');
});
