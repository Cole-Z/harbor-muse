// Course stub: predicted 30-min track along COG at current SOG. No deps. Browser global + CommonJS.
(function(root){
  const r=Math.PI/180, R_NM=3440.065;
  // Rhumb-line destination from lat/lon (deg), bearing (deg true), distance (nm).
  function rhumbDest(lat,lon,brg,nm){
    const d=nm/R_NM,p1=lat*r,t=brg*r,dp=d*Math.cos(t);let p2=p1+dp;
    if(Math.abs(p2)>Math.PI/2)p2=p2>0?Math.PI-p2:-Math.PI-p2;
    const dq=Math.log(Math.tan(p2/2+Math.PI/4)/Math.tan(p1/2+Math.PI/4)),q=Math.abs(dq)>1e-12?dp/dq:Math.cos(p1);
    const l2=lon*r+d*Math.sin(t)/q;return{lat:p2/r,lon:((l2/r+540)%360)-180};
  }
  const MIN_SOG=0.5, MINUTES=30;
  // Returns [{lat,lon},{lat,lon}] or [] when moored/missing data.
  function stub(s,minutes=MINUTES){
    if(!s||!isFinite(s.lat)||!isFinite(s.lon)||!isFinite(s.sog)||!isFinite(s.cog))return[];
    if(s.sog<MIN_SOG||s.sog>=102.3||s.cog<0||s.cog>=360)return[];
    return[{lat:s.lat,lon:s.lon},rhumbDest(s.lat,s.lon,s.cog,s.sog*minutes/60)];
  }
  const api={rhumbDest,stub,MIN_SOG,MINUTES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Course=api;
})(this);
