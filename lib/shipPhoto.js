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

async function commons(n, fetchFn) {
  const p = new URLSearchParams({ action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: `"${n.toLowerCase()}" ship filetype:bitmap`, gsrnamespace: '6', gsrlimit: '8', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '640' });
  const r = await fetchFn(API + '?' + p, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const pages = Object.values(((await r.json()).query || {}).pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  for (const pg of pages) {
    const ii = (pg.imageinfo || [])[0]; if (!ii) continue;
    const m = ii.extmetadata || {}, lic = strip(m.LicenseShortName && m.LicenseShortName.value);
    if (!FREE.test(lic)) continue;
    const hay = norm(pg.title) + ' ' + norm(strip(m.ImageDescription && m.ImageDescription.value));
    if (!(' ' + hay + ' ').includes(' ' + n + ' ')) continue; // substantial name match, word-bounded
    const who = strip(m.Artist && m.Artist.value) || 'Unknown author';
    return { url: ii.descriptionurl || ii.url, thumbUrl: ii.thumburl || ii.url, attribution: `Photo: ${who.slice(0, 80)} / Wikimedia Commons`, license: lic, match: 'name' };
  }
  return null;
}

function makeShipPhoto({ fetchFn = fetch, now = Date.now } = {}) {
  const cache = new Map();
  return async function lookup(name, kind) {
    const n = usableName(name);
    if (n) {
      const c = cache.get(n);
      let hit = c && now() - c.at < TTL ? c.v : undefined;
      if (hit === undefined) {
        try { hit = await commons(n, fetchFn); } catch { hit = null; }
        if (cache.size > 2000) cache.delete(cache.keys().next().value);
        cache.set(n, { at: now(), v: hit });
      }
      if (hit) return hit;
    }
    return typePhoto(kind);
  };
}
module.exports = { makeShipPhoto, usableName, typePhoto, KINDS };
