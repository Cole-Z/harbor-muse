'use strict';
// Path A push-to-talk: browser clip -> ffmpeg mono 24 kHz s16le WAV -> Muse file ASR. Audio and key never logged or stored.
const { spawn } = require('child_process');
const { AskError } = require('./ask');
const URL_DEFAULT = 'https://api.meta.ai/v1/asr/transcribe';
const MODEL = 'muse-voice-transcribe-1.0';
const MAX_BYTES = 2 * 1024 * 1024;
const KEYWORDS = ['MMSI', 'AIS', 'tug', 'tanker', 'container', 'Harbor Muse'];
const requestJson = () => ({ model: MODEL, mode: 'PUSH_TO_TALK', audioEncoding: 'WAV', languageBias: ['English'], keywords: KEYWORDS });

// Pull the first file part out of a multipart/form-data body (field "audio" preferred).
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return null;
  const delim = Buffer.from('--' + (m[1] || m[2]).trim());
  const parts = []; let i = buf.indexOf(delim);
  while (i !== -1) {
    const start = i + delim.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    const next = buf.indexOf(delim, start); if (next === -1) break;
    const part = buf.slice(start + 2, next - 2); // skip CRLF after delim and before next
    const he = part.indexOf('\r\n\r\n');
    if (he !== -1) {
      const head = part.slice(0, he).toString('utf8');
      const name = (/name="([^"]*)"/i.exec(head) || [])[1];
      const file = /filename="/i.test(head);
      parts.push({ name, file, data: part.slice(he + 4) });
    }
    i = next;
  }
  const p = parts.find((x) => x.name === 'audio') || parts.find((x) => x.file);
  return p && p.data.length ? p.data : null;
}

function toWav(input, { ffmpeg = process.env.FFMPEG || 'ffmpeg', timeoutMs = 15e3 } = {}) {
  return new Promise((resolve, reject) => {
    let p; try { p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', '-map_metadata', '-1', '-f', 'wav', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] }); }
    catch { return reject(new AskError(503, 'Voice is not set up on this server.')); }
    const out = []; let done = false;
    const fin = (e, v) => { if (done) return; done = true; clearTimeout(t); e ? reject(e) : resolve(v); };
    const t = setTimeout(() => { p.kill('SIGKILL'); fin(new AskError(400, 'Could not read that recording.')); }, timeoutMs);
    p.on('error', (e) => fin(new AskError(e.code === 'ENOENT' ? 503 : 400, e.code === 'ENOENT' ? 'Voice is not set up on this server.' : 'Could not read that recording.')));
    p.stdout.on('data', (d) => out.push(d));
    p.on('close', (code) => { const b = Buffer.concat(out); code === 0 && b.length > 44 ? fin(null, b) : fin(new AskError(400, 'Could not read that recording.')); });
    p.stdin.on('error', () => {}); p.stdin.end(input);
  });
}

async function transcribe({ key, wav, url = URL_DEFAULT, fetchImpl = fetch, timeoutMs = 20e3 }) {
  const call = async () => {
    const fd = new FormData();
    fd.append('request', new Blob([JSON.stringify(requestJson())], { type: 'application/json' }));
    fd.append('audio', new Blob([wav], { type: 'audio/wav' }), 'clip.wav');
    return fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(timeoutMs), headers: { Authorization: 'Bearer ' + key }, body: fd });
  };
  let r;
  for (let attempt = 0; attempt < 2; attempt++) { // retry once on network / 5xx
    try { r = await call(); } catch { r = null; }
    if (r && r.status < 500) break;
  }
  if (!r) throw new AskError(502, 'Voice is unreachable right now. Type instead.');
  if (r.status === 429) throw new AskError(429, 'Voice is busy — type instead.');
  if (r.status === 400 || r.status === 413) throw new AskError(400, 'Could not read that recording.');
  if (!r.ok) throw new AskError(502, `Voice had a problem (HTTP ${r.status}).`);
  let j; try { j = await r.json(); } catch { throw new AskError(502, 'Voice sent an unreadable reply.'); }
  const transcript = typeof j.transcript === 'string' ? j.transcript.trim().slice(0, 300) : '';
  return { transcript, text: transcript };
}
module.exports = { parseMultipart, toWav, transcribe, requestJson, MODEL, URL_DEFAULT, MAX_BYTES };
