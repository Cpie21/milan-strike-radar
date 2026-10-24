import { buildLineImpact, declaredLineMatch, type DeclaredLineImpact } from './lineImpact';
import type { StrikeRecord } from './strikeSync';
import type { ScopeEvidence } from './strikeScope';
import type { OfficialStrikeRecord } from './officialStrikeRecord';
import { resolveCity } from './cities';

type TravellerRecord = Pick<StrikeRecord,'date'|'provider'|'region'|'category'|'source_key'> & {status:string} & {id?:string;last_seen_at?:string;timing_evidence?:{fields?:ScopeEvidence};official_record?:OfficialStrikeRecord|null};
export function parseLineImpactQuery(params:URLSearchParams,today:string) {
  const city=resolveCity(params.get('region') || 'MILANO');
  if(!city)throw new Error('Unsupported city');
  const date=params.get('date') || today;
  const day=new Date(date+'T12:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==date)throw new Error('Invalid date');
  const category=params.get('category')?.toUpperCase();
  if(category&&!['BUS','SUBWAY','TRAIN','AIRPORT'].includes(category))throw new Error('Unsupported transport category');
  const line=params.get('line')?.trim().toUpperCase();
  if(line&&(!/^[A-Z0-9][A-Z0-9 ._-]{0,31}$/.test(line)||!category||category==='AIRPORT'))throw new Error('Line requires a surface, metro or train category');
  return {region:city.tag,date,category,line};
}
export function travellerLineImpacts(records:TravellerRecord[],query:ReturnType<typeof parseLineImpactQuery>) {
  const relevant=records.filter(r=>r.date===query.date&&r.status!=='CANCELLED'&&r.status!=='STALE'&&(!query.category||r.category===query.category));
  const events:{id:string|undefined;sourceKey:string|undefined;category:string;impact:DeclaredLineImpact;lineMatch:'NAMED'|'POTENTIAL'|'UNCONFIRMED'|null;announcements:{id:string|undefined;sourceKey:string|undefined;checkedAt:string|null;scope:DeclaredLineImpact['declaredScope']}[]}[]=[];
  const relatedServices:typeof events=[];
  for(const r of relevant) {
    if(r.region!==query.region&&r.region!=='NATIONAL')continue;
    const impact=buildLineImpact(r);
    if(impact.passengerRelevance==='CARGO')continue;
    const lineMatch=query.line?declaredLineMatch(impact,query.line):null;
    if(lineMatch==='EXCLUDED')continue;
    if(query.line&&impact.declaredScope.value.kind==='SPECIFIC_LINES'&&impact.declaredScope.confidence!=='CONFLICT'&&lineMatch!=='NAMED')continue;
    if(query.line && (lineMatch==='NAMED'||lineMatch==='POTENTIAL'))impact.presentation={...impact.presentation,zh:`${query.line} 可能受影响`,en:`${query.line} may be affected`};
    if(query.line){impact.potentialLines=impact.potentialLines.filter(l=>l.displayName.toUpperCase()===query.line);if(impact.lineMembership)impact.lineMembership={...impact.lineMembership,value:{...impact.lineMembership.value,routes:impact.lineMembership.value.routes.filter(l=>l.name.toUpperCase()===query.line)}};}
    const entry={id:r.id,sourceKey:r.source_key,category:r.category,impact,lineMatch,announcements:[{id:r.id,sourceKey:r.source_key,checkedAt:impact.checkedAt,scope:impact.declaredScope}]};
    (impact.passengerRelevance==='SUPPORT_SERVICE'?relatedServices:events).push(entry);
  }
  // Consolidate identical passenger scope while retaining each announcement's
  // evidence. Unknown/conflicting sibling scope cannot inherit named lines.
  const deduplicate=(entries:typeof events)=>{
    const groups=new Map<string,typeof events[number]>();
    for(const entry of entries) {
      const scope=entry.impact.declaredScope;
      const value=Object.fromEntries(Object.entries(scope.value).map(([k,v])=>[k,Array.isArray(v)?[...v].sort():v]));
      const key=JSON.stringify([entry.category,entry.lineMatch,entry.impact.passengerRelevance,scope.confidence,value]);
      const prior=groups.get(key);
      if(!prior){groups.set(key,entry);continue;}
      prior.announcements.push(...entry.announcements);
      // Same declared scope may have different enrichment freshness. Choose
      // the newest catalogue snapshot; do not union a retired route back in.
      const stamp=(i:DeclaredLineImpact)=>Math.max(0,...i.potentialLines.map(l=>Date.parse(l.catalogCheckedAt||'')||0));
      if(stamp(entry.impact)>stamp(prior.impact))prior.impact=entry.impact;
      const stamps=prior.announcements.map(a=>a.checkedAt);
      prior.impact={...prior.impact,checkedAt:stamps.some(t=>!t)?null:stamps.slice().sort()[0]!};
    }
    return [...groups.values()];
  };
  // No result is not proof of normal service. Related workforce strikes remain
  // available separately, rather than becoming passenger-line cancellation cards.
  return {events:deduplicate(events),relatedServices:deduplicate(relatedServices),absenceMeansNormalService:false as const};
}
