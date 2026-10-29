// Per-MMSI ring buffer of recent positions: at most MAX points, none older than AGE_MS.
const MAX = 20, AGE_MS = 15 * 60e3;
function push(s, lat, lon, now) {
  const tr = s.trail || (s.trail = []);
  const last = tr[tr.length - 1];
  if (last && last.lat === lat && last.lon === lon) { last.t = now; return tr; } // stationary: refresh, don't pile up
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
module.exports = { push, trim, MAX, AGE_MS };
