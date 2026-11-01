'use strict';
// "Tell me more": Muse Spark web-search enrichment for one ship (Researcher-verified /v1/responses shape).
const { AskError } = require('./ask');
const URL_DEFAULT = 'https://api.meta.ai/v1/responses';
const MODEL = 'muse-spark-1.3';

function validate(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return 'body must be an object';
  if (!Number.isInteger(j.mmsi) || j.mmsi <= 0 || j.mmsi > 999999999) return 'mmsi must be a 9-digit number';
  if (j.name != null && (typeof j.name !== 'string' || j.name.length > 60)) return 'name must be a short string';
  if (j.imo != null && !/^\d{7}$/.test(String(j.imo))) return 'imo must be 7 digits';
  return null;
}
const clean = (s) => String(s).replace(/[\r\n`]/g, ' ').trim().slice(0, 60);
const { typeLabel } = require('../public/shiptype');
const { flagOf } = require('../public/mmsimid');
const NAV = ['under way using engine', 'at anchor', 'not under command', 'restricted manoeuvrability', 'constrained by draught',
  'moored', 'aground', 'engaged in fishing', 'under way sailing'];
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// Selected-scene AIS snapshot ("FEED") the model must treat as truth. Unknown -> null, never guessed.
function buildFeed(ship) {
  const s = ship || {}, f = flagOf(s.mmsi);
  const nav = Number.isInteger(s.navStatus) ? s.navStatus : null;
  const len = num(s.length) ?? num(s.dims && s.dims.length), beam = num(s.beam) ?? num(s.dims && s.dims.beam);
  return {
    name: s.name ? clean(s.name) : null, mmsi: s.mmsi, imo: s.imo || null, callsign: s.callsign ? clean(s.callsign) : null,
    type: num(s.type), typeLabel: s.typeLabel || (num(s.type) != null ? typeLabel(s.type) : null), flag: s.flag || (f ? f.country : null),
    sogKn: num(s.sog), cogDeg: num(s.cog), hdgDeg: num(s.hdg) === 511 ? null : num(s.hdg),
    dest: s.dest ? clean(s.dest) : null, navStatus: nav, navStatusText: nav != null && NAV[nav] ? NAV[nav] : null,
    draughtM: num(s.draught) || null, dims: len || beam ? { lengthM: len, beamM: beam } : null,
    ageSec: num(s.ageSec), mode: ['live', 'replay', 'waiting'].includes(s.mode) ? s.mode : null,
    asOf: typeof s.asOf === 'string' ? s.asOf.slice(0, 30) : null,
  };
}
const INSTRUCTION = [
  'You are Harbor Muse, explaining the selected ship to a curious observer looking at it on a live harbor map.',
  'FEED below is the selected-scene truth (AIS as of asOf; mode live = real-time feed, replay = recorded demo, waiting = no live data). Web search results are secondary evidence: use them only when they match this IMO or MMSI; otherwise treat them as a different vessel.',
  'Write ~100-160 words of plain language (fewer if little is known; omit empty sections, no padding), in this order with short bold labels:',
  '**What it is** - vessel type and its job in ordinary words.',
  '**Current activity (Reported)** - speed, course, nav status from FEED with the asOf timestamp. Speed alone (e.g. 0.0 kn) does not prove anchored, moored or waiting; say so unless navStatus confirms it.',
  '**Destination** - interpret the reported destination if reliable; else quote the raw value and say it is unclear.',
  '**Cargo** - what this type typically carries, kept separate from confirmed cargo; never invent cargo, voyage purpose or anchorage.',
  '**One fact** - one sourced fact or an accurate size comparison from FEED dims.',
  'Label claims Reported / Inferred / Unknown when helpful. Put IMO/MMSI/call sign last, briefly, or omit them.',
  'Output only the finished answer. Do not narrate research (no "I\'ll search", "I\'ll open", "I\'ll verify", "Let me").',
].join('\n');
function buildBody(ship) {
  return {
    model: MODEL,
    input: `${INSTRUCTION}\n\nFEED: ${JSON.stringify(buildFeed(ship))}`,
    tools: [{ type: 'web_search', search_context_size: 'medium' }],
    include: ['web_search_call.results'],
    max_output_tokens: 2500,
    reasoning: { effort: 'minimal' },
  };
}
// Pull final output_text + url_citation annotations (fallback: web_search_call results) from a Responses payload.
function parseResponse(j, mmsi) {
  const out = j && Array.isArray(j.output) ? j.output : null;
  if (!out) throw new AskError(502, 'Muse sent an unexpected reply.');
  const texts = [], sources = [], seen = new Set();
  const add = (url, title) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url) || seen.has(url) || sources.length >= 5) return;
    seen.add(url); let t = typeof title === 'string' && title.trim() ? title.trim() : '';
    if (!t) try { t = new URL(url).hostname; } catch { t = url; }
    sources.push({ title: t.slice(0, 80), url });
  };
  for (const item of out) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const c of item.content) {
      if (!c || c.type !== 'output_text' || typeof c.text !== 'string') continue;
      texts.push(c.text);
      for (const a of c.annotations || []) if (a && a.type === 'url_citation') add(a.url, a.title);
    }
  }
  const answer = texts.join('\n').trim();
  if (!answer) throw new AskError(502, j.status === 'incomplete' ? 'Muse ran out of room before answering. Try again.' : 'Muse sent an empty reply.');
  if (!sources.length) for (const item of out) if (item && item.type === 'web_search_call') {
    const rs = (item.results || (item.action && item.action.sources) || []);
    for (const r of rs) if (r) add(r.url, r.title);
  }
  const res = { answer: answer.slice(0, 2500), mmsi };
  if (sources.length) res.sources = sources;
  return res;
}
async function callTellMore({ key, url = URL_DEFAULT, ship, fetchImpl = fetch, timeoutMs = 45e3 }) {
  let r;
  try {
    r = await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(buildBody(ship)) });
  } catch { throw new AskError(502, 'Muse is unreachable right now. Try again in a moment.'); }
  if (!r.ok) throw new AskError(502, `Muse had a problem (HTTP ${r.status}). Try again in a moment.`);
  let j; try { j = await r.json(); } catch { throw new AskError(502, 'Muse sent an unreadable reply.'); }
  return parseResponse(j, ship.mmsi);
}
module.exports = { validate, buildFeed, buildBody, INSTRUCTION, parseResponse, callTellMore, MODEL, URL_DEFAULT };
