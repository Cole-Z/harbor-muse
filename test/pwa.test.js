// PWA shell: manifest, service worker, icons served with correct types; SW precaches same-origin shell only.
const test = require('node:test'), assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');

test('manifest, sw.js, icons served; sw caches shell only', async () => {
  const port = 4000 + Math.floor(Math.random() * 90);
  const env = { ...process.env, PORT: port }; delete env.AISSTREAM_API_KEY;
  const p = spawn('node', ['server.js'], { env });
  try {
    await new Promise((r) => setTimeout(r, 700));
    const base = `http://127.0.0.1:${port}`;
    const m = await fetch(base + '/manifest.webmanifest');
    assert.strictEqual(m.status, 200); assert.match(m.headers.get('content-type'), /application\/manifest\+json/);
    const j = await m.json();
    assert.strictEqual(j.name, 'Harbor Muse'); assert.strictEqual(j.start_url, '/'); assert.strictEqual(j.display, 'standalone');
    for (const i of j.icons) {
      const r = await fetch(base + i.src); assert.strictEqual(r.status, 200, i.src); assert.strictEqual(r.headers.get('content-type'), 'image/png');
    }
    assert.ok(j.icons.some((i) => i.sizes === '192x192') && j.icons.some((i) => i.sizes === '512x512'));
    const sw = await fetch(base + '/sw.js');
    assert.strictEqual(sw.status, 200); assert.match(sw.headers.get('content-type'), /javascript/);
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /rel="manifest"/); assert.match(html, /serviceWorker\.register\('\/sw\.js'\)/);
    assert.strictEqual((await fetch(base + '/public/sw.js')).status, 404);
  } finally { p.kill(); }
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  const shell = JSON.parse(src.match(/const SHELL = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  for (const s of shell) assert.ok(s.startsWith('/') && !s.startsWith('//'), 'same-origin only: ' + s);
  assert.doesNotMatch(src.match(/const SHELL = \[[^\]]*\]/)[0], /tile|openfreemap|unpkg|carto|osm|ships|view/i);
});
