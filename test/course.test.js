const test=require('node:test'),assert=require('node:assert');
const {spawn}=require('node:child_process');
const {rhumbDest,stub}=require('../public/course.js');
test('due north 60 nm ≈ 1° lat',()=>{const d=rhumbDest(27,-97,0,60);assert.ok(Math.abs(d.lat-28)<0.01);assert.ok(Math.abs(d.lon+97)<1e-9)});
test('due east moves lon scaled by cos(lat)',()=>{const d=rhumbDest(60,0,90,30);assert.ok(Math.abs(d.lat-60)<1e-9);assert.ok(Math.abs(d.lon-1)<0.01,String(d.lon))});
test('12 kn → 6 nm over 30 min',()=>{const s=stub({lat:27.8,lon:-97.3,sog:12,cog:180});assert.equal(s.length,2);assert.ok(Math.abs((s[0].lat-s[1].lat)*60-6)<0.01)});
test('moored / bad data → no stub',()=>{assert.deepEqual(stub({lat:1,lon:1,sog:0.4,cog:10}),[]);assert.deepEqual(stub({lat:1,lon:1,sog:5,cog:360}),[]);assert.deepEqual(stub({lat:1,lon:1,sog:null,cog:10}),[]);assert.deepEqual(stub(null),[])});
test('sog 0.5 kn draws; below hides',()=>{assert.equal(stub({lat:1,lon:1,sog:0.5,cog:10}).length,2);assert.deepEqual(stub({lat:1,lon:1,sog:0.49,cog:10}),[])});
test('antimeridian wraps',()=>{const d=rhumbDest(0,179.9,90,60);assert.ok(d.lon<-179)});
test('/course.js is served',async()=>{
  const port=4100+Math.floor(Math.random()*90);
  const env={...process.env,PORT:port};delete env.AISSTREAM_API_KEY;
  const p=spawn('node',['server.js'],{env});
  try{await new Promise(r=>setTimeout(r,700));
    const r=await fetch('http://127.0.0.1:'+port+'/course.js');
    assert.equal(r.status,200);assert.match(r.headers.get('content-type')||'',/javascript/);
    assert.match(await r.text(),/function stub/);
    const html=await(await fetch('http://127.0.0.1:'+port+'/')).text();
    assert.match(html,/src="\/course\.js"/);
  }finally{p.kill()}
});
