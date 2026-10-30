const test=require('node:test'),assert=require('node:assert');const C=require('../public/cone.js');
const o={lat:27.8,lon:-97.1},nm=1852/111320;
test('ship dead ahead within 5 nm is in cone',()=>{assert.ok(C.inCone(o,0,{lat:o.lat+2*nm,lon:o.lon}))});
test('outside range or angle is out',()=>{assert.ok(!C.inCone(o,0,{lat:o.lat+6*nm,lon:o.lon}));assert.ok(!C.inCone(o,90,{lat:o.lat+2*nm,lon:o.lon}));assert.ok(!C.inCone(o,0,{lat:o.lat-2*nm,lon:o.lon}))});
test('edge ±20° and wraparound',()=>{const s={lat:o.lat+2*nm,lon:o.lon};assert.ok(C.inCone(o,19,s));assert.ok(C.inCone(o,341,s));assert.ok(!C.inCone(o,25,s));assert.ok(!C.inCone(o,null,s))});
test('wedge ring closed, arc at ~5 nm',()=>{const w=C.wedge(o,45);assert.deepEqual(w[0],w[w.length-1]);assert.equal(w.length,19);
 for(const p of w.slice(1,-1)){const d=C.dist(o,{lon:p[0],lat:p[1]})/1852;assert.ok(Math.abs(d-5)<0.01,String(d))}
 const mid=w[9];assert.ok(Math.abs(C.bearing(o,{lon:mid[0],lat:mid[1]})-45)<0.5)});
test('throttle coalesces',async()=>{let n=0,last;const f=C.throttle(v=>{n++;last=v},50);f(1);f(2);f(3);assert.equal(n,1);await new Promise(r=>setTimeout(r,80));assert.equal(n,2);assert.equal(last,3)});
