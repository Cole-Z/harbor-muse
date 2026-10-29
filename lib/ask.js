// /ask helpers: validation, rate limit, ranking, Spark call. Never logs q, location, key, or Spark bodies.
const NM = 1852, R = 6371000, rad = Math.PI / 180;
const MUSE_URL_DEFAULT = 'https://api.meta.ai/v1/chat/completions';
const MODEL = 'muse-spark-1.3', MAX_TOKENS = 800;
const SYSTEM = 'You are Harbor Muse. Answer ONLY from SNAPSHOT (ships near the user\'s view). Null/missing -> "unknown". ' +
  'Never guess names, cargo, origin, destination. If no ship clearly matches, say so and list <=3 candidates. ' +
  'Return {"answer": "<<=2 sentences>", "mmsi": "<mmsi digits>"|null, "confidence": "high"|"low"|"unknown"}.';
const SCHEMA = { type: 'json_schema', json_schema: { name: 'harbor_answer', strict: true, schema: {
  type: 'object', additionalProperties: false, required: ['answer', 'mmsi', 'confidence'],
  properties: { answer: { type: 'string' }, mmsi: { type: ['string', 'null'] }, confidence: { type: 'string', enum: ['high', 'low', 'unknown'] } } } } };

const num = (v) => typeof v === 'number' && Number.isFinite(v);
function validate(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return 'body must be an object';
  if (typeof j.q !== 'string' || !j.q.trim() || j.q.length > 300) return 'q must be 1-300 chars';
  if (j.mmsi != null && !(Number.isInteger(j.mmsi) && j.mmsi > 0 && j.mmsi < 1e9)) return 'bad mmsi';
  if (j.view != null) {
    const v = j.view; if (typeof v !== 'object' || !['n', 's', 'e', 'w'].every((k) => num(v[k]))) return 'bad view';
    if (!(v.n >= v.s && Math.abs(v.n) <= 90 && Math.abs(v.s) <= 90 && Math.abs(v.e) <= 180 && Math.abs(v.w) <= 180)) return 'bad view';
  }
  if ((j.lat == null) !== (j.lon == null)) return 'lat and lon go together';
  if (j.lat != null && !(num(j.lat) && num(j.lon) && Math.abs(j.lat) <= 90 && Math.abs(j.lon) <= 180)) return 'bad lat/lon';
  if (j.heading != null && !(num(j.heading) && j.heading >= 0 && j.heading < 360)) return 'bad heading';
  return null;
}

function makeLimiter(max = 10, winMs = 10 * 60e3) {
  const hits = new Map();
  return { take(id, now = Date.now()) {
    const a = (hits.get(id) || []).filter((t) => now - t < winMs);
    if (a.length >= max) { hits.set(id, a); return false; }
    a.push(now); hits.set(id, a);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < winMs)) hits.delete(k);
    return true;
  } };
}

function dist(a, b) {
  const dl = (b.lat - a.lat) * rad, dn = (b.lon - a.lon) * rad;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dl / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dn / 2) ** 2));
}
function bearing(a, b) {
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const inView = (s, v) => s.lat <= v.n && s.lat >= v.s && (v.w <= v.e ? s.lon >= v.w && s.lon <= v.e : s.lon >= v.w || s.lon <= v.e);
// No length in our store; AIS type group is the size proxy (tanker > cargo > passenger > other > unknown).
const sizeRank = (t) => ({ 8: 5, 7: 4, 6: 3 })[Math.floor((t || 0) / 10)] || (t ? 1 : 0);

// ships: [{mmsi,lat,lon,sog,type,...}]. Returns {candidates (≤3), snapshot (≤25)}.
function rank(ships, { mmsi, view, lat, lon, heading } = {}) {
  const pos = ships.filter((s) => s.lat != null && s.lon != null);
  const user = lat != null ? { lat, lon } : null;
  const ref = user || (view ? { lat: (view.n + view.s) / 2, lon: (view.e + view.w) / 2 } : null);
  const d = (s) => (ref ? dist(ref, s) : 0);
  const pool = view ? pos.filter((s) => inView(s, view)) : pos;
  const out = [], add = (s) => { if (s && !out.includes(s)) out.push(s); };
  add(pos.find((s) => s.mmsi === mmsi));
  if (user && heading != null)
    pos.filter((s) => dist(user, s) <= 5 * NM && angDiff(bearing(user, s), heading) <= 20).sort((a, b) => d(a) - d(b)).forEach(add);
  pool.filter((s) => s.sog >= 0.5).sort((a, b) => d(a) - d(b)).forEach(add);
  [...pool].sort((a, b) => sizeRank(b.type) - sizeRank(a.type) || d(a) - d(b)).forEach(add);
  const candidates = out.slice(0, 3);
  const snapshot = [...candidates, ...pos.filter((s) => !candidates.includes(s)).sort((a, b) => d(a) - d(b))].slice(0, 25);
  return { candidates, snapshot };
}

const slim = (s) => ({ mmsi: s.mmsi, name: s.name ?? null, type: s.type ?? null, lat: s.lat, lon: s.lon, sog: s.sog ?? null,
  cog: s.cog ?? null, hdg: s.hdg ?? null, dest: s.dest ?? null, ageSec: s.ageSec ?? null });
function userMessage(q, sel, loc, ranked) {
  return `Q: ${q}\nSELECTED: ${sel ?? 'none'}\nUSER_LOCATION: ${loc ? JSON.stringify(loc) : 'unknown'}\n` +
    `CANDIDATES: ${JSON.stringify(ranked.candidates.map((s) => s.mmsi))}\nSNAPSHOT: ${JSON.stringify(ranked.snapshot.map(slim))}`;
}

class AskError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const RETRY_DELAYS = [500, 1000, 2000, 4000]; // 5 attempts total on 404 model_not_found
const jitter = (ms) => Math.round(ms * (0.8 + Math.random() * 0.4));
const FALLBACK_MODEL = 'muse-spark-1.1', FALLBACK_DELAYS = [500, 1000, 2000, 4000]; // 5 attempts
const isModelNotFound = async (r) => {
  if (r.status !== 404) return false;
  try { const j = await r.json(); const c = j && j.error && (j.error.code || j.error.type); return !c || c === 'model_not_found'; }
  catch { return true; }
};
async function callSpark({ key, url = MUSE_URL_DEFAULT, user, fetchImpl = fetch, timeoutMs = 30e3,
  sleep = (ms) => new Promise((res) => setTimeout(res, ms)), delays = RETRY_DELAYS,
  fallbackDelays = FALLBACK_DELAYS, log = (m) => console.log(m) }) {
  const send = async (model, ds) => {
    const body = JSON.stringify({ model, max_tokens: MAX_TOKENS, reasoning_effort: 'minimal',
      response_format: SCHEMA, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] });
    let r;
    for (let attempt = 0; ; attempt++) {
      try {
        r = await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body });
      } catch { throw new AskError(502, 'Muse is unreachable right now. Try again in a moment.'); }
      // Meta's registry intermittently returns false 404 model_not_found; retry only that.
      if (r.status !== 404 || attempt >= ds.length) return r;
      await sleep(jitter(ds[attempt]));
    }
  };
  let r = await send(MODEL, delays);
  // Demo unblock: only a persistent 404 model_not_found on 1.3 falls back to muse-spark-1.1 (same body). Log model name only.
  if (await isModelNotFound(r)) { log('ask fallback:' + FALLBACK_MODEL); r = await send(FALLBACK_MODEL, fallbackDelays); }
  if (!r.ok) throw new AskError(502, `Muse had a problem (HTTP ${r.status}). Try again in a moment.`);
  let j; try { j = await r.json(); } catch { throw new AskError(502, 'Muse sent an unreadable reply.'); }
  const c = j && j.choices && j.choices[0];
  if (!c || c.finish_reason === 'length' || c.message == null || c.message.content == null)
    throw new AskError(502, 'Muse ran out of room before answering. Try a shorter question.');
  return parseAnswer(c.message.content);
}
function parseAnswer(content) {
  let a; try { a = typeof content === 'string' ? JSON.parse(content) : content; } catch { throw new AskError(502, 'Muse sent an unreadable reply.'); }
  // Schema says string|null; normalize to the numeric MMSI the store uses (also tolerate a bare number).
  if (a && typeof a.mmsi === 'string') { const t = a.mmsi.trim(); a.mmsi = t === '' ? null : /^\d{1,9}$/.test(t) ? Number(t) : a.mmsi; }
  if (!a || typeof a.answer !== 'string' || !a.answer.trim() || !['high', 'low', 'unknown'].includes(a.confidence) ||
      !(a.mmsi === null || Number.isInteger(a.mmsi))) throw new AskError(502, 'Muse sent an unexpected reply.');
  return { answer: a.answer.trim().slice(0, 600), mmsi: a.mmsi, confidence: a.confidence };
}

module.exports = { validate, makeLimiter, rank, userMessage, callSpark, parseAnswer, AskError, dist, bearing, SYSTEM, SCHEMA, MODEL, FALLBACK_MODEL, MAX_TOKENS };
