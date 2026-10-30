const test = require('node:test'), assert = require('node:assert'), http = require('http');
const ask = require('../lib/ask');
const { server, ingest, replayStore } = require('../server');

const S = (mmsi, lat, lon, sog = 0, type = null) => ({ mmsi, lat, lon, sog, type });
const home = { lat: 27.8, lon: -97.4 };

test('validate: good and bad bodies', () => {
  assert.strictEqual(ask.validate({ q: "what's that?", mmsi: 367000001, view: { n: 28, s: 27, e: -97, w: -98 }, lat: 27.8, lon: -97.4, heading: 95 }), null);
  for (const b of [null, [], {}, { q: '' }, { q: 'x'.repeat(301) }, { q: 'a', mmsi: 'x' }, { q: 'a', lat: 27 }, { q: 'a', lat: 99, lon: 0 },
    { q: 'a', heading: 400 }, { q: 'a', view: { n: 1 } }]) assert.ok(ask.validate(b), JSON.stringify(b));
});
test('rate limiter: 10 per 10 min sliding window', () => {
  const l = ask.makeLimiter(10, 600e3);
  for (let i = 0; i < 10; i++) assert.ok(l.take('a', i));
  assert.strictEqual(l.take('a', 11), false); assert.ok(l.take('b', 11)); assert.ok(l.take('a', 600e3 + 1));
});
test('ranking: tapped mmsi first, then heading cone, nearest moving, largest', () => {
  const east = S(1, 27.8, -97.36, 0, 52);       // ~2 nm due east, stationary tug
  const north = S(2, 27.83, -97.4, 0, 30);      // north, out of cone
  const moving = S(3, 27.81, -97.41, 6, 60);    // nearest moving
  const tanker = S(4, 27.9, -97.2, 0, 80);      // big
  const tapped = S(5, 27.6, -97.0, 0, null);
  const ships = [east, north, moving, tanker, tapped];
  assert.deepStrictEqual(ask.rank(ships, { mmsi: 5, ...home, heading: 90 }).candidates.map((s) => s.mmsi), [5, 1, 3]);
  assert.deepStrictEqual(ask.rank(ships, { ...home, heading: 90 }).candidates.map((s) => s.mmsi), [1, 3, 4]);
  assert.deepStrictEqual(ask.rank(ships, { ...home }).candidates.map((s) => s.mmsi), [3, 4, 2]);
  const many = Array.from({ length: 60 }, (_, i) => S(100 + i, 27.8 + i / 1000, -97.4));
  assert.strictEqual(ask.rank(many, home).snapshot.length, 25);
});
test('parseAnswer: schema enforced', () => {
  assert.deepStrictEqual(ask.parseAnswer('{"answer":"A tug.","mmsi":1,"confidence":"high"}'), { answer: 'A tug.', mmsi: 1, confidence: 'high' });
  for (const c of ['nope', '{"answer":"x","mmsi":1,"confidence":"maybe"}', '{"answer":"","mmsi":null,"confidence":"low"}', '{"answer":"x","mmsi":"12a","confidence":"low"}'])
    assert.throws(() => ask.parseAnswer(c), (e) => e.code === 502);
});

// ---- HTTP: mock Spark ----
let spark, sparkReply, lastSparkReq, base;
test.before(async () => {
  spark = http.createServer((req, res) => { let b = ''; req.on('data', (d) => b += d); req.on('end', () => {
    lastSparkReq = { auth: req.headers.authorization, body: JSON.parse(b) }; res.writeHead(sparkReply.status || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(sparkReply.body)); }); });
  await new Promise((r) => spark.listen(0, r)); process.env.MUSE_URL = `http://127.0.0.1:${spark.address().port}/v1/chat/completions`;
  await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`;
  ingest(replayStore, { MessageType: 'PositionReport', MetaData: { MMSI: 367000009 }, Message: { PositionReport: { Latitude: 27.81, Longitude: -97.39, Sog: 4, Cog: 90, TrueHeading: 90 } } }, Date.now());
});
test.after(() => { spark.close(); server.close(); });
const post = (body, viewer = 'testviewer' + Math.random().toString(36).slice(2, 10)) =>
  fetch(base + '/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Viewer': viewer }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const ok = (content, finish = 'stop') => ({ body: { choices: [{ finish_reason: finish, message: { content } }] } });

test('no key -> 503', async () => {
  delete process.env.MUSE_API_KEY;
  const r = await post({ q: 'what is that?' }); assert.strictEqual(r.status, 503); assert.deepStrictEqual(await r.json(), { error: 'Ask is not configured' });
});
test('bad input -> 400; oversize -> 413/error', async () => {
  process.env.MUSE_API_KEY = 'test-key';
  assert.strictEqual((await post('{bad')).status, 400);
  assert.strictEqual((await post({ q: 'x'.repeat(301) })).status, 400);
  const r = await post({ q: 'a', pad: 'x'.repeat(3000) }).catch(() => ({ status: 413 })); assert.ok(r.status >= 400);
});
test('happy path: Spark request shape, mmsi validated against store', async () => {
  process.env.MUSE_API_KEY = 'test-key';
  sparkReply = ok(JSON.stringify({ answer: 'A vessel heading east at 4 kn.', mmsi: 367000009, confidence: 'high' }));
  let r = await post({ q: "what's that?", mmsi: 367000009, lat: 27.8, lon: -97.4, heading: 90 });
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(await r.json(), { answer: 'A vessel heading east at 4 kn.', mmsi: 367000009, confidence: 'high' });
  const b = lastSparkReq.body; assert.strictEqual(lastSparkReq.auth, 'Bearer test-key');
  assert.strictEqual(b.model, 'muse-wonder-1.0'); assert.strictEqual(b.max_tokens, 800); assert.strictEqual(b.response_format.json_schema.strict, true);
  assert.match(b.messages[0].content, /ONLY from SNAPSHOT/); assert.match(b.messages[0].content, /SELECTED is an MMSI present in SNAPSHOT/);
  assert.match(b.messages[1].content, /SNAPSHOT: \[.*367000009/); assert.match(b.messages[1].content, /SELECTED: 367000009/);
  assert.match(b.messages[1].content, /cannot tell which vessel/);
  sparkReply = ok(JSON.stringify({ answer: 'Made up.', mmsi: 999999999, confidence: 'low' }));
  r = await post({ q: 'that one?' }); assert.strictEqual((await r.json()).mmsi, null);
});
test('Spark cutoff / null / error -> 502', async () => {
  process.env.MUSE_API_KEY = 'test-key';
  for (const rep of [ok(null, 'length'), ok(null), { status: 500, body: {} }, ok('not json')]) {
    sparkReply = rep; const r = await post({ q: 'hi' }); assert.strictEqual(r.status, 502); assert.ok((await r.json()).error);
  }
});
test('rate limit -> 429 after 10', async () => {
  process.env.MUSE_API_KEY = 'test-key'; sparkReply = ok(JSON.stringify({ answer: 'ok', mmsi: null, confidence: 'unknown' }));
  const v = 'ratelimitviewer1';
  for (let i = 0; i < 10; i++) assert.strictEqual((await post({ q: 'hi' }, v)).status, 200);
  assert.strictEqual((await post({ q: 'hi' }, v)).status, 429);
});

test('callSpark retries 404 model_not_found then succeeds, sends reasoning_effort minimal', async () => {
  const { callSpark } = require('../lib/ask');
  let n = 0, sent; const slept = [];
  const ok = { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answer: 'A', mmsi: null, confidence: 'low' }) } }] }) };
  const nf = { ok: false, status: 404, json: async () => ({ error: { code: 'model_not_found' } }) };
  const fetchImpl = async (u, o) => { sent = JSON.parse(o.body); return ++n < 3 ? nf : ok; };
  const a = await callSpark({ key: 'k', user: 'u', fetchImpl, sleep: async (ms) => slept.push(ms) });
  assert.equal(n, 3); assert.equal(slept.length, 2); assert.equal(a.answer, 'A');
  assert.equal(sent.model, 'muse-wonder-1.0');
  assert.equal(sent.reasoning_effort, 'minimal'); assert.equal(sent.max_tokens, 800);
  assert.ok(slept[0] >= 400 && slept[0] <= 600 && slept[1] >= 800 && slept[1] <= 1200);
});

test('callSpark gives up after 5×wonder + 5×1.3 + 5×1.1 on 404 with 502; no retry on 400', async () => {
  const { callSpark } = require('../lib/ask');
  for (const [status, calls] of [[404, 15], [400, 1], [502, 1]]) {
    let n = 0;
    const fetchImpl = async () => { n++; return { ok: false, status, json: async () => ({}) }; };
    await assert.rejects(callSpark({ key: 'k', user: 'u', fetchImpl, sleep: async () => {}, log: () => {} }), (e) => e.code === 502);
    assert.equal(n, calls);
  }
});

test('schema mmsi is string|null; parseAnswer normalizes string mmsi to number', () => {
  const { parseAnswer, SCHEMA } = require('../lib/ask');
  assert.deepEqual(SCHEMA.json_schema.schema.properties.mmsi.type, ['string', 'null']);
  assert.equal(parseAnswer('{"answer":"A","mmsi":"367000001","confidence":"high"}').mmsi, 367000001);
  assert.equal(parseAnswer('{"answer":"A","mmsi":null,"confidence":"low"}').mmsi, null);
  assert.equal(parseAnswer('{"answer":"A","mmsi":"","confidence":"low"}').mmsi, null);
  assert.throws(() => parseAnswer('{"answer":"A","mmsi":"abc","confidence":"low"}'));
});

test('callSpark falls back wonder-1.0 → spark-1.3 → spark-1.1 (no contributor), same request shape', async () => {
  const { callSpark, MODELS, MODEL, FALLBACK_MODEL } = require('../lib/ask');
  const bodies = [], logs = [];
  const nf = { ok: false, status: 404, json: async () => ({ error: { code: 'model_not_found' } }) };
  const ok = { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop',
    message: { content: '{"answer":"TEST BOAT","mmsi":"367000001","confidence":"high"}' } }] }) };
  const fetchImpl = async (u, o) => { const b = JSON.parse(o.body); bodies.push(b); return b.model === 'muse-spark-1.1' ? ok : nf; };
  const a = await callSpark({ key: 'secret-k', user: 'u', fetchImpl, sleep: async () => {}, log: (m) => logs.push(m) });
  assert.deepEqual(a, { answer: 'TEST BOAT', mmsi: 367000001, confidence: 'high' });
  assert.equal(MODEL, 'muse-wonder-1.0');
  assert.deepEqual(MODELS, ['muse-wonder-1.0', 'muse-spark-1.3', 'muse-spark-1.1']);
  assert.equal(FALLBACK_MODEL, 'muse-spark-1.1');
  assert.equal(bodies.length, 11);
  assert.ok(bodies.slice(0, 5).every((b) => b.model === 'muse-wonder-1.0'));
  assert.ok(bodies.slice(5, 10).every((b) => b.model === 'muse-spark-1.3'));
  assert.equal(bodies[10].model, 'muse-spark-1.1');
  assert.ok(!bodies.some((b) => /contributor/i.test(b.model)));
  const { model: _a, ...s0 } = bodies[0], { model: _b, ...s5 } = bodies[5], { model: _c, ...s10 } = bodies[10];
  assert.deepEqual(s5, s0); assert.deepEqual(s10, s0);
  assert.equal(s0.reasoning_effort, 'minimal'); assert.equal(s0.max_tokens, 800);
  assert.deepEqual(logs, ['ask fallback:muse-spark-1.3', 'ask fallback:muse-spark-1.1']);
  assert.ok(!logs.join().includes('secret-k'));
});

test('callSpark does not fall back on non-model_not_found 404', async () => {
  const { callSpark } = require('../lib/ask');
  const models = [];
  const fetchImpl = async (u, o) => { models.push(JSON.parse(o.body).model); return { ok: false, status: 404, json: async () => ({ error: { code: 'not_found' } }) }; };
  await assert.rejects(callSpark({ key: 'k', user: 'u', fetchImpl, sleep: async () => {}, log: () => {} }), (e) => e.code === 502);
  assert.ok(models.every((m) => m === 'muse-wonder-1.0'));
});

test('selected mmsi is the subject when it is in the snapshot', () => {
  const ships = [S(9, 27.8, -97.4, 3, 70), S(8, 27.81, -97.41, 6, 80)];
  const ranked = ask.rank(ships, { mmsi: 9, ...home });
  assert.equal(ranked.candidates[0].mmsi, 9);
  assert.ok(ranked.snapshot.some((s) => s.mmsi === 9));
  const msg = ask.userMessage('tell me about it', 9, null, ranked);
  assert.match(msg, /SELECTED: 9 /);
  assert.match(msg, /cannot tell which vessel/);
  assert.match(ask.SYSTEM, /Never say you cannot tell which vessel when SELECTED is in SNAPSHOT/);
  assert.match(ask.userMessage('what is that?', null, null, ask.rank(ships, home)), /SELECTED: none/);
});

test('client sends selected card mmsi on every /ask and keeps a side chat history', () => {
  const fs = require('fs'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /function askId\(\)\{return selected\|\|askMmsi\|\|null\}/);
  assert.match(html, /if\(id\)body\.mmsi=\+id/);
  assert.match(html, /openAsk\(selected\)/);
  assert.match(html, /Ask about '\+s\.name/);
  assert.match(html, /id="askLog"/);
  assert.match(html, /min-width:700px/);
  assert.match(html, /body\.ask-open #sheet/);
  assert.doesNotMatch(html, /openAsk\(null\)/);
  assert.doesNotMatch(html, /id="askOut"|\$\('askOut'\)/);
});
