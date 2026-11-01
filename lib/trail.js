// Per-MMSI ring buffer of recent positions: at most MAX points, none older than AGE_MS.
// Defaults: 240 pts / 2 h (~11 KB per moving ship worst case). Fixes within MIN_STEP_M of the
// last kept point only refresh its timestamp, so GPS jitter and stationary ships don't pile up
// or draw zigzags.
const MAX = 240, AGE_MS = 2 * 60 * 60e3, MIN_STEP_M = 15;
function metres(a, b) {
  const R = 6371e3, r = Math.PI / 180, dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  return R * Math.hypot(dLat, dLon);
}
function push(s, lat, lon, now) {
  const tr = s.trail || (s.trail = []);
  const last = tr[tr.length - 1];
  if (last && metres(last, { lat, lon }) < MIN_STEP_M) { last.t = now; return trim(s, now); }
  tr.push({ lat, lon, t: now });
  if (tr.length > MAX) tr.splice(0, tr.length - MAX);
  return trim(s, now);
}
function trim(s, now) {
  const tr = s.trail || [];
  let i = 0; while (i < tr.length && now - tr[i].t > AGE_MS) i++;
  if (i) tr.splice(0, i);
  return tr;
}
module.exports = { push, trim, metres, MAX, AGE_MS, MIN_STEP_M };
