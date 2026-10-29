// End-to-end with a fake aisstream: one socket, subscribe on open, resubscribe on /view, keyless page logic.
const test = require('node:test'), assert = require('node:assert');
const { spawn } = require('node:child_process');
const { WebSocketServer } = require('ws');

test('one socket, subscribe on open, SF /view resubscribes, no coords/keys logged', async () => {
  const wss = new WebSocketServer({ port: 0 }); const msgs = []; let conns = 0;
  wss.on('connection', (s) => { conns++; s.on('message', (d) => msgs.push(JSON.parse(d))); });
  const port = 3900 + Math.floor(Math.random() * 90);
  const p = spawn('node', ['server.js'], { env: { ...process.env, PORT: port, AISSTREAM_API_KEY: 'TESTKEY123', AIS_URL: `ws://127.0.0.1:${wss.address().port}` } });
  let log = ''; p.stdout.on('data', (d) => (log += d)); p.stderr.on('data', (d) => (log += d));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(800);
  assert.strictEqual(msgs.length, 1); assert.deepStrictEqual(msgs[0].BoundingBoxes, [[[27.58, -97.42], [27.9, -97.03]]]);
  const base = `http://127.0.0.1:${port}`, H = { 'Content-Type': 'application/json', 'X-Viewer': 'testviewer01' };
  assert.strictEqual((await fetch(base + '/view', { method: 'POST', headers: H, body: '{"lat":"x","lon":1}' })).status, 400);
  assert.strictEqual((await fetch(base + '/view', { method: 'POST', headers: H, body: '{"lat":51.5,"lon":-0.1}' })).status, 400);
  assert.strictEqual((await fetch(base + '/view', { method: 'POST', headers: H, body: '{"lat":37.8,"lon":-122.4,"accuracy":50}' })).status, 200);
  await wait(1300);
  assert.strictEqual(conns, 1);
  assert.strictEqual(msgs.length, 2);
  assert.deepStrictEqual(msgs[1].BoundingBoxes[1], [[37.6, -122.6], [38, -122.2]]);
  const far = await (await fetch(base + '/ships', { headers: H })).json();
  assert.strictEqual(far.mode, 'waiting'); assert.strictEqual(far.ships.length, 0);
  const home = await (await fetch(base + '/ships')).json();
  assert.strictEqual(home.mode, 'replay'); assert.ok(home.ships.length > 0);
  p.kill(); wss.close();
  assert.ok(!/TESTKEY123|37\.8|122\.4/.test(log), 'log leaked key or coords');
});
