import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CITIES } from './cities';
import { aviationScope, railScope, type ScopeType } from './strikeScope';
import { decide, choice, noul, type DecisionResult, type Question } from './jev';
import type { StrikeRecord, RawStrikeRow } from './strikeSync';

export const REVIEW_VERSION = 'semantic-v4';
const PRICE_CEILING = 0.00000005; // USD/input token; fail closed above this.
export const MAX_INPUT_BYTES = 12000;
const MAX_CALLS = 30;
export type SemanticReview = {
  version: string; input_hash: string; checked_at: string;
  locationRole: string; locationChoice: string; transportSubtype: ScopeType;
  confidence: { locationRole:number; locationChoice:number; transportSubtype:number };
  parserOverExpanded: number; parserOmittedImpact: number; sourceConflict: number;
  duplicateRisk: number; disposition: 'AGREES' | 'CORRECTED' | 'FLAGGED' | 'INCONCLUSIVE';
};
const q = (instructions:string, criteria:Record<string,string>):Question => ({type:'choice',instructions,criteria});
const probability=(n:number | null)=>typeof n==='number' && Number.isFinite(n) && n>=0 && n<=1?n:0;
const fields=(r:StrikeRecord)=>r.timing_evidence?.fields;
function officialRaw(raw:RawStrikeRow) {
  return {date:raw.date,endDate:raw.endDate,provider:raw.provider,region:raw.rawRegion || raw.region,province:raw.province,relevance:raw.rilevanza,sector:raw.sector,description:raw.note,timing:raw.modalita,unions:raw.unions,status:raw.sourceStatus || ''};
}
export function reviewInput(raw:RawStrikeRow, records:StrikeRecord[]) {
  const admin=CITIES.filter(c=>c.region===(raw.rawRegion || '').toLowerCase()).map(c=>c.tag).sort();
  const current=[...new Set(records.map(r=>r.region))].sort();
  const regionalCandidate=/^regionale$/i.test(raw.rilevanza) && /^tutte$/i.test(raw.province) && admin.length>0 && JSON.stringify(current)!==JSON.stringify(admin);
  const categories=[...new Set(records.map(r=>r.category))];
  const scopes=categories.includes('AIRPORT')?['AIRPORT','AIRLINE','AIRLINE_CREW','GROUND_HANDLING','MIXED_AIRPORT_SERVICES','CARGO','NATIONAL_AVIATION','UNKNOWN']:categories.includes('TRAIN')?['RAIL_OPERATOR','RAIL_CREW','RAIL_INFRASTRUCTURE','RAIL_SECURITY','RAIL_SUPPORT','UNKNOWN']:['UNKNOWN'];
  const state={official:officialRaw(raw),cityRegistry:CITIES.filter(c=>current.includes(c.tag)||admin.includes(c.tag)).map(c=>({id:c.tag,city:c.slug,administrativeRegion:c.region})),declaredRegionalCities:/^regionale$/i.test(raw.rilevanza)&&/^tutte$/i.test(raw.province)?admin:[],parser:{regions:current,events:records.map(r=>({date:r.date,region:r.region,category:r.category,passengerImpact:fields(r)?.passengerImpact?.value || 'UNKNOWN',guaranteeSource:fields(r)?.guaranteeSource || 'UNKNOWN',airports:fields(r)?.affectedAirports.value || [],scope:fields(r)?.scopeType.value || 'UNKNOWN',windows:r.timing_evidence?.windows || r.strike_windows,lines:r.affected_lines})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))},officialSupplements:[...new Map(records.flatMap(r=>r.timing_evidence?.sources || []).filter(s=>s.authority==='official').map(s=>[s.url,{url:s.url,excerpt:s.excerpt.slice(0,800),hash:s.content_hash}])).values()].sort((a,b)=>a.url.localeCompare(b.url)),candidates:{CURRENT:current,...(regionalCandidate?{ADMIN_REGION:admin}:{}),UNKNOWN:['UNKNOWN']}};
  const questions:Record<string,Question>={
    locationRole:q('Does a city in official.provider describe affected geography or an office/organisation name? Use supplied official fields only. An office name does not narrow Regionale/region/Tutte.',{AFFECTED_AREA:'Explicit affected location, not an office',ORGANIZATION:'Organisation, office or headquarters name',BOTH:'Both roles are explicitly documented',UNKNOWN:'Insufficient evidence or no city name'}),
    location:q('Compare parser.regions to the supplied cityRegistry and official region/province/relevance. Regionale plus a named region and Tutte explicitly covers declaredRegionalCities, even if provider has an office city. Choose the affected-location candidate most supported by the official fields. Specific airports trump coarse Italia/Tutte. Organisation city names do not narrow administrative regional scope. Do not infer service cancellations.',{CURRENT:`Keep ${current.join(',') || 'no passenger transport event'}; this set may already cover the official regional or national scope. Prefer this if explicit operator notice locations support it.`,...(regionalCandidate?{ADMIN_REGION:`Change to the official regional set ${admin.join(',')}, only if the provider city is an office and not a specific affected service location.`}:{}),UNKNOWN:'No supplied official geography supports the existing parser set. Do not use merely because subtype or rail passenger disruption is unconfirmed.'}),
    subtype:q('Choose the transport subject from official entities, not the broad sector. Mixed airport operator and handling entities are mixed services. FS Security is rail security; RFI infrastructure is infrastructure, not train crew. Unknown is preferable to guessing.',Object.fromEntries(scopes.map(s=>[s,s]))),
    overexpanded:{type:'noul',instructions:'Does parser claim broader affected cities, airports, operators, lines or passenger service impact than the official information supports?'},
    omitted:{type:'noul',instructions:'Did parser omit clearly stated affected places or transport modes in official fields? Excluded modes are not omissions.'},
    conflict:{type:'noul',instructions:'Do supplied official sources contradict each other on scope or subject? Different granularities or differently formatted dates do not alone imply conflict.'},
    duplicate:{type:'noul',instructions:'Do parser events duplicate the same city/date/category/scope? Distinct cities, modes or split cross-midnight dates are legitimate, not duplicates.'},
  };
  const payload={model:'typesafe/jev-1.13',state,questions};
  const bytes=Buffer.byteLength(JSON.stringify(payload),'utf8');
  const hash=createHash('sha256').update(JSON.stringify({version:REVIEW_VERSION,payload})).digest('hex');
  // UTF-8 bytes upper-bound byte tokenizer tokens; extra framing allowance.
  const reserve=Math.ceil((bytes+4096)*PRICE_CEILING*1e6);
  return {state,questions,hash,bytes,reserve,admin,current,scopes};
}
export function decodeReview(result:DecisionResult,input:ReturnType<typeof reviewInput>,now:Date):SemanticReview {
  const role=choice(result,'locationRole'),location=choice(result,'location'),subtype=choice(result,'subtype');
  if(!role || !['AFFECTED_AREA','ORGANIZATION','BOTH','UNKNOWN'].includes(role.value) || !location || !Object.keys(input.questions.location.type==='choice'?input.questions.location.criteria:{}).includes(location.value) || !subtype || !input.scopes.includes(subtype.value)) throw new Error('Invalid Jev decision enum');
  for(const key of ['overexpanded','omitted','conflict','duplicate']) if(typeof noul(result,key)!=='number' || !Number.isFinite(noul(result,key)) || noul(result,key)!<0 || noul(result,key)!>1) throw new Error('Missing semantic verdict');
  const conf={locationRole:probability(role.p),locationChoice:probability(location.p),transportSubtype:probability(subtype.p)};
  if(Object.values(conf).some(p=>!p)) throw new Error('Invalid decision probability');
  return {version:REVIEW_VERSION,input_hash:input.hash,checked_at:now.toISOString(),locationRole:role.value,locationChoice:location.value,transportSubtype:subtype.value as ScopeType,confidence:conf,parserOverExpanded:probability(noul(result,'overexpanded')),parserOmittedImpact:probability(noul(result,'omitted')),sourceConflict:probability(noul(result,'conflict')),duplicateRisk:probability(noul(result,'duplicate')),disposition:'AGREES'};
}
export function reconcileSemanticReview(records:StrikeRecord[],raw:RawStrikeRow,review:SemanticReview):StrikeRecord[] {
  let corrected=false;
  // Time, IDs, lines, airports, operators, guarantees and statuses are never
  // generated by Jev. Scope corrections must also match official code evidence.
  let output=records.map(r=>{
    let f=fields(r);
    if(f && f.scopeType.source!=='OPERATOR_OFFICIAL' && review.confidence.transportSubtype>=0.97 && review.transportSubtype!==f.scopeType.value) {
      const supported=r.category==='AIRPORT'?aviationScope(raw.provider,r.region):r.category==='TRAIN'?railScope(raw.provider):'UNKNOWN';
      if(supported!=='UNKNOWN' && supported===review.transportSubtype) { f={...f,scopeType:{...f.scopeType,value:supported,method:'JEV'}}; corrected=true; }
    }
    return {...r,timing_evidence:r.timing_evidence?{...r.timing_evidence,fields:f}:r.timing_evidence};
  });
  const admin=CITIES.filter(c=>c.region===(raw.rawRegion || '').toLowerCase()).map(c=>c.tag);
  // A model may select an existing official regional candidate only for rail
  // office names. It cannot create a place, widen airports or replace explicit
  // operator-notice geography. Other disagreements remain review flags.
  const regionSupported=review.locationChoice==='ADMIN_REGION' && review.locationRole==='ORGANIZATION' && review.confidence.locationChoice>=0.97 && review.confidence.locationRole>=0.97 && /^regionale$/i.test(raw.rilevanza) && /^tutte$/i.test(raw.province) && admin.length && output.length && output.every(r=>r.category==='TRAIN' && fields(r)?.location.source!=='OPERATOR_OFFICIAL');
  const current=[...new Set(output.map(r=>r.region))].sort();
  const differentRegion=review.locationChoice==='UNKNOWN' || review.locationChoice==='ADMIN_REGION' && JSON.stringify(current)!==JSON.stringify([...admin].sort());
  if(regionSupported && differentRegion) {
    const byModeDate=[...new Map(output.map(r=>[r.date+'|'+r.category,r])).values()];
    output=byModeDate.flatMap(r=>admin.map(region=>({...r,region,timing_evidence:r.timing_evidence?{...r.timing_evidence,fields:fields(r)?{...fields(r)!,location:{value:region,confidence:'MEDIUM',source:'MIT',method:'JEV',url:r.source_url,excerpt:[raw.rawRegion,raw.province,raw.rilevanza,raw.provider].join(' | ')}}:undefined}:r.timing_evidence})));
    corrected=true;
  }
  const differentSubtype=output.some(r=>fields(r)?.scopeType.value!==review.transportSubtype);
  const flagged=differentRegion && !regionSupported && review.confidence.locationChoice>=0.95 || differentSubtype && review.confidence.transportSubtype>=0.95 || review.parserOverExpanded>=0.95 || review.parserOmittedImpact>=0.95 || review.sourceConflict>=0.95 || review.duplicateRisk>=0.95;
  const inconclusive=differentRegion && !regionSupported || differentSubtype || review.confidence.locationChoice<0.8 || review.confidence.transportSubtype<0.8;
  const final={...review,disposition:flagged?'FLAGGED':corrected?'CORRECTED':inconclusive?'INCONCLUSIVE':'AGREES'} as SemanticReview;
  return output.map(r=>({...r,timing_evidence:r.timing_evidence?{...r.timing_evidence,semantic_review:final}:r.timing_evidence}));
}
export async function checkJevPrice(fetcher:typeof fetch=fetch) {
  const response=await fetcher('https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints',{signal:AbortSignal.timeout(5000),cache:'no-store'});
  if(!response.ok) throw new Error('Jev price could not be verified');
  const json=await response.json();
  const endpoints=json.data?.endpoints;
  if(!Array.isArray(endpoints)||!endpoints.length||endpoints.some(e=>e.pricing?.prompt==null || e.pricing?.completion==null || !Number.isFinite(Number(e.pricing?.prompt)) || Number(e.pricing.prompt)<0 || Number(e.pricing.prompt)>PRICE_CEILING || Number(e.pricing?.completion)!==0 || Number(e.pricing?.request || 0)>0)) throw new Error('Jev price exceeds allowed rate');
}
export async function reviewStrikeSemantics(records:StrikeRecord[],rawRows:RawStrikeRow[],db:SupabaseClient,warnings:string[],now=new Date(),dependencies:{price?:()=>Promise<void>;decide?:typeof decide;enabled?:boolean}={}) {
  const stats={called:0,cached:0,flagged:0,inconclusive:0,failed:0,skipped:0,budgetExhausted:false};
  if(!(dependencies.enabled ?? process.env.STRIKE_SEMANTIC_QA==='1') || !(process.env.STRIKE_REVIEW_API_KEY || process.env.OPENROUTER_API_KEY) && !dependencies.decide) return {records,stats,enabled:false};
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const horizon=new Date(now.getTime()+90*86400000).toISOString().slice(0,10);
  const rawByKey=new Map(rawRows.map(r=>[r.sourceKey,r]));
  const groups=new Map<string,StrikeRecord[]>();
  const eligibleKeys=new Set(records.filter(r=>r.date>=today && r.date<=horizon && r.source_key && r.raw_payload).map(r=>r.source_key!));
  records.filter(r=>r.source_key && eligibleKeys.has(r.source_key)).forEach(r=>groups.set(r.source_key!,[...(groups.get(r.source_key!) || []),r]));
  // Raw announcements producing zero records remain reviewable for omissions.
  for(const raw of rawByKey.values()) {
    const m=raw.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const date=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:raw.date;
    if(raw.sourceKey && date>=today && date<=horizon && !groups.has(raw.sourceKey)) groups.set(raw.sourceKey,[]);
  }
  const replacements=new Map<string,StrikeRecord[]>();
  let priceChecked=false;
  const deadline=Date.now()+55000;
  for(const [key,group] of [...groups].sort((a,b)=>(a[1][0]?.date || '').localeCompare(b[1][0]?.date || ''))) {
    const raw=rawByKey.get(key) || group[0]?.raw_payload;if(!raw)continue;
    const input=reviewInput(raw,group);
    if(input.bytes>MAX_INPUT_BYTES || Date.now()>deadline || stats.called>=MAX_CALLS || stats.budgetExhausted) {stats.skipped++;continue;}
    let lease:string|undefined;
    try {
      // Price verification happens before reserving money or making a paid call.
      if(!priceChecked) {await (dependencies.price || checkJevPrice)();priceChecked=true;}
      const {data,error}=await db.rpc('reserve_strike_semantic_review',{review_hash:input.hash,reserve_micro_usd:input.reserve});
      if(error)throw new Error('Semantic cache/budget reservation failed');
      const reservation=data?.[0];if(!reservation)throw new Error('Missing semantic reservation');
      if(reservation.decision==='budget') {stats.budgetExhausted=true;stats.skipped++;continue;}
      let review:SemanticReview;
      let actualCost:number | null=null;
      if(reservation.decision==='cached') {review=reservation.cached_result; if(review?.version!==REVIEW_VERSION || review.input_hash!==input.hash)throw new Error('Invalid cached review');stats.cached++;}
      else if(reservation.decision==='call' && reservation.lease) {
        lease=reservation.lease;stats.called++;
        const result=await (dependencies.decide || decide)(input.state,input.questions,Math.min(7000,Math.max(1,deadline-Date.now())));
        review=decodeReview(result,input,now);
        actualCost=Number.isFinite(result.cost)&&result.cost>=0?Math.ceil(result.cost*1e6):null;
      } else {stats.skipped++;continue;}
      const reviewed=reconcileSemanticReview(group,raw,review);
      review=reviewed[0]?.timing_evidence?.semantic_review || {...review,disposition:review.parserOmittedImpact>=0.95?'FLAGGED':review.parserOmittedImpact>=0.8?'INCONCLUSIVE':'AGREES'};
      if(lease) {
        const {data:finished,error:finishError}=await db.rpc('finish_strike_semantic_review',{review_hash:input.hash,review_lease:lease,review_result:review,actual_micro_usd:actualCost});
        if(finishError || !finished)throw new Error('Semantic billing reconciliation failed');
        lease=undefined;
        if(actualCost!==null && actualCost>input.reserve) {stats.budgetExhausted=true;throw new Error('Unexpected Jev cost; budget disabled');}
      }
      replacements.set(key,reviewed);
      if(review.disposition==='INCONCLUSIVE')stats.inconclusive++;
      if(review.disposition==='FLAGGED') {
        stats.flagged++;warnings.push(`Semantic QA needs review: ${key.slice(0,12)} (${raw.provider.slice(0,90)})`);
      }
    } catch {
      stats.failed++;
      if(lease) await db.rpc('finish_strike_semantic_review',{review_hash:input.hash,review_lease:lease,review_result:null,actual_micro_usd:null});
      warnings.push(`Semantic QA unavailable: ${key.slice(0,12)}; deterministic official data retained`);
      if(!priceChecked)break;
    }
  }
  const emitted=new Set<string>();
  const reviewedRecords=records.flatMap(r=>{if(!r.source_key || !replacements.has(r.source_key))return [r];if(emitted.has(r.source_key))return [];emitted.add(r.source_key);return replacements.get(r.source_key)!;});
  return {records:reviewedRecords,stats,enabled:true};
}
