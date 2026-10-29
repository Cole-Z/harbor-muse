// Viewer-driven AIS bounding boxes: per-viewer ~0.4° squares + the Corpus Christi demo box, throttled resubscribe.
const CC_BOX = [[27.58, -97.42], [27.90, -97.03]];
const CC_CENTER = { lat: 27.78, lon: -97.30 };
const US = { minLat: 24, maxLat: 49, minLon: -125, maxLon: -66 };
const HALF = 0.2, VIEWER_TTL_MS = 10 * 60e3, MAX_VIEWERS = 50;
const MAX_BOXES = 10, MAX_MERGE_SPAN = 1; // soft cap on BoundingBoxes per subscription (CC box always included)

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
const overlaps = (a, b) => a[0][0] <= b[1][0] && b[0][0] <= a[1][0] && a[0][1] <= b[1][1] && b[0][1] <= a[1][1];
const union = (a, b) => [[Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])], [Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1])]];
const span = (b) => Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]);
const contains = (o, b) => inBox(o, b[0][0], b[0][1]) && inBox(o, b[1][0], b[1][1]);
// CC box first, then viewer boxes newest-first; overlapping boxes merge (if the union stays ≤1°), duplicates drop,
// and past the cap the oldest viewers are dropped. The CC box is never dropped.
function capBoxes(viewerBoxes, max = MAX_BOXES) {
  const out = [];
  for (const b of viewerBoxes) {
    if (contains(CC_BOX, b) || out.some((o) => contains(o, b))) continue;
    const i = out.findIndex((o) => overlaps(o, b) && span(union(o, b)) <= MAX_MERGE_SPAN);
    if (i >= 0) out[i] = union(out[i], b).map((p) => p.map((v) => +v.toFixed(2))); else out.push(b);
  }
  return [CC_BOX, ...out.slice(0, max - 1)];
}
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
      const vs = [...m.values()].sort((a, b) => b.at - a.at); // newest first so oldest drop past the cap
      return capBoxes(vs.map((v) => boxAround(v.lat, v.lon)));
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

module.exports = { MAX_BOXES, capBoxes, CC_BOX, CC_CENTER, US, validLoc, boxAround, dist, makeViewers, makeSubscriber };
