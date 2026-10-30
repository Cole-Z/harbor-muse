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
function buildBody({ mmsi, name, imo }) {
  const n = name ? clean(name) : 'unknown';
  return {
    model: MODEL,
    input: `Enrich ship card. name=${n} IMO=${imo || 'unknown'} MMSI=${mmsi}. 2-4 sentences. Cite. Only facts matching IMO/MMSI; else uncertain.`,
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
  const res = { answer: answer.slice(0, 1200), mmsi };
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
module.exports = { validate, buildBody, parseResponse, callTellMore, MODEL, URL_DEFAULT };
