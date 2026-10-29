const test = require('node:test'), assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const { NAMES, shipKind, iconUrl } = require('../public/shiptype.js');

test('AIS type -> six kinds', () => {
  for (const t of [70, 75, 79]) assert.strictEqual(shipKind(t), 'cargo');
  for (const t of [80, 84, 89]) assert.strictEqual(shipKind(t), 'tanker');
  for (const t of [31, 32, 52]) assert.strictEqual(shipKind(t), 'tug');
  for (const t of [60, 69]) assert.strictEqual(shipKind(t), 'passenger');
  assert.strictEqual(shipKind(30), 'fishing');
  for (const t of [0, null, undefined, 'x', 33, 35, 36, 37, 50, 90, 99, 1.5, -1]) assert.strictEqual(shipKind(t), 'unknown');
  assert.strictEqual(iconUrl(71), '/assets/ship-types/cargo.svg');
});

test('six small single-color SVGs exist', () => {
  assert.deepStrictEqual(NAMES.slice().sort(), fs.readdirSync(path.join(__dirname, '../public/assets/ship-types')).map((f) => f.replace('.svg', '')).sort());
  for (const n of NAMES) {
    const s = fs.readFileSync(path.join(__dirname, '../public/assets/ship-types', n + '.svg'), 'utf8');
    assert.ok(s.length <= 2048, n); assert.match(s, /^<svg /);
    assert.strictEqual(new Set(s.match(/#[0-9a-f]{3,6}/gi)).size, 1, n + ' single color');
  }
});

test('server serves only the six icons as image/svg+xml', async () => {
  const port = 4100 + Math.floor(Math.random() * 90);
  const env = { ...process.env, PORT: port }; delete env.AISSTREAM_API_KEY;
  const p = spawn('node', ['server.js'], { env, cwd: path.join(__dirname, '..') });
  try {
    await new Promise((r) => setTimeout(r, 700));
    const base = `http://127.0.0.1:${port}`;
    for (const n of NAMES) {
      const r = await fetch(base + '/assets/ship-types/' + n + '.svg');
      assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('content-type'), 'image/svg+xml');
    }
    for (const bad of ['/assets/ship-types/yacht.svg', '/assets/ship-types/../../server.js', '/assets/ship-types/%2e%2e%2fserver.js'])
      assert.strictEqual((await fetch(base + bad)).status, 404, bad);
    assert.strictEqual((await fetch(base + '/shiptype.js')).status, 200);
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /id="sIcon"/); assert.match(html, /unknown\.svg/);
  } finally { p.kill(); }
});
