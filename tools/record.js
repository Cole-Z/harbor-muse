// Record raw aisstream frames for the bay box to a JSONL file. Usage: node tools/record.js out.jsonl minutes
const fs = require('fs'); const WebSocket = require('ws');
const [out = 'recording.jsonl', mins = '30'] = process.argv.slice(2);
const key = process.env.AISSTREAM_API_KEY; if (!key) { console.error('AISSTREAM_API_KEY not set'); process.exit(1); }
const fd = fs.openSync(out, 'a'); let bytes = 0, n = 0;
const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
ws.on('open', () => ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [[[27.58, -97.42], [27.90, -97.03]]],
  FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport', 'ShipStaticData'] })));
ws.on('message', (d) => { const s = d.toString(); bytes += s.length + 1; if (bytes > 1.9e6) return done(); fs.writeSync(fd, s + '\n'); n++; });
ws.on('close', () => done()); ws.on('error', (e) => console.error('ws error', e.message));
setTimeout(done, +mins * 60000);
function done() { console.log(`recorded ${n} frames`); process.exit(0); }
