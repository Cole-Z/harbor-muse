const test=require('node:test'),assert=require('node:assert');const {sunTimes,isDay}=require('../public/sun.js');
const CC={lat:27.78,lon:-97.30};
test('Corpus Christi Oct 28 sunrise ~12:40Z, sunset ~23:50Z',()=>{const s=sunTimes(new Date('2026-10-28T18:00Z'),CC.lat,CC.lon);
 const m=x=>new Date(x).getUTCHours()*60+new Date(x).getUTCMinutes();assert.ok(Math.abs(m(s.rise)-(12*60+41))<8,new Date(s.rise).toISOString());assert.ok(Math.abs(m(s.set)-(23*60+50))<8,new Date(s.set).toISOString())});
test('isDay noon vs midnight local',()=>{assert.equal(isDay(new Date('2026-10-28T18:00Z'),CC.lat,CC.lon),true);assert.equal(isDay(new Date('2026-10-29T04:00Z'),CC.lat,CC.lon),false);
 assert.equal(isDay(new Date('2026-10-29T03:30Z'),47.6,-122.3),false);assert.equal(isDay(new Date('2026-10-28T20:00Z'),47.6,-122.3),true)});
test('polar',()=>{assert.equal(isDay(new Date('2026-06-21T12:00Z'),78,15),true);assert.equal(isDay(new Date('2026-12-21T12:00Z'),78,15),false)});
