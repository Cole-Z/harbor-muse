const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const voice = require('../lib/voice');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('request JSON matches locked Researcher shape', () => {
  assert.deepStrictEqual(voice.requestJson(), { model: 'muse-voice-transcribe-1.0', mode: 'PUSH_TO_TALK', audioEncoding: 'WAV',
    languageBias: ['English'], keywords: ['MMSI', 'AIS', 'tug', 'tanker', 'container', 'Harbor Muse'] });
  assert.strictEqual(voice.URL_DEFAULT, 'https://api.meta.ai/v1/asr/transcribe');
});
test('parseMultipart extracts audio part', async () => {
  const fd = new FormData(); fd.append('x', 'y'); fd.append('audio', new Blob([Buffer.from('hello-audio')], { type: 'audio/webm' }), 'clip.webm');
  const r = new Request('http://x', { method: 'POST', body: fd });
  const buf = Buffer.from(await r.arrayBuffer());
  assert.strictEqual(voice.parseMultipart(buf, r.headers.get('content-type')).toString(), 'hello-audio');
  assert.strictEqual(voice.parseMultipart(buf, 'text/plain'), null);
});
test('transcribe: multipart request+audio, bearer, maps transcript + errors', async () => {
  let seen;
  const ok = async (url, o) => { seen = { url, o }; return { ok: true, status: 200, json: async () => ({ transcript: " What's that tug? ", turns: [] }) }; };
  const a = await voice.transcribe({ key: 'k', wav: Buffer.alloc(100), fetchImpl: ok });
  assert.deepStrictEqual(a, { transcript: "What's that tug?", text: "What's that tug?" });
  assert.strictEqual(seen.o.headers.Authorization, 'Bearer k');
  assert.strictEqual(JSON.parse(await seen.o.body.get('request').text()).model, 'muse-voice-transcribe-1.0');
  assert.strictEqual(seen.o.body.get('audio').type, 'audio/wav');
  const st = (s) => async () => ({ ok: false, status: s });
  await assert.rejects(voice.transcribe({ key: 'k', wav: Buffer.alloc(1), fetchImpl: st(429) }), (e) => e.code === 429);
  await assert.rejects(voice.transcribe({ key: 'k', wav: Buffer.alloc(1), fetchImpl: st(400) }), (e) => e.code === 400);
  let n = 0; await assert.rejects(voice.transcribe({ key: 'k', wav: Buffer.alloc(1), fetchImpl: async () => { n++; return { ok: false, status: 500 }; } }), (e) => e.code === 502);
  assert.strictEqual(n, 2, 'retries once on 5xx');
});
let hasFfmpeg = true; try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { hasFfmpeg = false; }
test('toWav converts to mono 24 kHz s16le', { skip: !hasFfmpeg }, async () => {
  const src = execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=d=0.5:r=48000', '-ac', '2', '-c:a', 'libopus', '-f', 'webm', 'pipe:1']);
  const wav = await voice.toWav(src);
  assert.strictEqual(wav.toString('ascii', 0, 4), 'RIFF');
  assert.strictEqual(wav.readUInt16LE(22), 1); assert.strictEqual(wav.readUInt32LE(24), 24000); assert.strictEqual(wav.readUInt16LE(34), 16);
  await assert.rejects(voice.toWav(Buffer.from('not audio at all')), (e) => e.code === 400);
});
test('client: mic left of input, hold-to-talk, 20s cap, no auto-send, no TTS', () => {
  assert.match(html, /<form id="askForm"><button id="askMic"[^>]*hidden>[^<]*<\/button><input id="askQ"/);
  assert.match(html, /MAX_MS=20e3/);
  assert.match(html, /fetch\('\/transcribe'/);
  assert.match(html, /pointerdown/); assert.match(html, /NotAllowedError'\|\|e\.name==='SecurityError'\)\)mic\.hidden=true/);
  assert.match(html, /cur\?cur\+' '\+t:t/);
  assert.doesNotMatch(html, /speechSynthesis/);
});
test('server /transcribe: 503 without key, 405 on GET', async () => {
  delete process.env.MUSE_API_KEY;
  const { server } = require('../server');
  await new Promise((r) => server.listen(0, r)); const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.strictEqual((await fetch(base + '/transcribe')).status, 405);
    const fd = new FormData(); fd.append('audio', new Blob([Buffer.alloc(200)]), 'c.webm');
    assert.strictEqual((await fetch(base + '/transcribe', { method: 'POST', body: fd })).status, 503);
  } finally { server.close(); }
});
