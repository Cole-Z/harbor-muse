// Startup splash: inline, CSS+SVG only, dismiss rules + reduced motion.
const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('splash markup: wordmark, ship svg, layered waves, no video/lottie', () => {
  const m = html.match(/<div id="splash"[\s\S]*?<\/script>/)[0];
  assert.match(m, /<h1>Harbor Muse<\/h1>/);
  assert.match(m, /id="splashShip"/);
  assert.ok((m.match(/class="w\d"/g) || []).length >= 2);
  assert.doesNotMatch(html, /<video|lottie/i);
});

test('splash dismiss: 3s min hold, 5s hard cap, ship-count hook, removed after fade', () => {
  assert.match(html, /MIN=3000,CAP=5000/);
  assert.match(html, /setTimeout\(dismiss,CAP\)/);
  assert.match(html, /map\.once\('load',\(\)=>window\.splash&&splash\.mapReady\(\)\)/);
  assert.match(html, /initLeaflet\(\);window\.splash&&splash\.mapReady\(\)/);
  assert.match(html, /finally\{polling=false;window\.splash&&splash\.shipsReady\(Object\.keys\(ships\)\.length\)/);
  assert.match(html, /removeChild\(el\)/);
  assert.match(html, /aria-hidden','true'/);
});

test('splash reduced motion and post-dismiss stop animations', () => {
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{#splash \*\{animation:none!important\}/);
  assert.match(html, /#splash\.still \*,#splash\.out \*\{animation:none!important\}/);
});

test('splash shell cache bumped', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8'), /harbor-shell-v7/);
});

// Simulate dismiss logic with fake timers/clock.
test('splash logic: min 3s hold, prefer first ship, 5s cap, map alone never dismisses', () => {
  const src = html.match(/<script>(\(function\(\)\{var el=document\.getElementById\('splash'\)[\s\S]*?)<\/script>/)[1];
  function run() {
    const timers = []; const cls = new Set(); let now = 0;
    const el = { classList: { add: (c) => cls.add(c) }, setAttribute() {}, parentNode: { removeChild() {} } };
    const FakeDate = { now: () => now };
    const st = (f, ms) => { timers.push({ f, ms, at: now + ms }); return timers.length; };
    const ct = (i) => { if (timers[i - 1]) timers[i - 1].f = () => {}; };
    const win = {};
    new Function('document', 'window', 'setTimeout', 'clearTimeout', 'matchMedia', 'Date', src)({ getElementById: () => el }, win, st, ct, undefined, FakeDate);
    const advance = (to) => { now = to; for (const t of timers.slice()) if (t.at <= to && !t.ran) { t.ran = true; t.f(); } };
    return { s: win.splash, out: () => cls.has('out'), advance };
  }
  // ships + map instantly: hold until 3s
  let r = run(); r.s.mapReady(); r.s.shipsReady(4); r.advance(2999); assert.ok(!r.out()); r.advance(3000); assert.ok(r.out());
  // first ship at 3.8s: dismiss right then
  r = run(); r.advance(3800); assert.ok(!r.out()); r.s.shipsReady(1); assert.ok(r.out());
  // map alone does not dismiss early; empty /ships ignored; hard cap 5s
  r = run(); r.s.mapReady(); r.s.shipsReady(0); r.advance(4999); assert.ok(!r.out()); r.advance(5000); assert.ok(r.out());
  // /ships never resolves (offline): cap 5s
  r = run(); r.advance(5000); assert.ok(r.out());
});
