// "Looking at" cone math. Same numbers as /ask ranking (lib/ask.js): ±20°, 5 nm. Browser global + CommonJS.
(function(root){
  const NM=1852,R=6371000,r=Math.PI/180,HALF_DEG=20,RANGE_NM=5;
  const dist=(a,b)=>{const dl=(b.lat-a.lat)*r,dn=(b.lon-a.lon)*r;return 2*R*Math.asin(Math.sqrt(Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2))};
  const bearing=(a,b)=>{const y=Math.sin((b.lon-a.lon)*r)*Math.cos(b.lat*r),x=Math.cos(a.lat*r)*Math.sin(b.lat*r)-Math.sin(a.lat*r)*Math.cos(b.lat*r)*Math.cos((b.lon-a.lon)*r);return(Math.atan2(y,x)/r+360)%360};
  const angDiff=(a,b)=>{const d=Math.abs(((a-b)%360+360)%360);return d>180?360-d:d};
  function dest(o,brg,m){const d=m/R,t=brg*r,p1=o.lat*r,l1=o.lon*r;const p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(t));
    const l2=l1+Math.atan2(Math.sin(t)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2));return{lat:p2/r,lon:((l2/r+540)%360)-180}}
  function inCone(o,heading,s,half=HALF_DEG,nm=RANGE_NM){if(!o||heading==null||!s||!isFinite(s.lat)||!isFinite(s.lon))return false;
    const d=dist(o,s);if(d>nm*NM)return false;if(d<1)return true;return angDiff(bearing(o,s),heading)<=half}
  // Closed ring of [lon,lat] pairs: apex, arc from heading-half to heading+half, apex.
  function wedge(o,heading,half=HALF_DEG,nm=RANGE_NM,steps=16){const ring=[[o.lon,o.lat]];
    for(let i=0;i<=steps;i++){const p=dest(o,heading-half+2*half*i/steps,nm*NM);ring.push([p.lon,p.lat])}ring.push([o.lon,o.lat]);return ring}
  function throttle(fn,ms){let last=0,t=null,args;return function(...a){args=a;const now=Date.now(),wait=ms-(now-last);
    if(wait<=0){last=now;fn(...args)}else if(!t)t=setTimeout(()=>{t=null;last=Date.now();fn(...args)},wait)}}
  const api={HALF_DEG,RANGE_NM,STALE_MS:5000,THROTTLE_MS:250,inCone,wedge,bearing,dist,angDiff,throttle};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.Cone=api;
})(typeof self!=='undefined'?self:this);
