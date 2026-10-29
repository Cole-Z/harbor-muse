// Merge recorded aisstream JSONL frames into replay.jsonl (sorted by time, deduped, <=2 MB).
const fs = require('fs');
const files = process.argv.slice(2);
const MAX = 2 * 1024 * 1024;
const seen = new Set(); const frames = [];
for (const f of files) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let m; try { m = JSON.parse(line); } catch { continue; }
  if (!m.MetaData || !m.MetaData.time_utc) continue;
  const key = m.MessageType + m.MetaData.MMSI + m.MetaData.time_utc;
  if (seen.has(key)) continue; seen.add(key);
  frames.push({ t: Date.parse(m.MetaData.time_utc.slice(0, 23).replace(' ', 'T') + 'Z'), line });
}
frames.sort((a, b) => a.t - b.t);
let out = '', n = 0;
for (const f of frames) { if (out.length + f.line.length + 1 > MAX) break; out += f.line + '\n'; n++; }
fs.writeFileSync('replay.jsonl', out);
console.log(`replay.jsonl: ${n} frames, ${out.length} bytes`);
