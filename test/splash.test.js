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

test('splash dismiss: 4s hard cap, 2.5s after map load, map+ships hooks, removed after fade', () => {
  assert.match(html, /setTimeout\(dismiss,4000\)/);
  assert.match(html, /setTimeout\(dismiss,2500\)/);
  assert.match(html, /map\.once\('load',\(\)=>window\.splash&&splash\.mapReady\(\)\)/);
  assert.match(html, /initLeaflet\(\);window\.splash&&splash\.mapReady\(\)/);
  assert.match(html, /finally\{polling=false;window\.splash&&splash\.shipsReady\(\)/);
  assert.match(html, /removeChild\(el\)/);
  assert.match(html, /aria-hidden','true'/);
});

test('splash reduced motion and post-dismiss stop animations', () => {
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{#splash \*\{animation:none!important\}/);
  assert.match(html, /#splash\.still \*,#splash\.out \*\{animation:none!important\}/);
});

test('splash shell cache bumped', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8'), /harbor-shell-v6/);
});

// Simulate dismiss logic with fake timers/DOM.
test('splash logic: ships before map waits; map+ships dismisses; hang caps', () => {
  const src = html.match(/<script>(\(function\(\)\{var el=document\.getElementById\('splash'\)[\s\S]*?)<\/script>/)[1];
  function run() {
    const timers = []; const cls = new Set(); const el = { classList: { add: (c) => cls.add(c) }, setAttribute() {}, parentNode: { removeChild() {} } };
    const ctx = { document: { getElementById: () => el }, window: {}, setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: (i) => { if (timers[i - 1]) timers[i - 1].f = () => {}; } };
    new Function('document', 'window', 'setTimeout', 'clearTimeout', 'matchMedia', 'Date', src)(ctx.document, ctx.window, ctx.setTimeout, ctx.clearTimeout, undefined, Date);
    return { s: ctx.window.splash, cls, timers };
  }
  let r = run(); r.s.shipsReady(); assert.ok(!r.cls.has('out')); r.s.mapReady(); assert.ok(r.cls.has('out'));
  r = run(); r.s.mapReady(); assert.ok(!r.cls.has('out')); r.timers.find((t) => t.ms === 2500).f(); assert.ok(r.cls.has('out'));
  r = run(); r.timers.find((t) => t.ms === 4000).f(); assert.ok(r.cls.has('out'));
});
