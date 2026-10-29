// Harbor Muse server: one aisstream socket -> per-MMSI store -> /ships. Replay when no key or live is sparse.
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const geo = require('./lib/geo');

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
    if (t === 'ShipStaticData') s.dest = clean(m.Destination);
    s.staticAt = now;
  } else if (/PositionReport$/.test(t)) {
    if (!(m.Latitude <= 91 && m.Longitude <= 181)) return false;
    s.lat = m.Latitude; s.lon = m.Longitude;
    s.sog = m.Sog >= 102.2 ? null : m.Sog;
    s.cog = m.Cog >= 360 ? null : m.Cog;
    s.hdg = m.TrueHeading === 511 ? null : m.TrueHeading;
    if (m.Name) s.name = clean(m.Name) || s.name;           // ExtendedClassB carries name/type
    if (m.Type) s.type = m.Type;
    if (!s.name) s.name = clean(md.ShipName);
    s.posAt = now;
  } else return false;
  store.set(mmsi, s);
  return s.posAt === now;
}
function sweep(store, now) { for (const [k, s] of store) if (now - (s.posAt || s.staticAt) > DROP_MS) store.delete(k); }

// ---------- live: ONE upstream socket, backoff 1..60 s ±20% ----------
let ws = null, backoff = 1000, healthyTimer = null, lastLivePos = 0, liveState = KEY ? 'connecting' : 'nokey';
function connect() {
  if (!KEY || ws) return;                       // single-socket guard
  liveState = 'connecting';
  const sock = ws = new WebSocket(AIS_URL);
  sock.on('open', () => {
    subscriber.reset(); subscriber.update(viewers.boxes()); // subscribe immediately (aisstream wants it within 3 s)
    liveState = 'open'; console.log('aisstream: open, subscribed');
    healthyTimer = setTimeout(() => { backoff = 1000; }, 60e3);
  });
  sock.on('message', (d) => {
    let msg; try { msg = JSON.parse(d); } catch { return; }
    if (msg.error) { console.log('aisstream: server error message'); return; }
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
const refreshSubscription = () => { if (ws && ws.readyState === WebSocket.OPEN) subscriber.update(viewers.boxes()); };

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
const RADIUS = 0.5, FAR_FROM_CC = 2;
const near = (s, c, r) => Math.abs(s.lat - c.lat) <= r && Math.abs(s.lon - c.lon) <= r;
function list(store, c, r, now) {
  const out = [];
  for (const s of store.values()) {
    if (s.lat == null || (c && !near(s, c, r))) continue;
    const age = now - s.posAt;
    out.push({ mmsi: s.mmsi, name: s.name, type: s.type, lat: s.lat, lon: s.lon, sog: s.sog, cog: s.cog, hdg: s.hdg, dest: s.dest,
      ageSec: Math.round(age / 1000), stale: age > FADE_MS });
  }
  return out;
}
function mode() {
  const liveCount = [...liveStore.values()].filter((s) => s.lat != null).length;
  return KEY && Date.now() - lastLivePos < SPARSE_MS && liveCount > 0 ? 'live' : 'replay';
}
// c = viewer location or null (no geolocation -> Corpus Christi demo home).
function ships(c, r = RADIUS) {
  const now = Date.now(), asOf = new Date(now).toISOString();
  if (c) {
    const live = KEY && now - lastLivePos < SPARSE_MS ? list(liveStore, c, r, now) : [];
    if (live.length) return { mode: 'live', asOf, ships: live };
    if (geo.dist(c, geo.CC_CENTER) > FAR_FROM_CC)
      return { mode: 'waiting', asOf, ships: [], note: KEY ? 'Listening for live ships near you…' : 'Replay is Corpus Christi demo data. Live ships near you need an aisstream key on the server.' };
    return { mode: 'replay', asOf, ships: list(replayStore, null, r, now) };
  }
  const md = mode(), cc = md === 'live' ? geo.CC_CENTER : null;
  return { mode: md, asOf, ships: list(md === 'live' ? liveStore : replayStore, cc, 1, now) };
}
const send = (res, code, obj, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj);
};
const viewerId = (req) => {
  const h = String(req.headers['x-viewer'] || '');
  return /^[A-Za-z0-9_-]{8,64}$/.test(h) ? 'v:' + h : 'ip:' + (req.socket.remoteAddress || '?');
};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), url = u.pathname;
  if (req.method === 'GET' && url === '/ships') {
    const q = u.searchParams, lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon'));
    const rd = Math.min(Math.max(parseFloat(q.get('radiusDeg')) || RADIUS, 0.05), 2);
    const c = geo.validLoc(lat, lon) ? { lat, lon } : viewers.get(viewerId(req));
    return send(res, 200, ships(c, rd));
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
  if (req.method === 'GET' && url === '/health') return send(res, 200, { ok: true, mode: mode(), live: liveState, liveShips: liveStore.size, viewers: viewers.size(), boxes: viewers.boxes().length, replayShips: replayStore.size, replayFrames: replay.length });
  if (url === '/ask') return send(res, 501, { error: 'Ask is not wired up yet (waiting on Muse endpoint confirmation).' });
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
module.exports = { ingest, ships, viewers, server };
