// AIS ship type code -> generic type icon (one of six). Shared by browser and tests.
(function(root){
  const NAMES=['cargo','tanker','tug','passenger','fishing','unknown'];
  function shipKind(t){
    t=Number(t);if(!Number.isInteger(t)||t<=0)return 'unknown';
    if(t>=70&&t<=79)return 'cargo';if(t>=80&&t<=89)return 'tanker';
    if(t===31||t===32||t===52)return 'tug';if(t>=60&&t<=69)return 'passenger';
    if(t===30)return 'fishing';return 'unknown'; // pleasure/sailing/military/other
  }
  const iconUrl=(t)=>'/assets/ship-types/'+shipKind(t)+'.svg';
  const markerUrl=(t)=>'/assets/markers/'+shipKind(t)+'.svg';
  const api={NAMES,shipKind,iconUrl,markerUrl};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ShipType=api;
})(this);
