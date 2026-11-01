// Scene-time copy: separates "which scene" (live now vs recorded replay) from "how fresh is this ship's last fix".
(function (root) {
  function badgeText(mode, demo) {
    if (mode === 'replay') return 'REPLAY · recorded scene' + (demo ? ' · Corpus Christi' : '');
    if (mode === 'live') return 'LIVE · now' + (demo ? ' · Corpus Christi' : '');
    return String(mode || '').toUpperCase() + (demo ? ' · Corpus Christi' : '');
  }
  function ageLabel(mode) { return mode === 'replay' ? 'Last fix (replay)' : 'Last position'; }
  function ageText(ageSec, stale, mode) {
    const s = Number.isFinite(ageSec) ? Math.max(0, Math.round(ageSec)) : null;
    const base = s == null ? 'unknown' : (s < 60 ? s + ' s ago' : Math.round(s / 60) + ' min ago');
    return base + (mode === 'replay' && s != null ? ' on replay clock' : '') + (stale ? ' (stale)' : '');
  }
  const api = { badgeText, ageLabel, ageText };
  if (typeof module === 'object' && module.exports) module.exports = api; else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this);
