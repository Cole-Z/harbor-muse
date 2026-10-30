// AIS ship type code -> generic type icon (one of six). Shared by browser and tests.
(function(root){
  const NAMES=['cargo','tanker','tug','passenger','fishing','unknown'];
  function shipKind(t){
    t=Number(t);if(!Number.isInteger(t)||t<=0)return 'unknown';
    if(t>=70&&t<=79)return 'cargo';if(t>=80&&t<=89)return 'tanker';
    if(t===31||t===32||t===52)return 'tug';if(t>=60&&t<=69)return 'passenger';
    if(t===30)return 'fishing';return 'unknown'; // pleasure/sailing/military/other
  }
  // ITU-R M.1371 ship & cargo type -> readable label (null when not reported).
  const EXACT={20:'Wing in ground',30:'Fishing',31:'Towing',32:'Towing (large tow)',33:'Dredging / underwater ops',34:'Diving ops',35:'Military ops',36:'Sailing',37:'Pleasure craft',
    40:'High-speed craft',50:'Pilot vessel',51:'Search & rescue',52:'Tug',53:'Port tender',54:'Anti-pollution',55:'Law enforcement',58:'Medical transport',59:'Noncombatant (RR18)',
    60:'Passenger',70:'Cargo',80:'Tanker',90:'Other'};
  const GROUP={2:'Wing in ground',4:'High-speed craft',6:'Passenger',7:'Cargo',8:'Tanker',9:'Other'};
  const HAZ={1:'hazardous cat. A',2:'hazardous cat. B',3:'hazardous cat. C',4:'hazardous cat. D'};
  function typeLabel(t){
    t=Number(t);if(!Number.isInteger(t)||t<=0||t>99)return null;
    if(EXACT[t])return EXACT[t];const g=GROUP[Math.floor(t/10)];
    if(g)return HAZ[t%10]?g+' ('+HAZ[t%10]+')':g;
    return 'Type '+t;
  }
  const iconUrl=(t)=>'/assets/ship-types/'+shipKind(t)+'.svg';
  const markerUrl=(t)=>'/assets/markers/'+shipKind(t)+'.svg';
  const api={NAMES,shipKind,iconUrl,markerUrl,typeLabel};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ShipType=api;
})(this);
