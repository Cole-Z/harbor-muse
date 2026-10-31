// Harbor Muse server: one aisstream socket -> per-MMSI store -> /ships. Replay when no key or live is sparse.
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const geo = require('./lib/geo');
const trail = require('./lib/trail');
const ask = require('./lib/ask');
const tellMore = require('./lib/tellMore');
const shipPhoto = require('./lib/shipPhoto');
const voice = require('./lib/voice');
const ShipType = require('./public/shiptype');
const askLimiter = ask.makeLimiter(10, 10 * 60e3);
const voiceLimiter = ask.makeLimiter(10, 10 * 60e3); // sibling of the ask bucket
const photoLimiter = ask.makeLimiter(30, 60e3);
const lookupPhoto = shipPhoto.makeShipPhoto();

const PORT = +process.env.PORT || 3000;
const KEY = process.env.AISSTREAM_API_KEY || '';
const AIS_URL = process.env.AIS_URL || 'wss://stream.aisstream.io/v0/stream';
const FILTER = ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport', 'ShipStaticData'];
const viewers = geo.makeViewers();
const FADE_MS = 10 * 60e3, DROP_MS = 30 * 60e3;
const SPARSE_MS = +process.env.SPARSE_MS || 2 * 60e3; // no live positions this long -> REPLAY
const REPLAY_FILE = path.join(__dirname, 'replay.jsonl');
const MAX_REPLAY = 2 * 1024 * 1024;

// ---------- per-MMSI store (one for live, one for replay) ----------
function makeStore() { return new Map(); }
const liveStore = makeStore(), replayStore = makeStore();
const clean = (s) => { s = (s || '').replace(/@+/g, '').trim(); return s || null; };

function ingest(store, msg, now) {
  const t = msg.MessageType, m = msg.Message && msg.Message[t], md = msg.MetaData || {};
  if (!m) return false;
  const mmsi = md.MMSI || m.UserID; if (!mmsi) return false;
  const s = store.get(mmsi) || { mmsi, name: null, type: null, lat: null, lon: null, sog: null, cog: null, hdg: null, dest: null, posAt: 0, staticAt: 0 };
  if (t === 'ShipStaticData' || t === 'StaticDataReport') {
    s.name = clean(m.Name) || s.name || clean(md.ShipName);
    if (m.Type) s.type = m.Type;
    if (t === 'ShipStaticData') {
      s.dest = clean(m.Destination);
      s.callsign = clean(m.CallSign) || s.callsign || null;
      if (m.ImoNumber > 0) s.imo = m.ImoNumber;
      if (m.MaximumStaticDraught > 0) s.draught = m.MaximumStaticDraught;
      const e = m.Eta || {};
      s.eta = e.Month >= 1 && e.Month <= 12 && e.Day >= 1 && e.Day <= 31 && e.Hour < 24 && e.Minute < 60
        ? `${String(e.Month).padStart(2, '0')}-${String(e.Day).padStart(2, '0')} ${String(e.Hour).padStart(2, '0')}:${String(e.Minute).padStart(2, '0')} UTC` : null;
    }
    const rb = m.ReportB || {};
    if (t === 'StaticDataReport' && rb.Valid) s.callsign = clean(rb.CallSign) || s.callsign || null;
    const d = m.Dimension || rb.Dimension;
    if (d) { const L = (d.A || 0) + (d.B || 0), W = (d.C || 0) + (d.D || 0); if (L > 0 && W > 0) { s.length = L; s.beam = W; } }
    s.staticAt = now;
  } else if (/PositionReport$/.test(t)) {
    if (!(m.Latitude <= 91 && m.Longitude <= 181)) return false;
    s.lat = m.Latitude; s.lon = m.Longitude;
    s.sog = m.Sog >= 102.2 ? null : m.Sog;
    s.cog = m.Cog >= 360 ? null : m.Cog;
    s.hdg = m.TrueHeading === 511 ? null : m.TrueHeading;
    if (m.NavigationalStatus >= 0 && m.NavigationalStatus <= 14 && m.NavigationalStatus !== 15) s.navStatus = m.NavigationalStatus;
    if (m.Name) s.name = clean(m.Name) || s.name;           // ExtendedClassB carries name/type
    if (m.Type) s.type = m.Type;
    if (!s.name) s.name = clean(md.ShipName);
    s.posAt = now;
    trail.push(s, s.lat, s.lon, now);
  } else return false;
  store.set(mmsi, s);
  return s.posAt === now;
}
function sweep(store, now) { for (const [k, s] of store) if (now - (s.posAt || s.staticAt) > DROP_MS) store.delete(k); }

// ---------- live: ONE upstream socket, backoff 1..60 s ±20% ----------
let bboxFallback = false; // set if aisstream rejects our multi-box subscription
let ws = null, backoff = 1000, healthyTimer = null, lastLivePos = 0, liveState = KEY ? 'connecting' : 'nokey';
function connect() {
  if (!KEY || ws) return;                       // single-socket guard
  liveState = 'connecting';
  const sock = ws = new WebSocket(AIS_URL);
  sock.on('open', () => {
    subscriber.reset(); subscriber.update(currentBoxes()); // subscribe immediately (aisstream wants it within 3 s)
    liveState = 'open'; console.log('aisstream: open, subscribed');
    healthyTimer = setTimeout(() => { backoff = 1000; }, 60e3);
  });
  sock.on('message', (d) => {
    let msg; try { msg = JSON.parse(d); } catch { return; }
    if (msg.error) {
      const bboxErr = /bound|box/i.test(String(msg.error));
      console.log(`aisstream: server error message (${bboxErr ? 'bbox rejected' : 'other'})`); // type only, never the text/key
      if (bboxErr && !bboxFallback) { bboxFallback = true; console.log('aisstream: falling back to the single Corpus Christi box'); subscriber.update([geo.CC_BOX]); }
      return;
    }
    if (ingest(liveStore, msg, Date.now())) lastLivePos = Date.now();
  });
  sock.on('error', (e) => console.log('aisstream: error', e.code || 'socket'));
  sock.on('close', (code) => {
    clearTimeout(healthyTimer);
    if (ws === sock) ws = null;
    const wait = Math.round(backoff * (0.8 + Math.random() * 0.4));
    liveState = 'reconnecting'; console.log(`aisstream: closed (${code}), retry in ${wait} ms`);
    backoff = Math.min(backoff * 2, 60e3);
    setTimeout(connect, wait);
  });
}

// Resubscribe on the SAME socket (never a second one), ≤1/s, only when the box set changes.
const subscriber = geo.makeSubscriber((boxes) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ APIKey: KEY, BoundingBoxes: boxes, FilterMessageTypes: FILTER }));
  console.log(`aisstream: subscription set to ${boxes.length} box(es)`);
});
function currentBoxes() { return bboxFallback ? [geo.CC_BOX] : viewers.boxes(); }
const refreshSubscription = () => { if (ws && ws.readyState === WebSocket.OPEN) subscriber.update(currentBoxes()); };

// ---------- replay: loop recorded frames by MetaData.time_utc deltas ----------
let replay = [];
try {
  const st = fs.statSync(REPLAY_FILE);
  if (st.size > MAX_REPLAY) throw new Error('replay.jsonl over 2 MB');
  replay = fs.readFileSync(REPLAY_FILE, 'utf8').split('\n').filter(Boolean).map((l) => {
    const m = JSON.parse(l); return { t: Date.parse(m.MetaData.time_utc.slice(0, 23).replace(' ', 'T') + 'Z'), m };
  }).filter((f) => f.t).sort((a, b) => a.t - b.t);
} catch (e) { console.log('replay: unavailable -', e.message); }
let ri = 0;
function stepReplay() {
  if (!replay.length) return;
  const cur = replay[ri];
  ingest(replayStore, cur.m, Date.now());
  ri = (ri + 1) % replay.length;
  if (ri === 0) { setTimeout(stepReplay, 2000); return; } // loop; keep last positions, they refresh next pass
  setTimeout(stepReplay, Math.min(Math.max(replay[ri].t - cur.t, 0), 3e3)); // cap gaps so sparse recordings stay lively
}

// ---------- mode + API ----------
const RADIUS = 0.5;
const near = (s, c, r) => Math.abs(s.lat - c.lat) <= r && Math.abs(s.lon - c.lon) <= r;
const inBox = (s, b) => s.lat <= b.n && s.lat >= b.s && (b.w <= b.e ? s.lon >= b.w && s.lon <= b.e : s.lon >= b.w || s.lon <= b.e);
// bbox=w,s,e,n (map view). Capped at 4° per side so one client can't dump the whole store.
function parseBbox(v) {
  if (!v) return null; const a = v.split(',').map(Number); if (a.length !== 4 || !a.every(Number.isFinite)) return null;
  const [w, s, e, n] = a; if (!(n >= s && Math.abs(n) <= 90 && Math.abs(s) <= 90 && Math.abs(w) <= 180 && Math.abs(e) <= 180)) return null;
  if (n - s > 4 || ((e - w + 360) % 360) > 4) return null; return { w, s, e, n };
}
function list(store, c, r, now, box = null) {
  const out = [];
  for (const s of store.values()) {
    if (s.lat == null || (c && !near(s, c, r) && !(box && inBox(s, box)))) continue;
    const age = now - s.posAt;
    out.push({ mmsi: s.mmsi, name: s.name, type: s.type, lat: s.lat, lon: s.lon, sog: s.sog, cog: s.cog, hdg: s.hdg, dest: s.dest,
      callsign: s.callsign || null, imo: s.imo || null, navStatus: s.navStatus ?? null, draught: s.draught || null,
      length: s.length || null, beam: s.beam || null, eta: s.eta || null,
      ageSec: Math.round(age / 1000), stale: age > FADE_MS });
  }
  return out;
}
function mode() {
  const liveCount = [...liveStore.values()].filter((s) => s.lat != null).length;
  return KEY && Date.now() - lastLivePos < SPARSE_MS && liveCount > 0 ? 'live' : 'replay';
}
// c = viewer location or null (no geolocation -> Corpus Christi demo home).
// With a location we never auto-switch to Texas replay: live ships near you, or 'waiting' + an opt-in demo.
// demo=true is the user's explicit tap on "Watch Corpus Christi demo (replay)".
function ships(c, r = RADIUS, demo = false, box = null) {
  const now = Date.now(), asOf = new Date(now).toISOString();
  if (c && !demo) {
    // Don't gate on SPARSE_MS here: a quiet stream for 2 min used to return [] and wipe every marker while
    // Muse (which reads the whole store) still saw them. Ships age out via sweep()/DROP_MS and carry stale.
    const live = KEY ? list(liveStore, c, r, now, box) : [];
    if (live.length) return { mode: 'live', asOf, ships: live };
    return { mode: 'waiting', asOf, ships: [], note: 'No ships nearby right now', demoAvailable: replay.length > 0,
      detail: KEY ? 'Listening for live ships near you.' : 'Live ships near you need an aisstream key on the server.' };
  }
  const md = mode(), cc = md === 'live' ? geo.CC_CENTER : null;
  return { mode: md, area: 'Corpus Christi', demo: !!demo, asOf, ships: list(md === 'live' ? liveStore : replayStore, cc, 1, now) };
}
const trailOf = (s, now) => trail.trim(s, now).map((p) => ({ lat: p.lat, lon: p.lon, t: p.t }));
const send = (res, code, obj, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj);
};
const viewerId = (req) => {
  const h = String(req.headers['x-viewer'] || '');
  return /^[A-Za-z0-9_-]{8,64}$/.test(h) ? 'v:' + h : 'ip:' + (req.socket.remoteAddress || '?');
};
// PWA shell files (manifest, service worker, icons) served with correct types.
const STATIC = {
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png'],
  '/icon-maskable-512.png': ['icon-maskable-512.png', 'image/png'],
};
// POST /ask: lat/lon/heading/q live only in this function's scope; never stored or logged.
async function handleAsk(req, res, body) {
  let j; try { j = JSON.parse(body); } catch { return send(res, 400, { error: 'bad json' }); }
  const bad = ask.validate(j); if (bad) return send(res, 400, { error: bad });
  const museKey = process.env.MUSE_API_KEY || '';
  if (!museKey) return send(res, 503, { error: 'Ask is not configured' });
  if (!askLimiter.take(viewerId(req))) return send(res, 429, { error: 'Too many questions. Try again in a few minutes.' });
  const now = Date.now(), useLive = mode() === 'live';
  const pick = (id) => liveStore.get(id) || replayStore.get(id);
  const all = list(useLive ? liveStore : replayStore, null, 0, now);
  if (useLive) for (const s of list(replayStore, null, 0, now)) if (!liveStore.has(s.mmsi)) all.push(s);
  const ranked = ask.rank(all, j);
  const loc = j.lat != null ? { lat: +j.lat.toFixed(3), lon: +j.lon.toFixed(3), heading: j.heading ?? null } : null;
  try {
    const a = await ask.callSpark({ key: museKey, url: process.env.MUSE_URL || undefined, user: ask.userMessage(j.q.trim(), j.mmsi, loc, ranked) });
    if (a.mmsi != null && !pick(a.mmsi)) a.mmsi = null;
    send(res, 200, a);
  } catch (e) {
    console.log('ask: failed', e.code || 'error'); // code only
    send(res, 502, { error: e.code ? e.message : 'Muse had a problem. Try again in a moment.' });
  }
}
// POST /tell-more {mmsi,name?,imo?}: Spark web search; shares the /ask per-visitor budget. Names never logged.
async function handleTellMore(req, res, body) {
  let j; try { j = JSON.parse(body); } catch { return send(res, 400, { error: 'bad json' }); }
  const bad = tellMore.validate(j); if (bad) return send(res, 400, { error: bad });
  const museKey = process.env.MUSE_API_KEY || '';
  if (!museKey) return send(res, 503, { error: 'Tell me more is not configured' });
  if (!askLimiter.take(viewerId(req))) return send(res, 429, { error: 'Too many questions. Try again in a few minutes.' });
  const s = liveStore.get(j.mmsi) || replayStore.get(j.mmsi);
  const ship = { mmsi: j.mmsi, name: j.name || (s && s.name) || null, imo: j.imo || (s && s.imo) || null };
  try { send(res, 200, await tellMore.callTellMore({ key: museKey, url: process.env.MUSE_RESPONSES_URL || undefined, ship })); }
  catch (e) {
    console.log('tell-more: failed', e.code || 'error');
    send(res, 502, { error: e.code ? e.message : 'Muse had a problem. Try again in a moment.' });
  }
}
// POST /transcribe (multipart "audio" or raw blob): push-to-talk STT. Audio bytes/transcripts/key never logged.
async function handleTranscribe(req, res, buf) {
  const museKey = process.env.MUSE_API_KEY || '';
  if (!museKey) return send(res, 503, { error: 'Voice is not configured' });
  if (!voiceLimiter.take(viewerId(req))) return send(res, 429, { error: 'Too many voice clips. Try again in a few minutes.' });
  const ct = String(req.headers['content-type'] || '');
  const audio = /multipart\/form-data/i.test(ct) ? voice.parseMultipart(buf, ct) : buf;
  if (!audio || audio.length < 100) return send(res, 400, { error: 'No audio received.' });
  try {
    const wav = await voice.toWav(audio);
    send(res, 200, await voice.transcribe({ key: museKey, wav, url: process.env.MUSE_ASR_URL || undefined }));
  } catch (e) {
    console.log('transcribe: failed', e.code || 'error');
    const c = [400, 429, 503].includes(e.code) ? e.code : 502;
    send(res, c, { error: e.code ? e.message : 'Voice had a problem. Type instead.' });
  }
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), url = u.pathname;
  if (req.method === 'GET' && url === '/ships') {
    const q = u.searchParams, lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon'));
    const rd = Math.min(Math.max(parseFloat(q.get('radiusDeg')) || RADIUS, 0.05), 2);
    const c = geo.validLoc(lat, lon) ? { lat, lon } : viewers.get(viewerId(req));
    return send(res, 200, ships(c, rd, q.get('demo') === '1', parseBbox(q.get('bbox'))));
  }
  if (req.method === 'POST' && url === '/view') {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1024) req.destroy(); });
    req.on('end', () => {
      let j; try { j = JSON.parse(body); } catch { return send(res, 400, { error: 'bad json' }); }
      if (!j || !geo.validLoc(j.lat, j.lon) || (j.accuracy != null && !(j.accuracy >= 0 && j.accuracy < 1e5)))
        return send(res, 400, { error: 'lat/lon must be numbers inside the US' });
      if (!viewers.set(viewerId(req), j.lat, j.lon)) return send(res, 429, { error: 'too many viewers' });
      refreshSubscription(); // never log coordinates
      send(res, 200, { ok: true, box: geo.boxAround(j.lat, j.lon) });
    });
    return;
  }
  const tm = req.method === 'GET' && url.match(/^\/ships\/(\d{1,9})\/trail$/);
  if (tm) { // small per-ship endpoint so /ships stays lean
    const id = +tm[1], s = liveStore.get(id) || replayStore.get(id);
    if (!s) return send(res, 404, { error: 'unknown ship' });
    return send(res, 200, trailOf(s, Date.now()));
  }
  if (req.method === 'GET' && url === '/health') return send(res, 200, { ok: true, mode: mode(), live: liveState, liveShips: liveStore.size, viewers: viewers.size(), boxes: currentBoxes().length, bboxFallback, replayShips: replayStore.size, replayFrames: replay.length });
  if (req.method === 'GET' && url === '/ship-photo') { // Commons named match, else type photo; name/mmsi never logged
    const q = u.searchParams, id = +q.get('mmsi'), s = Number.isInteger(id) && id > 0 ? (liveStore.get(id) || replayStore.get(id)) : null;
    const name = (q.get('name') || (s && s.name) || '').slice(0, 40), kind = ShipType.shipKind(s ? s.type : q.get('type'));
    if (!photoLimiter.take(req.socket.remoteAddress || 'ip?')) return send(res, 200, shipPhoto.typePhoto(kind));
    lookupPhoto(name, kind).then((p) => send(res, 200, p), () => send(res, 200, shipPhoto.typePhoto(kind)));
    return;
  }
  const pm = req.method === 'GET' && url.match(/^\/assets\/ship-photos\/(cargo|tanker|tug|passenger|fishing|unknown)\.webp$/);
  if (pm) return fs.readFile(path.join(__dirname, 'public', 'assets', 'ship-photos', pm[1] + '.webp'), (e, b) => {
    if (e) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400' }); res.end(b);
  });
  if (url === '/ask') {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    let body = '', big = false;
    req.on('data', (d) => { if (big) return; body += d; if (body.length > 2048) { big = true; send(res, 413, { error: 'body too large' }); req.destroy(); } });
    req.on('end', () => { if (!big) handleAsk(req, res, body); });
    return;
  }
  if (url === '/transcribe') {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    const chunks = []; let n = 0, big = false;
    req.on('data', (d) => { if (big) return; n += d.length; if (n > voice.MAX_BYTES) { big = true; send(res, 413, { error: 'clip too large' }); req.destroy(); return; } chunks.push(d); });
    req.on('end', () => { if (!big) handleTranscribe(req, res, Buffer.concat(chunks)); });
    return;
  }
  if (url === '/tell-more') {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    let body = '', big = false;
    req.on('data', (d) => { if (big) return; body += d; if (body.length > 1024) { big = true; send(res, 413, { error: 'body too large' }); req.destroy(); } });
    req.on('end', () => { if (!big) handleTellMore(req, res, body); });
    return;
  }
  if (req.method === 'GET' && STATIC[url]) {
    const [file, type] = STATIC[url];
    return fs.readFile(path.join(__dirname, 'public', file), (e, b) => {
      if (e) return send(res, 404, { error: 'not found' });
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': file === 'sw.js' ? 'no-cache' : 'public, max-age=3600', ...(file === 'sw.js' ? { 'Service-Worker-Allowed': '/' } : {}) });
      res.end(b);
    });
  }
  const im = req.method === 'GET' && url.match(/^\/assets\/(ship-types|markers)\/(cargo|tanker|tug|passenger|fishing|unknown)\.svg$/);
  if (im) return fs.readFile(path.join(__dirname, 'public', 'assets', im[1], im[2] + '.svg'), (e, b) => {
    if (e) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' }); res.end(b);
  });
  if (req.method === 'GET' && url === '/shiptype.js')
    return fs.readFile(path.join(__dirname, 'public', 'shiptype.js'), (e, b) => e ? send(res, 404, { error: 'not found' }) : send(res, 200, b, 'text/javascript; charset=utf-8'));
  if (req.method === 'GET' && url === '/mmsimid.js')
    return fs.readFile(path.join(__dirname, 'public', 'mmsimid.js'), (e, b) => e ? send(res, 404, { error: 'not found' }) : send(res, 200, b, 'text/javascript; charset=utf-8'));
  if (req.method === 'GET' && url === '/cone.js')
    return fs.readFile(path.join(__dirname, 'public', 'cone.js'), (e, b) => e ? send(res, 404, { error: 'not found' }) : send(res, 200, b, 'text/javascript; charset=utf-8'));
  if (req.method === 'GET' && url === '/sun.js')
    return fs.readFile(path.join(__dirname, 'public', 'sun.js'), (e, b) => e ? send(res, 404, { error: 'not found' }) : send(res, 200, b, 'text/javascript; charset=utf-8'));
  if (req.method === 'GET' && url === '/course.js')
    return fs.readFile(path.join(__dirname, 'public', 'course.js'), (e, b) => e ? send(res, 404, { error: 'not found' }) : send(res, 200, b, 'text/javascript; charset=utf-8'));
  if (req.method === 'GET' && (url === '/' || url === '/index.html'))
    return fs.readFile(path.join(__dirname, 'public', 'index.html'), (e, b) => e ? send(res, 500, { error: 'missing page' }) : send(res, 200, b, 'text/html; charset=utf-8'));
  send(res, 404, { error: 'not found' });
});

setInterval(() => { const n = Date.now(); sweep(liveStore, n); sweep(replayStore, n); refreshSubscription(); }, 60e3).unref(); // also drops expired viewer boxes
if (require.main === module) {
stepReplay();
connect();
server.listen(PORT, () => console.log(`Harbor Muse on http://localhost:${PORT} (${KEY ? 'aisstream key set' : 'no key: replay only'})`));
}
module.exports = { ingest, ships, viewers, server, trailOf, liveStore, replayStore };
