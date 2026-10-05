// Read-only checks of the published passenger contract, all 20 city surfaces,
// and targeted scope regressions. Never invokes sync or writes business data.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {CITIES,cityPath}=require('../lib/cities.ts');
const origin=process.env.STRIKE_AUDIT_ORIGIN || 'https://www.theitalystrike.com';
(async()=>{
 const cityChecks=[],cityData={};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 for(let offset=0;offset<CITIES.length;offset+=4) await Promise.all(CITIES.slice(offset,offset+4).map(async city=>{
  const [page,api,calendar]=await Promise.all([fetch(origin+cityPath(city.tag)),fetch(origin+'/api/strikes?region='+city.tag),fetch(origin+'/api/calendar?region='+city.tag)]);
  assert.equal(page.status,200);assert.equal(api.status,200);assert.equal(calendar.status,200);
  const payload=await api.json(),rows=Array.isArray(payload)?payload:payload.strikes;assert.ok(Array.isArray(rows));
  const ics=await calendar.text();assert.ok(ics.includes('BEGIN:VCALENDAR')&&ics.includes('END:VCALENDAR'));
  const ids=new Set();
  for(const row of rows){
   assert.ok(!ids.has(row.id));ids.add(row.id);
   assert.ok(!/CARGO/i.test(row.scopeType || '')&&!/POSTE AIR CARGO/i.test(row.provider));
   if(row.date<today) continue; // Historical legacy rows predate the field schema.
   assert.ok(Array.isArray(row.field_evidence));assert.ok(row.field_evidence.length);
   assert.ok(row.field_evidence.every(f=>f.location && f.affectedLines && f.guaranteedServiceWindow));
   if(row.category==='AIRPORT'){
    assert.ok(row.scopeType);assert.ok(!row.affected_lines.some(l=>/全国相关机场|全部机场/.test(l)));
    if(['AIRLINE','AIRLINE_CREW'].includes(row.scopeType)) assert.equal(row.affected_lines.length,0);
   }
  }
  cityData[city.tag]=rows;cityChecks.push({city:city.tag,page:page.status,api:api.status,calendar:calendar.status,cards:rows.length});
 }));
 const notices=(tag)=>cityData[tag].flatMap(r=>(r.strike_events || []).map(e=>({card:r,event:e})));
 const arriva=notices('BERGAMO').find(({event:e})=>e.timing_evidence?.fields?.affectedOperators.value.some(s=>/ARRIVA.*BERGAMO/i.test(s)));
 assert.ok(arriva);assert.deepEqual(arriva.event.windows,[{start:null,end:'05:59',end_kind:'clock'},{start:'08:31',end:'12:29',end_kind:'clock'},{start:'16:01',end:null,end_kind:'end_of_service'}]);
 assert.ok(arriva.event.timing_evidence.sources.some(s=>s.url.startsWith('https://bergamo.arriva.it/notice/')));
 for(const c of CITIES.filter(c=>c.tag!=='BERGAMO')) assert.ok(!notices(c.tag).some(({event:e})=>e.source_key===arriva.event.source_key));
 const venice=notices('VENEZIA').find(({event:e})=>e.timing_evidence?.fields?.affectedOperators.value.some(s=>/SICURITALIA/i.test(s)));assert.ok(venice);
 for(const c of CITIES.filter(c=>c.tag!=='VENEZIA'))assert.ok(!notices(c.tag).some(({event:e})=>e.source_key===venice.event.source_key));
 const milan=cityData.MILANO.filter(r=>r.date==='2026-10-16'&&r.status!=='CANCELLED');
 assert.ok(milan.some(r=>r.scopeType==='AIRLINE_CREW'));assert.ok(!milan.some(r=>r.category==='BUS'));
 const malpensa=cityData.MILANO.find(r=>r.date==='2026-11-22');assert.ok(malpensa);assert.deepEqual(malpensa.affected_lines,['马尔彭萨机场']);
 assert.ok(!cityData.BARI.some(r=>r.date==='2026-11-22'));
 for(const tag of ['FIRENZE','PISA']){
  const day=cityData[tag].filter(r=>r.date==='2026-10-14');assert.deepEqual(day.map(r=>r.category).sort(),['BUS','TRAIN']);
  assert.equal(day.find(r=>r.category==='TRAIN').scopeType,'RAIL_GENERAL');
  assert.ok(day.find(r=>r.category==='TRAIN').field_evidence.every(f=>f.passengerImpact.value==='DIRECT_SERVICE'&&f.railSections.value.some(s=>s.subject==='RAIL_CONTRACTORS'&&!s.representedByThisEvent)));
  assert.equal(day.find(r=>r.category==='TRAIN').display_time,'09:01 - 17:00');assert.ok(day.find(r=>r.category==='BUS').has_unknown_timing);
 }
 const bologna=cityData.BOLOGNA.find(r=>r.date==='2026-10-29');assert.ok(bologna);
 assert.equal(bologna.officialGeography[0].value.region,'Emilia-Romagna');assert.equal(bologna.officialGeography[0].value.province,'Tutte');assert.deepEqual(bologna.supportedCityProjection,['BOLOGNA']);
 const bari=cityData.BARI.find(r=>r.date==='2026-10-12');assert.ok(bari);assert.equal(bari.display_time,'08:30 - 12:29');assert.equal(bari.guaranteeSource,'OFFICIAL_STRIKE_NOTICE');assert.ok(bari.timing_evidence.conflicts.length);
 for(const tag of ['FIRENZE','PISA']) assert.ok(cityData[tag].some(r=>r.date==='2026-10-16'&&r.scopeType==='MIXED_AIRPORT_SERVICES'));
 for(const tag of ['PALERMO','CATANIA','MESSINA']) {
  const security=cityData[tag].find(r=>r.date==='2026-10-08'&&r.scopeType==='RAIL_SECURITY');assert.ok(security);
  assert.ok(security.field_evidence.every(f=>f.passengerImpact.value==='INDIRECT_OR_UNCONFIRMED'));
  assert.ok(security.field_evidence.every(f=>f.guaranteedServiceWindow.value.length===0));
  for(const date of ['2026-10-12','2026-10-13']) assert.ok(cityData[tag].some(r=>r.date===date&&r.scopeType==='RAIL_INFRASTRUCTURE'));
 }
 const atm=notices('MILANO').filter(({card,event})=>card.date==='2026-10-09'&&['BUS','SUBWAY'].includes(card.category)&&/ATM/i.test(event.timing_evidence?.fields?.affectedOperators.value.join(' ') || ''));
 assert.equal(atm.length,4);
 for(const {event} of atm) {
  assert.deepEqual(event.windows,[{start:'08:45',end:'15:00',end_kind:'clock'},{start:'18:00',end:null,end_kind:'end_of_service'}]);
  assert.equal(event.timing_evidence.fields.timing.source,'OPERATOR_OFFICIAL');
  assert.ok(event.timing_evidence.sources.some(s=>s.url==='https://www.atm.it/it/ViaggiaConNoi/InfoTraffico/Pagine/Sciopero9ottobre.aspx'&&s.authority==='official'));
 }
 const atmCards=cityData.MILANO.filter(r=>r.date==='2026-10-09'&&['BUS','SUBWAY'].includes(r.category));
 for(const r of atmCards){assert.equal(r.lineScope,'ALL_OPERATOR_LINES');assert.deepEqual(r.lineScopeEvidence.operatorIds,['ATM_MILANO']);assert.equal(r.guaranteeSource,'OPERATOR_RULE');assert.deepEqual(r.guaranteeEvidenceWindows,[{start:null,end:'08:45',end_kind:'clock'},{start:'15:00',end:'18:00',end_kind:'clock'}]);}
 assert.equal(arriva.card.lineScope,'ALL_OPERATOR_LINES');assert.equal(arriva.card.lineScopeEvidence.networkNames.length,3);assert.equal(arriva.event.timing_evidence.fields.guaranteeSource,'OPERATOR_RULE');assert.deepEqual(arriva.event.guarantee_windows,[{start:'06:00',end:'08:30'},{start:'12:30',end:'16:00'}]);
 const calendar=await (await fetch(origin+'/api/calendar?region=MILANO')).text();assert.ok(calendar.includes('运营商常规规则'));assert.ok(calendar.includes('运营开始'));
 const response=await fetch(origin+'/api/service-alerts?region=ROMA',{signal:AbortSignal.timeout(20000)});const alerts=await response.json();assert.equal(alerts.absenceMeansNormalService,false);assert.ok([200,503].includes(response.status));if(response.status===200){assert.equal(alerts.status,'FRESH');assert.ok(alerts.alerts.every(a=>!a.confirmedStrikeDisruption||a.isStrike&&a.isActive));}else assert.ok(['UNAVAILABLE','STALE'].includes(alerts.status));
 const eav=notices('NAPOLI').filter(({event})=>event.date==='2026-10-16'&&/\bEAV\b/.test(event.timing_evidence?.fields?.affectedOperators.value.join(' ')||''));assert.equal(eav.length,1);assert.equal(eav[0].card.category,'TRAIN');assert.equal(eav[0].card.scopeType,'RAIL_CREW');assert.equal(eav[0].card.display_time,'19:40 - 23:40');assert.equal(eav[0].event.timing_evidence.fields.lineScope.value.kind,'UNKNOWN');
 const gest=cityData.FIRENZE.find(r=>r.date==='2026-10-10'&&r.category==='BUS');assert.ok(gest);assert.equal(gest.guaranteeSource,'OFFICIAL_STRIKE_NOTICE');assert.equal(gest.lineScope,'SPECIFIC_LINES');assert.deepEqual(gest.affected_lines,['T1','T2']);assert.deepEqual(gest.guarantee_windows,[{start:'06:30',end:'09:30'},{start:'17:00',end:'20:00'}]);
 const air=notices('NAPOLI').find(({event})=>event.date==='2026-10-28'&&/AIR CAMPANIA/.test(event.timing_evidence?.fields?.affectedOperators.value.join(' ')||''));assert.ok(air);assert.equal(air.event.timing_evidence.fields.guaranteeSource,'OPERATOR_RULE');assert.deepEqual(air.event.timing_evidence.fields.guaranteeDuringStrike.value,[{start:'13:00',end:'15:00',end_kind:'clock'}]);
 const health=await (await fetch(origin+'/api/sync-status')).json();assert.equal(health.healthy,true);
 const report={checked_at:new Date().toISOString(),origin,cityChecks:cityChecks.sort((a,b)=>a.city.localeCompare(b.city)),regressions:{arrivaLocalAndOfficialHours:true,veniceLocalOnly:true,cargoExcluded:true,airlineNotEntireAirport:true,protectedBariNotAffectedBari:true,tuscanyRailAndUnknownTPL:true,officialBariTimingAndGuarantees:true,fieldEvidencePresent:true,mixedAirportServices:true,railSecurityNotTrainOperation:true,rfiRegionalCoverage:true,atmOfficialIndividualEventTiming:true,generalRailNotContractorOnly:true,officialRegionalGeographyPreserved:true,operatorGuaranteesAndSymbolicStart:true,operatorNetworkScopes:true,officialRealtimeContract:true,eavRailDivision:true,gestOfficialLinesAndGuarantees:true,airCampaniaRuleIntersection:true},realtime:{status:alerts.status,http:response.status,alerts:alerts.alerts.length,confirmedStrikeDisruptions:alerts.alerts.filter(a=>a.confirmedStrikeDisruption).length},health};
 const output=process.argv[2] || '/tmp/strike-scope-production-checks.json';fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({cities:cityChecks.length,allPassed:true,regressions:report.regressions,output}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
