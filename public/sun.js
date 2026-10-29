// Tiny sunrise/sunset calc (NOAA simplified, ~1-2 min accuracy). No deps. Browser global + CommonJS.
(function(root){
  const r=Math.PI/180;
  // Returns {rise,set} as ms epoch for the UTC day of `date`, or {polar:'day'|'night'}.
  function sunTimes(date,lat,lon){
    const d0=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
    const n=Math.floor((d0-Date.UTC(date.getUTCFullYear(),0,1))/864e5)+1;
    const g=2*Math.PI/365*(n-1+0.5); // fractional year at noon
    const eqt=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
    const dec=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
    const cosH=(Math.cos(90.833*r)-Math.sin(lat*r)*Math.sin(dec))/(Math.cos(lat*r)*Math.cos(dec));
    if(cosH>1)return{polar:'night'};if(cosH<-1)return{polar:'day'};
    const ha=Math.acos(cosH)/r, noon=720-4*lon-eqt; // minutes UTC
    return{rise:d0+(noon-4*ha)*6e4,set:d0+(noon+4*ha)*6e4};
  }
  // Day if `date` falls in the daylight window of the surrounding solar day (checks yesterday/today/tomorrow UTC).
  function isDay(date,lat,lon){
    const t=date.getTime();
    for(const off of[-1,0,1]){const s=sunTimes(new Date(t+off*864e5),lat,lon);
      if(s.polar){if(off===0)return s.polar==='day';continue}
      if(t>=s.rise&&t<s.set)return true}
    return false;
  }
  const api={sunTimes,isDay};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Sun=api;
})(this);
