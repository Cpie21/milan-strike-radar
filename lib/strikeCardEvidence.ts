import { operatorAdapters } from './operatorAdapters';
import { scheduledEndpoint, scheduleClockLabel } from './serviceSchedule';
import { evidenceTimeLabel } from './strikeEvidence';
import type { EvidenceWindow, TimingEvidence } from './strikeEvidence';
import type { LineScope } from './lineScope';

const operatorNames:Record<string,string>={...Object.fromEntries(operatorAdapters.map(a=>[a.id,a.name])),TRENITALIA:'Trenitalia',TRENORD:'Trenord',ATAF_FOGGIA:'ATAF Foggia',ARRIVA_UDINE:'Arriva Udine',ATM_MILANO:'ATM Milano',ATAC_ROMA:'ATAC Roma',GTT_TORINO:'GTT Torino',ARRIVA_BERGAMO:'Arriva Bergamo',TRENITALIA_REGIONALE:'Trenitalia Regionale',GEST_FIRENZE:'GEST Firenze',AIR_CAMPANIA:'AIR Campania',AMTAB_BARI:'AMTAB Bari',AMT_GENOVA:'AMT Genova',CTM_CAGLIARI:'CTM Cagliari',AMTS_CATANIA:'AMTS Catania'};
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

/** Display-only: never replace persisted strike windows or use this to promise a restart. */
export function cardTimingLabels(windows:EvidenceWindow[],schedule:import('./serviceSchedule').ServiceSchedule|undefined,date:string,category:string,language:'zh'|'en'='zh',now=new Date()) {
  return windows.map(w=>{
    const start=w.start===null?scheduledEndpoint(schedule,date,category,'start',now):null;
    const end=w.end_kind==='end_of_service'?scheduledEndpoint(schedule,date,category,'end',now):null;
    if(!start&&!end)return evidenceTimeLabel(w,language);
    // A schedule ending before the announcement's start is not a usable display endpoint.
    if(end&&w.start&&end.clock.seconds<Number(w.start.slice(0,2))*3600+Number(w.start.slice(3))*60)return evidenceTimeLabel(w,language);
    if(start&&w.end&&start.clock.seconds>Number(w.end.slice(0,2))*3600+Number(w.end.slice(3))*60)return evidenceTimeLabel(w,language);
    const left=w.start|| (start?scheduleClockLabel(start.clock,language):(language==='zh'?'运营开始':'Start of service'));
    const right=w.end || (end?scheduleClockLabel(end.clock,language):(language==='zh'?'运营结束':'End of service'));
    return `${left}–${right}${language==='zh'?'（计划时刻参考）':' (scheduled reference)'}`;
  });
}
