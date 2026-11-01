const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const tm = require('../lib/tellMore');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const ask = require('../lib/ask');

test('validate', () => {
  assert.strictEqual(tm.validate({ mmsi: 367000001, name: 'QUEEN MARY 2', imo: '9241061' }), null);
  for (const b of [null, [], {}, { mmsi: 'x' }, { mmsi: -1 }, { mmsi: 1, name: 'x'.repeat(61) }, { mmsi: 1, imo: '12' }]) assert.ok(tm.validate(b), JSON.stringify(b));
});
test('buildBody matches locked Researcher shape', () => {
  const b = tm.buildBody({ mmsi: 310627000, name: 'QUEEN MARY 2', imo: null });
  assert.strictEqual(b.model, 'muse-spark-1.3');
  assert.match(b.input, /QUEEN MARY 2/); assert.match(b.input, /310627000/);
  assert.deepStrictEqual(b.tools, [{ type: 'web_search', search_context_size: 'medium' }]);
  assert.deepStrictEqual(b.include, ['web_search_call.results']);
  assert.strictEqual(b.max_output_tokens, 2500); assert.deepStrictEqual(b.reasoning, { effort: 'minimal' });
});
const resp = {
  status: 'completed', output: [
    { type: 'web_search_call', status: 'completed', results: [{ url: 'https://x.org/a', title: 'X' }] },
    { type: 'message', content: [{ type: 'output_text', text: ' QM2 is a Cunard liner. ', annotations: [
      { type: 'url_citation', url: 'https://en.wikipedia.org/wiki/Queen_Mary_2', title: 'Queen Mary 2 - Wikipedia' },
      { type: 'url_citation', url: 'https://en.wikipedia.org/wiki/Queen_Mary_2', title: 'dup' },
      { type: 'url_citation', url: 'javascript:alert(1)', title: 'bad' }] }] }] };
test('parseResponse: answer + deduped safe citations', () => {
  assert.deepStrictEqual(tm.parseResponse(resp, 310627000), { answer: 'QM2 is a Cunard liner.', mmsi: 310627000,
    sources: [{ title: 'Queen Mary 2 - Wikipedia', url: 'https://en.wikipedia.org/wiki/Queen_Mary_2' }] });
});
test('parseResponse: falls back to web_search_call results; errors on empty', () => {
  const r2 = { output: [resp.output[0], { type: 'message', content: [{ type: 'output_text', text: 'Hi', annotations: [] }] }] };
  assert.deepStrictEqual(tm.parseResponse(r2, 1).sources, [{ title: 'X', url: 'https://x.org/a' }]);
  assert.strictEqual(tm.parseResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] }, 1).sources, undefined);
  assert.throws(() => tm.parseResponse({}, 1), (e) => e.code === 502);
  assert.throws(() => tm.parseResponse({ status: 'incomplete', output: [resp.output[0]] }, 1), /ran out of room/);
});
test('callTellMore: posts bearer + body, maps HTTP errors to 502', async () => {
  let seen;
  const ok = async (url, o) => { seen = { url, o }; return { ok: true, status: 200, json: async () => resp }; };
  const a = await tm.callTellMore({ key: 'k', ship: { mmsi: 310627000, name: 'QUEEN MARY 2' }, fetchImpl: ok });
  assert.strictEqual(seen.url, 'https://api.meta.ai/v1/responses'); assert.strictEqual(seen.o.headers.Authorization, 'Bearer k');
  assert.strictEqual(JSON.parse(seen.o.body).model, 'muse-spark-1.3'); assert.strictEqual(a.mmsi, 310627000);
  await assert.rejects(tm.callTellMore({ key: 'k', ship: { mmsi: 1 }, fetchImpl: async () => ({ ok: false, status: 500 }) }), (e) => e.code === 502);
  await assert.rejects(tm.callTellMore({ key: 'k', ship: { mmsi: 1 }, fetchImpl: async () => { throw new Error('net'); } }), (e) => e.code === 502);
});
test('card Tell me more opens the Muse chat with sources; /ask stays Wonder', () => {
  assert.match(html, /id="tellMore"/);
  assert.match(html, /fetch\('\/tell-more'/);
  assert.match(html, /askBubble\('me','Tell me more about '/);
  assert.match(html, /className='src'/);
  assert.match(html, /fetch\('\/ask'/);
  assert.equal(ask.MODEL, 'muse-wonder-1.0');
  assert.equal(tm.MODEL, 'muse-spark-1.3');
});

test('buildBody: FEED carries AIS scene + mode/asOf; concise explainer instruction', () => {
  const b = tm.buildBody({ mmsi: 538001234, name: 'DUMMY', imo: '9123456', type: 80, sog: 0, cog: 12.3, hdg: 511, dest: 'USCRP',
    navStatus: 0, draught: 12.1, length: 250, beam: 44, callsign: 'V7AB1', ageSec: 42, mode: 'replay', asOf: '2026-11-01T11:00:00.000Z' });
  const feed = JSON.parse(b.input.split('FEED: ')[1]);
  assert.strictEqual(feed.sogKn, 0); assert.strictEqual(feed.mode, 'replay'); assert.strictEqual(feed.asOf, '2026-11-01T11:00:00.000Z');
  assert.strictEqual(feed.hdgDeg, null); assert.strictEqual(feed.dest, 'USCRP'); assert.strictEqual(feed.typeLabel != null, true);
  assert.deepStrictEqual(feed.dims, { lengthM: 250, beamM: 44 }); assert.strictEqual(feed.flag, 'Marshall Islands');
  assert.strictEqual(feed.navStatusText, 'under way using engine'); assert.strictEqual(feed.ageSec, 42); assert.strictEqual(feed.callsign, 'V7AB1');
  assert.match(b.input, /Harbor Muse/); assert.match(b.input, /100-160 words/);
  for (const k of ['What it is', 'Current activity (Reported)', 'Destination', 'Cargo', 'One fact']) assert.ok(b.input.includes(k), k);
  assert.match(b.input, /Reported \/ Inferred \/ Unknown/); assert.match(b.input, /IMO or MMSI/);
  assert.match(b.input, /Do not narrate research \(no "I'll search"/);
  assert.match(b.input, /0\.0 kn\) does not prove anchored/);
  const lines = b.input.split('\n'); assert.ok(lines.indexOf(lines.find((l) => /IMO\/MMSI\/call sign last/.test(l))) > lines.findIndex((l) => /What it is/.test(l)));
  const bad = tm.buildFeed({ mmsi: 1, name: 'A`\nB', mode: 'evil' }); assert.strictEqual(bad.mode, null); assert.strictEqual(bad.name, 'A  B');
});
test('parseResponse keeps longer structured answers (2500 cap)', () => {
  const long = 'x'.repeat(3000);
  assert.strictEqual(tm.parseResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: long }] }] }, 1).answer.length, 2500);
});
test('server: tell-more builds FEED from store + 404s missing ship', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /send\(res, 404, \{ error: 'That ship is no longer on the map\.' \}\)/);
  assert.match(src, /mode: md, asOf: new Date\(now\)\.toISOString\(\)/);
  assert.match(html, /Looking up…/);
});
