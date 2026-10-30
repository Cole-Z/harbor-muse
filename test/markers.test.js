const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const T=require('../public/shiptype');
test('marker svgs exist for every ship kind and are valid svg',()=>{for(const n of T.NAMES){const f=path.join(__dirname,'..','public','assets','markers',n+'.svg');const s=fs.readFileSync(f,'utf8');assert.match(s,/^<svg[^>]*viewBox="0 0 24 24"/);assert.ok(s.length<1500)}});
test('markerUrl maps AIS type to bucket',()=>{assert.equal(T.markerUrl(75),'/assets/markers/cargo.svg');assert.equal(T.markerUrl(84),'/assets/markers/tanker.svg');assert.equal(T.markerUrl(52),'/assets/markers/tug.svg');assert.equal(T.markerUrl(null),'/assets/markers/unknown.svg')});
test('service worker precaches markers',()=>{const s=fs.readFileSync(path.join(__dirname,'..','public','sw.js'),'utf8');for(const n of T.NAMES)assert.ok(s.includes('/assets/markers/'+n+'.svg'))});
test('map uses DOM silhouette imgs rotated by heading, not arrows',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  assert.match(html,/ShipType\.markerUrl\(s\.type\)/);
  assert.match(html,/k\.m\.setRotation\(rot\(s\)\)/);
  assert.match(html,/querySelector\('img'\).*rotate\('\+rot\(s\)/);
  assert.doesNotMatch(html,/L19 21 L12 17 L5 21/);
  assert.doesNotMatch(html,/addSource\(['"]ships['"]/);
});
