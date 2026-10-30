// Builds data/mmsiMid.json from tools/mid-src.txt (ITU-R M.585 / ITU MARS "Maritime Identification Digits" table).
// Source: https://www.itu.int/en/ITU-R/terrestrial/fmd/Pages/mid.aspx  — run: node tools/build-mid.js
const fs = require('fs'), path = require('path');
const dn = new Intl.DisplayNames(['en'], { type: 'region' });
const out = {};
for (const line of fs.readFileSync(path.join(__dirname, 'mid-src.txt'), 'utf8').split('\n')) {
  const m = line.match(/^(\d{3}) ([A-Z]{2})(?: (.+))?$/); if (!m) continue;
  let name = m[3] || dn.of(m[2]);
  if (m[3] && !['Alaska'].includes(m[3])) name = m[3] + (m[2] === 'TF' ? ' (FR)' : m[2] === 'SH' && m[3] === 'Ascension' ? '' : ' (' + dn.of(m[2]) + ')');
  if (m[3] === 'Alaska') name = 'United States (Alaska)';
  out[m[1]] = [m[2], name.replace('Hong Kong SAR China', 'Hong Kong').replace('Macao SAR China', 'Macao').replace('Vatican City', 'Vatican City')];
}
fs.writeFileSync(path.join(__dirname, '..', 'data', 'mmsiMid.json'), JSON.stringify(out) + '\n');
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'mmsimid.js'), 'utf8')
  .replace(/const MID=\{.*?\};/s, 'const MID=' + JSON.stringify(out) + ';');
fs.writeFileSync(path.join(__dirname, '..', 'public', 'mmsimid.js'), js);
console.log(Object.keys(out).length, 'MIDs');
