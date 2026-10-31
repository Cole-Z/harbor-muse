// One-time build-time bake of type illustrations via Muse Image (NOT used at runtime).
// Run: MUSE_API_KEY=... node tools/bake-type-photos.mjs [type ...]   (requires ffmpeg)
// Output: public/assets/ship-photos/{type}.webp, 640x360, < ~40KB. ~$0.01/image.
import { writeFileSync, mkdtempSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'assets', 'ship-photos');
const STYLE = 'Clean editorial illustration, three-quarter elevated view from above, entire vessel visible and centered on calm water, soft neutral grey-blue background, even daylight. No text, no letters, no readable name or IMO number, no logos, no flags with text, no watermark, no border. Wide 16:9 composition.';
const PROMPTS = {
  cargo: 'A large container cargo ship loaded with colorful stacked containers, bridge at the stern.',
  tanker: 'A large oil/chemical tanker ship with long flat deck, pipework and manifold, accommodation at the stern.',
  tug: 'A sturdy harbor tugboat with tall wheelhouse, heavy black fendering around the hull.',
  passenger: 'A modern passenger cruise ship / ferry with many decks of windows and balconies, white hull.',
  fishing: 'A commercial fishing trawler with outriggers, nets and winches on the aft deck.',
  unknown: 'A generic small coastal workboat of indeterminate type, simple silhouette, muted colors.',
};
const key = process.env.MUSE_API_KEY;
if (!key) { console.error('MUSE_API_KEY not set'); process.exit(1); }
const types = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PROMPTS);
const tmp = mkdtempSync(path.join(tmpdir(), 'bake-'));

for (const type of types) {
  const res = await fetch('https://api.meta.ai/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'muse-image-1.0', prompt: `${PROMPTS[type]} ${STYLE}`, output_format: 'webp', reasoning_strength: 'low' }),
  });
  if (!res.ok) throw new Error(`${type}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const raw = path.join(tmp, `${type}-raw.webp`);
  writeFileSync(raw, Buffer.from(j.data[0].b64_json, 'base64'));
  const out = path.join(OUT, `${type}.webp`);
  for (const q of [70, 60, 50, 40, 30]) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'scale=640:360:force_original_aspect_ratio=increase,crop=640:360', '-c:v', 'libwebp', '-quality', String(q), out]);
    if (statSync(out).size < 40_000) break;
  }
  console.log(`${type}: ${statSync(out).size} bytes`);
}
