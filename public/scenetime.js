// Scene-time copy: separates "which scene" (live now vs recorded replay) from "how fresh is this ship's last fix".
(function (root) {
  // Short local clock time ("6:23 AM") from an ISO asOf; '' when missing/invalid.
  function clock(asOf) {
    const d = asOf ? new Date(asOf) : null;
    if (!d || isNaN(d)) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function badgeText(mode, demo, asOf) {
    const t = clock(asOf);
    if (mode === 'replay') return 'REPLAY · Corpus Christi demo' + (t ? ' · Scene ' + t : '');
    if (mode === 'live') return 'LIVE' + (demo ? ' · Corpus Christi' : '') + (t ? ' · as of ' + t : ' · now');
    return String(mode || '').toUpperCase() + (demo ? ' · Corpus Christi' : '');
  }
  const QUIET_DEMO_NOTE = 'No live ships here — play the Corpus Christi replay for the demo.';
  // Note line for the quiet-feed path; never auto-switches, just points at the demo button.
  function noteText(d, demo) {
    if (!demo && d && d.demoAvailable && (d.mode === 'waiting' || (d.mode === 'live' && !(d.ships || []).length))) return QUIET_DEMO_NOTE;
    return (d && d.note) || (demo ? 'Demo: Corpus Christi replay' : '');
  }
  function ageLabel(mode) { return mode === 'replay' ? 'Last fix (replay)' : 'Last position'; }
  function ageText(ageSec, stale, mode) {
    const s = Number.isFinite(ageSec) ? Math.max(0, Math.round(ageSec)) : null;
    const base = s == null ? 'unknown' : (s < 60 ? s + ' s ago' : Math.round(s / 60) + ' min ago');
    return base + (mode === 'replay' && s != null ? ' on replay clock' : '') + (stale ? ' (stale)' : '');
  }
  const api = { clock, badgeText, noteText, QUIET_DEMO_NOTE, ageLabel, ageText };
  if (typeof module === 'object' && module.exports) module.exports = api; else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this);
