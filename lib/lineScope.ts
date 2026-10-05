import type { FieldEvidence } from './strikeScope';
import type { StrikeRecord } from './strikeSync';
import type { TimingSource } from './strikeEvidence';
import { identifyOperators, type OperatorId } from './operatorGuaranteeProfiles';

export type LineScopeKind = 'ALL_OPERATOR_LINES'|'SPECIFIC_LINES'|'ALL_EXCEPT'|'UNKNOWN';
export type LineScope = {
  kind:LineScopeKind;
  operatorIds:OperatorId[];
  networkNames:string[];
  affectedLineNames:string[];
  excludedLineNames:string[];
  affectedRouteIds:string[];
  excludedRouteIds:string[];
  gtfsFeedId?:string;
  routeValidation:'NOT_REQUESTED'|'VERIFIED'|'PARTIAL'|'UNAVAILABLE'|'OUT_OF_VALIDITY'|'AMBIGUOUS';
};
export const unknownLineScope=():LineScope=>({kind:'UNKNOWN',operatorIds:[],networkNames:[],affectedLineNames:[],excludedLineNames:[],affectedRouteIds:[],excludedRouteIds:[],routeValidation:'NOT_REQUESTED'});

function lineNames(text:string) {
  const names=[...text.matchAll(/\b(?:M[1-5]|T\d{1,2})\b/gi)].map(m=>m[0].toUpperCase());
  for(const m of text.matchAll(/\bline[ae]\s+((?:(?:\d{1,4}[A-Z]?|[ABC])(?:\b|(?=,))\s*(?:,|\/|\be\b|\band\b)?\s*)+)/gi)) {
    names.push(...(m[1].match(/\d{1,4}[A-Z]?|\b[ABC]\b/gi)||[]).map(s=>s.toUpperCase()));
  }
  return [...new Set(names)];
}

export function parseLineScope(text:string,operators:OperatorId[],officialOperator=false):LineScope {
  // Staff grievances can mention historic route/workplace examples. They are
  // not statements of the affected service scope of this strike.
  text=text.split(/\b(?:motivazioni|motivi dello sciopero|reasons for (?:the )?strike)\s*:/i)[0];
  const result={...unknownLineScope(),operatorIds:operators};
  if(!text.trim()) return result;
  const exception=/\b(?:esclus[aeio]|eccetto|tranne|except|ad eccezione(?: delle)?|non (?:interessate?|coinvolte?))\b/i.exec(text);
  const broad=/tutt[eaio]\s+(?:le\s+)?linee|intera\s+rete|entire network|all (?:lines|services)/i.test(text) || officialOperator && operators.length===1 && /(?:le\s+)?nostre\s+linee|our\s+lines/i.test(text);
  const networkNames=officialOperator && operators.includes('ARRIVA_BERGAMO') ? [...text.matchAll(/BERGAMO TRASPORTI\s+(SUD|EST|OVEST)/gi)].map(m=>'BERGAMO TRASPORTI '+m[1].toUpperCase()):[];
  const wholeNamedNetworks=networkNames.length>0 && /servizi di linea gestiti da/i.test(text);
  if(exception) {
    const excluded=lineNames(text.slice(exception.index));
    if(broad && operators.length===1 && excluded.length) return {...result,kind:'ALL_EXCEPT',excludedLineNames:excluded};
    return result;
  }
  if((broad || wholeNamedNetworks) && operators.length===1) return {...result,kind:'ALL_OPERATOR_LINES',networkNames:[...new Set(networkNames)]};
  const names=lineNames(text);
  return names.length ? {...result,kind:'SPECIFIC_LINES',affectedLineNames:names}:result;
}

export function officialLineScope(record:StrikeRecord,text:string,source:TimingSource):FieldEvidence<LineScope> {
  let operators=identifyOperators(record);
  // A national general-strike projection can gain a concrete operator only
  // from its already matched, dated, city-specific official notice.
  if(!operators.length && source.authority==='official' && /sciopero generale|settori pubblichi|categorie pubbliche|plurisettorial/i.test(record.raw_payload?.provider||'')) {
    const hostname=new URL(source.url).hostname;
    const known:[string,string,OperatorId][]=[['www.atm.it','MILANO','ATM_MILANO'],['www.atac.roma.it','ROMA','ATAC_ROMA'],['www.gtt.to.it','TORINO','GTT_TORINO'],['bergamo.arriva.it','BERGAMO','ARRIVA_BERGAMO']];
    operators=known.filter(([host,city])=>host===hostname&&city===record.region).map(([, ,operator])=>operator);
  }
  const value=parseLineScope(text,operators,true);
  return {value,confidence:value.kind==='UNKNOWN'?'UNKNOWN':'HIGH',source:value.kind==='UNKNOWN'?'UNKNOWN':'OPERATOR_OFFICIAL',method:'CODE',url:source.url,excerpt:text.slice(0,800)};
}

export function mergeLineScopes(facts:FieldEvidence<LineScope>[]):LineScope {
  if(!facts.length || facts.some(f=>f.value.kind==='UNKNOWN' || f.confidence==='CONFLICT')) return unknownLineScope();
  const values=facts.map(f=>f.value);
  if(values.length===1)return values[0];
  const operators=[...new Set(values.flatMap(v=>v.operatorIds))];
  const scopeKey=(v:LineScope)=>JSON.stringify([v.operatorIds.slice().sort(),v.networkNames.slice().sort()]);
  if(new Set(values.map(scopeKey)).size!==1) return {...unknownLineScope(),operatorIds:operators};
  const broad=values.find(v=>v.kind==='ALL_OPERATOR_LINES');
  if(broad) return broad;
  const except=values.filter(v=>v.kind==='ALL_EXCEPT');
  const named=values.filter(v=>v.kind==='SPECIFIC_LINES').flatMap(v=>v.affectedLineNames);
  if(except.length) {
    const excluded=except[0].excludedLineNames.filter(line=>except.every(v=>v.excludedLineNames.includes(line)) && !named.includes(line));
    const verified=values.every(v=>v.routeValidation==='VERIFIED'&&v.gtfsFeedId===except[0].gtfsFeedId);
    const excludedRouteIds=verified?excluded.map(line=>except[0].excludedRouteIds[except[0].excludedLineNames.indexOf(line)]).filter(Boolean):[];
    return {...except[0],kind:excluded.length?'ALL_EXCEPT':'ALL_OPERATOR_LINES',excludedLineNames:excluded,excludedRouteIds,routeValidation:verified?'VERIFIED':'NOT_REQUESTED'};
  }
  return {...values[0],affectedLineNames:[...new Set(named)],affectedRouteIds:[...new Set(values.flatMap(v=>v.affectedRouteIds))],routeValidation:values.every(v=>v.routeValidation==='VERIFIED')?'VERIFIED':'PARTIAL'};
}
