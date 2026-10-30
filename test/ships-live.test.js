// Live /ships: quiet stream must not blank markers; map bbox includes ships outside the 0.5° radius.
const test = require('node:test'), assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { WebSocketServer } = require('ws');

const pos = (mmsi, lat, lon) => JSON.stringify({
  MessageType: 'PositionReport',
  MetaData: { MMSI: mmsi },
  Message: { PositionReport: { Latitude: lat, Longitude: lon, Sog: 5, Cog: 90, TrueHeading: 90 } },
});

test('quiet stream still lists live ships; bbox includes off-radius ships', async () => {
  const wss = new WebSocketServer({ port: 0 });
  const port = 3900 + Math.floor(Math.random() * 90);
  const p = spawn('node', ['server.js'], {
    env: {
      ...process.env,
      PORT: port,
      AISSTREAM_API_KEY: 'TESTKEY123',
      AIS_URL: `ws://127.0.0.1:${wss.address().port}`,
      SPARSE_MS: '250',
    },
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await wait(800);
    const sock = [...wss.clients][0];
    assert.ok(sock, 'server should connect to fake aisstream');
    const base = `http://127.0.0.1:${port}`;
    const H = { 'Content-Type': 'application/json', 'X-Viewer': 'testviewer02' };
    assert.strictEqual((await fetch(base + '/view', { method: 'POST', headers: H, body: '{"lat":37.8,"lon":-122.4,"accuracy":50}' })).status, 200);

    sock.send(pos(366000001, 37.80, -122.40)); // at the viewer
    sock.send(pos(366000002, 37.80, -123.10)); // 0.7° west, outside default 0.5° radius
    await wait(200);

    const live = await (await fetch(base + '/ships?lat=37.8&lon=-122.4', { headers: H })).json();
    assert.strictEqual(live.mode, 'live');
    assert.deepStrictEqual(live.ships.map((s) => s.mmsi).sort(), [366000001]);

    await wait(350); // past SPARSE_MS; old gate returned [] and the map wiped markers
    const quiet = await (await fetch(base + '/ships?lat=37.8&lon=-122.4', { headers: H })).json();
    assert.strictEqual(quiet.mode, 'live', 'quiet stream must still list ships still in the store');
    assert.ok(quiet.ships.some((s) => s.mmsi === 366000001));

    const boxed = await (await fetch(base + '/ships?lat=37.8&lon=-122.4&bbox=-123.2000,37.6000,-122.2000,38.0000', { headers: H })).json();
    assert.deepStrictEqual(boxed.ships.map((s) => s.mmsi).sort(), [366000001, 366000002]);

    const huge = await (await fetch(base + '/ships?lat=37.8&lon=-122.4&bbox=-125,24,-66,49', { headers: H })).json();
    assert.deepStrictEqual(huge.ships.map((s) => s.mmsi), [366000001], 'oversized bbox is ignored');
  } finally {
    p.kill(); wss.close();
  }
});

test('map poll: bbox query, 5s self-schedule, keep markers on error, poll on tab focus', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /POLL=5000/);
  assert.match(html, /function bboxQ\(\)/);
  assert.match(html, /setTimeout\(poll,POLL\)/);
  assert.doesNotMatch(html, /setInterval\(poll/);
  assert.match(html, /visibilitychange[^\n]*poll\(\)/);
  assert.match(html, /Reconnecting/);
  assert.match(html, /a failed poll keeps the last markers/);
});
