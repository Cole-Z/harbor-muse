const test = require('node:test'); const assert = require('node:assert');
const { ingest, ships, liveStore } = require('../server');
const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
test('static + position AIS fields reach the /ships payload; missing ones stay null', () => {
  const now = Date.now(), MetaData = { MMSI: 366000777 };
  ingest(liveStore, { MessageType: 'ShipStaticData', MetaData, Message: { ShipStaticData: { Name: 'TEST', Type: 70, CallSign: 'WDX123@@', ImoNumber: 9123456, MaximumStaticDraught: 7.5, Dimension: { A: 100, B: 20, C: 10, D: 12 }, Eta: { Month: 11, Day: 1, Hour: 8, Minute: 30 }, Destination: 'CORPUS' } } }, now);
  ingest(liveStore, { MessageType: 'PositionReport', MetaData, Message: { PositionReport: { Latitude: 27.8, Longitude: -97.4, Sog: 5, Cog: 90, TrueHeading: 90, NavigationalStatus: 1 } } }, now);
  const s = liveStore.get(366000777);
  assert.deepStrictEqual([s.callsign, s.imo, s.draught, s.length, s.beam, s.eta, s.navStatus], ['WDX123', 9123456, 7.5, 120, 22, '11-01 08:30 UTC', 1]);
  ingest(liveStore, { MessageType: 'PositionReport', MetaData: { MMSI: 366000778 }, Message: { PositionReport: { Latitude: 27.8, Longitude: -97.4, Sog: 5, Cog: 90, TrueHeading: 90, NavigationalStatus: 15 } } }, now);
  const b = liveStore.get(366000778);
  assert.ok(b.navStatus == null && b.imo == null && b.eta == null);
  liveStore.delete(366000777); liveStore.delete(366000778);
});
test('secondary AIS row sits after the fields and before the photo strip', () => {
  const dl = html.indexOf('<dd id="sAge">'), x = html.indexOf('id="sExtra"'), fig = html.indexOf('<figure id="sPhoto"');
  assert.ok(dl > 0 && dl < x && x < fig);
});
