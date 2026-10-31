// Ship photo lookup: Wikimedia Commons named match (free licenses only), else bundled type photo.
// No keys involved; never log names, MMSI or viewer location.
const KINDS = ['cargo', 'tanker', 'tug', 'passenger', 'fishing', 'unknown'];
const TTL = 24 * 3600e3, API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'HarborMuse/0.1 (https://github.com/Cole-Z/harbor-muse)';
const FREE = /^(cc0|cc[- ]by(-sa)?([- ][\d.]+)?|public domain|pd\b|pd-)/i;

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
function usableName(name) {
  const n = norm(name);
  if (n.replace(/ /g, '').length < 4 || /^(UNKNOWN|SHIP|VESSEL|BOAT|N ?A|NONE|TEST)$/.test(n) || /^\d+$/.test(n.replace(/ /g, ''))) return null;
  return n;
}
const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const typePhoto = (kind) => ({ url: '/assets/ship-photos/' + (KINDS.includes(kind) ? kind : 'unknown') + '.webp', thumbUrl: '/assets/ship-photos/' + (KINDS.includes(kind) ? kind : 'unknown') + '.webp', attribution: 'Type photo (not this vessel)', license: null, match: 'type' });

// Maritime signal required; false friends (Apollo rocket, aircraft, cars, trains, news crops) rejected.
const MARITIME = /\b(ships?|vessels?|boats?|tankers?|cargo|freighters?|bulk ?carriers?|bulk|container ?ships?|containers?|tugs?|tugboats?|towing|ferry|ferries|passenger ships?|cruise|trawlers?|fishing vessels?|naval|warships?|yachts?|imo ?\d*|mmsi|maritime|harbou?r|port of)\b/i;
const REJECT = /\b(rockets?|apollo program|apollo \d+|apollo (spacecraft|mission|lunar|command)|nasa|spacecraft|space ?shuttle|satellites?|aircraft|airplanes?|aeroplanes?|airliners?|airlines?|cars?|automobiles?|trains?|locomotives?|railway|buses|bus|trucks?|lorry|motorcycles?|portrait of|newspapers?|news ?clipping|comic strip|logo)\b/i;
const STRONG_MARITIME = /\b(ships?|vessels?|tankers?|freighters?|tugs?|tugboats?|ferry|trawlers?|imo ?\d{7}|mmsi)\b/i;
function judge(hay, n, ids = {}) {
  const H = ' ' + norm(hay) + ' ';
  const idHit = (ids.imo && H.includes(' ' + ids.imo + ' ')) || (ids.mmsi && H.includes(' ' + ids.mmsi + ' '));
  const nameHit = H.includes(' ' + n + ' ');
  if (!nameHit && !idHit) return false; // substantial name (or id) match, word-bounded
  if (!MARITIME.test(hay)) return false;
  if (REJECT.test(hay) && !(STRONG_MARITIME.test(hay) && (idHit || nameHit) && (hay.match(new RegExp(STRONG_MARITIME.source, 'gi')) || []).length >= 2)) return false;
  return true;
}
const okSize = (ii) => !ii.width || !ii.height || (Math.min(ii.width, ii.height) >= 200 && ii.width / ii.height <= 3.5);

function queries(n, { imo, mmsi } = {}) {
  const q = [];
  if (imo) q.push(`"IMO ${imo}" (ship OR vessel) filetype:bitmap`);
  if (mmsi) q.push(`${mmsi} "${n.toLowerCase()}" (ship OR vessel) filetype:bitmap`);
  q.push(`"${n.toLowerCase()}" (ship OR vessel) filetype:bitmap`);
  return q;
}

async function search(gsr, n, ids, fetchFn) {
  const p = new URLSearchParams({ action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: gsr, gsrnamespace: '6', gsrlimit: '8', prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '640' });
  const r = await fetchFn(API + '?' + p, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const pages = Object.values(((await r.json()).query || {}).pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  for (const pg of pages) {
    const ii = (pg.imageinfo || [])[0]; if (!ii) continue;
    const m = ii.extmetadata || {}, lic = strip(m.LicenseShortName && m.LicenseShortName.value);
    if (!FREE.test(lic) || !okSize(ii)) continue;
    const hay = [String(pg.title || '').replace(/^File:/i, '').replace(/[_.]/g, ' '), strip(m.ImageDescription && m.ImageDescription.value), strip(m.ObjectName && m.ObjectName.value), strip(m.Categories && m.Categories.value).replace(/\|/g, ' ; ')].join(' ; ');
    if (!judge(hay, n, ids)) continue;
    const who = strip(m.Artist && m.Artist.value) || 'Unknown author';
    return { url: ii.descriptionurl || ii.url, thumbUrl: ii.thumburl || ii.url, attribution: `Photo: ${who.slice(0, 80)} / Wikimedia Commons`, license: lic, match: 'name' };
  }
  return null;
}
async function commons(n, fetchFn, ids) {
  for (const q of queries(n, ids)) { const hit = await search(q, n, ids, fetchFn); if (hit) return hit; }
  return null;
}

function makeShipPhoto({ fetchFn = fetch, now = Date.now } = {}) {
  const cache = new Map();
  return async function lookup(name, kind, opts = {}) {
    const n = usableName(name);
    const ids = { imo: /^\d{7}$/.test(String(opts.imo || '')) ? String(opts.imo) : null, mmsi: /^\d{9}$/.test(String(opts.mmsi || '')) ? String(opts.mmsi) : null };
    if (n) {
      const key = n + '|' + (ids.imo || '') + '|' + (ids.mmsi || ''), c = cache.get(key);
      let hit = c && now() - c.at < TTL ? c.v : undefined;
      if (hit === undefined) {
        try { hit = await commons(n, fetchFn, ids); } catch { hit = null; }
        if (cache.size > 2000) cache.delete(cache.keys().next().value);
        cache.set(key, { at: now(), v: hit });
      }
      if (hit) return hit;
    }
    return typePhoto(kind);
  };
}
module.exports = { judge, queries, makeShipPhoto, usableName, typePhoto, KINDS };
