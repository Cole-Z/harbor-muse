// Viewer-driven AIS bounding boxes: per-viewer ~0.4° squares + the Corpus Christi demo box, throttled resubscribe.
const CC_BOX = [[27.58, -97.42], [27.90, -97.03]];
const CC_CENTER = { lat: 27.78, lon: -97.30 };
const US = { minLat: 24, maxLat: 49, minLon: -125, maxLon: -66 };
const HALF = 0.2, VIEWER_TTL_MS = 10 * 60e3, MAX_VIEWERS = 50;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
function validLoc(lat, lon) {
  return isNum(lat) && isNum(lon) && lat >= US.minLat && lat <= US.maxLat && lon >= US.minLon && lon <= US.maxLon;
}
const r1 = (v) => Math.round(v * 10) / 10; // snap to 0.1° so small moves don't churn the subscription
function boxAround(lat, lon) {
  const c = { lat: r1(lat), lon: r1(lon) };
  return [[+(c.lat - HALF).toFixed(2), +(c.lon - HALF).toFixed(2)], [+(c.lat + HALF).toFixed(2), +(c.lon + HALF).toFixed(2)]];
}
const inBox = (b, lat, lon) => lat >= b[0][0] && lat <= b[1][0] && lon >= b[0][1] && lon <= b[1][1];
const dist = (a, b) => Math.max(Math.abs(a.lat - b.lat), Math.abs(a.lon - b.lon)); // degrees, chebyshev

function makeViewers(now = Date.now) {
  const m = new Map();
  return {
    set(id, lat, lon) {
      if (!validLoc(lat, lon)) return false;
      if (!m.has(id) && m.size >= MAX_VIEWERS) return false;
      m.set(id, { lat, lon, at: now() }); return true;
    },
    get(id) { const v = m.get(id); return v && now() - v.at < VIEWER_TTL_MS ? v : null; },
    expire() { const t = now(); for (const [k, v] of m) if (t - v.at >= VIEWER_TTL_MS) m.delete(k); },
    size() { return m.size; },
    boxes() {
      this.expire();
      const out = [CC_BOX], seen = new Set([JSON.stringify(CC_BOX)]);
      for (const v of m.values()) {
        const b = boxAround(v.lat, v.lon), k = JSON.stringify(b);
        if (seen.has(k) || out.some((o) => inBox(o, b[0][0], b[0][1]) && inBox(o, b[1][0], b[1][1]))) continue;
        seen.add(k); out.push(b);
      }
      return out;
    },
  };
}

// send(boxes) is called at most once per minGapMs, only when the box set changes; faster changes are queued (latest wins).
function makeSubscriber(send, { minGapMs = 1000, now = Date.now, setT = setTimeout } = {}) {
  let lastKey = null, lastAt = -Infinity, pending = null, timer = null;
  function flush() {
    timer = null; if (!pending) return;
    const b = pending; pending = null;
    if (JSON.stringify(b) === lastKey) return;
    lastKey = JSON.stringify(b); lastAt = now(); send(b);
  }
  return {
    update(boxes) {
      if (JSON.stringify(boxes) === lastKey && !pending) return;
      pending = boxes;
      if (timer) return;
      const wait = lastAt + minGapMs - now();
      if (wait <= 0) flush(); else timer = setT(flush, wait);
    },
    reset() { lastKey = null; lastAt = -Infinity; }, // on (re)connect: next update sends immediately
  };
}

module.exports = { CC_BOX, CC_CENTER, US, validLoc, boxAround, dist, makeViewers, makeSubscriber };
