import type { EvidenceWindow, TimingEvidence } from './strikeEvidence';
import type { LineScope } from './lineScope';

const operatorNames:Record<string,string>={ATM_MILANO:'ATM Milano',ATAC_ROMA:'ATAC Roma',GTT_TORINO:'GTT Torino',ARRIVA_BERGAMO:'Arriva Bergamo',TRENITALIA_REGIONALE:'Trenitalia Regionale',GEST_FIRENZE:'GEST Firenze',AIR_CAMPANIA:'AIR Campania'};
export function lineScopeLabels(scope:LineScope|undefined,language:'zh'|'en'='zh'):string[] {
  if(!scope || scope.kind==='UNKNOWN')return [];
  if(scope.kind==='SPECIFIC_LINES')return scope.affectedLineNames;
  const networks=scope.networkNames.length?scope.networkNames:scope.operatorIds.map(id=>operatorNames[id] || id);
  if(!networks.length)return [];
  if(scope.kind==='ALL_EXCEPT')return scope.excludedLineNames.length?[language==='zh'?`${networks.join(' / ')} 全部线路，以下除外：${scope.excludedLineNames.join('、')}`:`All ${networks.join(' / ')} lines except ${scope.excludedLineNames.join(', ')}`]:[];
  return networks.map(name=>language==='zh'?`${name} 所属线路`:`Lines operated by ${name}`);
}
export function cardGuaranteeWindows(strike:{guaranteeSource?:string;guaranteeEvidenceWindows?:EvidenceWindow[];guarantee_windows?:{start:string;end:string}[];timing_evidence?:TimingEvidence|null}):EvidenceWindow[] {
  const source=strike.guaranteeSource || strike.timing_evidence?.fields?.guaranteeSource || 'UNKNOWN';
  if(source==='UNKNOWN')return [];
  return strike.guaranteeEvidenceWindows ?? strike.timing_evidence?.fields?.guaranteeEvidenceWindows?.value ?? (strike.guarantee_windows || []).map(w=>({...w,end_kind:'clock' as const}));
}
