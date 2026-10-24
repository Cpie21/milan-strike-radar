import { transit_realtime as gtfs } from 'gtfs-realtime-bindings';
import { transitBytes } from './officialTransitData';

export const ROME_ALERTS_URL='https://romamobilita.it/sites/default/files/rome_rtgtfs_service_alerts_feed.pb';
const own=(v:object,k:string)=>Object.prototype.hasOwnProperty.call(v,k);
const seconds=(v:unknown)=>v===undefined||v===null?undefined:Number(String(v));
function translated(v:gtfs.ITranslatedString|null|undefined) {
  const entries=v?.translation||[];
  return (entries.find(t=>t.language==='it')||entries.find(t=>!t.language)||entries[0])?.text?.slice(0,2000)||'';
}
export function decodeServiceAlerts(bytes:Uint8Array,now=new Date()) {
  if(bytes.byteLength>2_000_000)throw new Error('GTFS-RT feed too large');
  const feed=gtfs.FeedMessage.decode(bytes);
  if(feed.header.incrementality===gtfs.FeedHeader.Incrementality.DIFFERENTIAL)throw new Error('Incremental GTFS-RT feed requires persisted state');
  const stamp=own(feed.header,'timestamp')?seconds(feed.header.timestamp):undefined;
  const instant=Math.floor(now.getTime()/1000);
  const fresh=stamp!==undefined && Number.isSafeInteger(stamp) && stamp<=instant+120 && instant-stamp<=600;
  if(!feed.header.gtfsRealtimeVersion || feed.entity.length>10000)throw new Error('Invalid GTFS-RT header');
  const alerts=feed.entity.filter(e=>e.alert&&!e.isDeleted).map(e=>{
    const a=e.alert!;
    const periods=(a.activePeriod||[]).map(p=>({start:own(p,'start')?seconds(p.start):undefined,end:own(p,'end')?seconds(p.end):undefined}));
    const validPeriods=periods.every(p=>(p.start!==undefined||p.end!==undefined)&&[p.start,p.end].every(t=>t===undefined||Number.isSafeInteger(t))&&(p.start===undefined||p.end===undefined||p.start<p.end));
    const isActive=validPeriods && (!periods.length||periods.some(p=>(p.start===undefined||instant>=p.start)&&(p.end===undefined||instant<p.end)));
    const selectors=(a.informedEntity||[]).map(s=>({
      agencyId:s.agencyId||null,routeId:s.routeId||null,routeType:own(s,'routeType')?s.routeType:null,stopId:s.stopId||null,
      tripId:s.trip?.tripId||null,directionId:own(s,'directionId')?s.directionId:null,
      scope:s.stopId?'STOP':s.trip?'TRIP':s.routeId?'ROUTE':s.agencyId?'AGENCY':'UNSPECIFIED',
    }));
    const isStrike=own(a,'cause')&&a.cause===gtfs.Alert.Cause.STRIKE;
    const confirmedStrikeDisruption=fresh&&isActive&&isStrike&&selectors.length>0&&own(a,'effect')&&[gtfs.Alert.Effect.NO_SERVICE,gtfs.Alert.Effect.REDUCED_SERVICE,gtfs.Alert.Effect.SIGNIFICANT_DELAYS].includes(a.effect!);
    return {id:e.id,header:translated(a.headerText),description:translated(a.descriptionText),cause:gtfs.Alert.Cause[a.cause??gtfs.Alert.Cause.UNKNOWN_CAUSE],effect:gtfs.Alert.Effect[a.effect??gtfs.Alert.Effect.UNKNOWN_EFFECT],periods,selectors,isActive,isStrike,confirmedStrikeDisruption};
  });
  return {region:'ROMA',source:ROME_ALERTS_URL,checkedAt:now.toISOString(),feedTimestamp:stamp?new Date(stamp*1000).toISOString():null,status:fresh?'FRESH':'STALE',alerts,absenceMeansNormalService:false,qualification:'Official live advisories, separate from planned strike notices. An alert is limited to its selectors; no alert is not proof of normal operation.'};
}

export async function fetchServiceAlerts() {
  const {bytes}=await transitBytes(ROME_ALERTS_URL,2_000_000,Date.now()+10000);
  return decodeServiceAlerts(bytes);
}

export function currentServiceAlerts(result:ReturnType<typeof decodeServiceAlerts>,now=new Date()) {
  const stamp=result.feedTimestamp?Date.parse(result.feedTimestamp):NaN,instant=now.getTime();
  const fresh=Number.isFinite(stamp)&&stamp<=instant+120000&&instant-stamp<=600000;
  return {...result,status:fresh?'FRESH':'STALE',alerts:result.alerts.map(a=>{
    const isActive=a.isActive&&(!a.periods.length||a.periods.some(p=>(p.start===undefined||instant/1000>=p.start)&&(p.end===undefined||instant/1000<p.end)));
    return {...a,isActive,confirmedStrikeDisruption:fresh&&isActive&&a.confirmedStrikeDisruption};
  })};
}
