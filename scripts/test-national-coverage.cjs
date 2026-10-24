/* eslint-disable @typescript-eslint/no-require-imports -- Regression harness for shared TypeScript logic. */
const fs=require('node:fs'),assert=require('node:assert/strict'),{test}=require('node:test'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {parseStrikeHtml,transformRows,auditSourceCoverage}=require('../lib/strikeSync.ts');
const {parseStrikeTiming,timingSections}=require('../lib/strikeTiming.ts');
const {CITIES}=require('../lib/cities.ts');
const {METRO_CITY_TAGS}=require('../lib/strikeSources.ts');
const {filterStrikesForRegion}=require('../components/utils.ts');
const {applyTimingEvidence}=require('../lib/strikeEnrichment.ts');
const fixture=fs.readFileSync(__dirname+'/fixtures/mit-2026-10-23-national.html','utf8');
const rows=()=>parseStrikeHtml(fixture);
const railway=()=>rows().find(r=>r.unions==='CUB TRASPORTI/SGB FERROVIE');
const general=()=>rows().find(r=>r.unions==='CGIL');

test('live general declaration is retained before modes/hours are published, independently of date/union',async()=>{
  for(const raw of [general(),{...general(),date:'11/02/2027',endDate:'11/02/2027',unions:'OTHER UNION',sourceKey:'new-general',modalita:'INTERA GIORNATA DALLE 00.01 ALLE 23.59'}]){
    assert.ok(raw);const records=await transformRows([raw]);
    assert.deepEqual([...new Set(records.map(r=>r.category))].sort(),['AIRPORT','BUS','SUBWAY','TRAIN']);
    for(const r of records){assert.equal(r.status,'UNCERTAIN');assert.deepEqual(r.strike_windows,[]);assert.deepEqual(r.guarantee_windows,[]);assert.deepEqual(r.affected_lines,[]);assert.equal(r.timing_evidence.fields.modeApplicability.value,'GENERAL_NOTICE_PENDING');assert.equal(r.timing_evidence.fields.scopeType.value,'UNKNOWN');}
    for(const city of CITIES){const visible=filterStrikesForRegion(records,city.tag);assert.ok(visible.some(r=>r.category==='TRAIN'));assert.ok(visible.some(r=>r.category==='BUS'));assert.equal(visible.some(r=>r.category==='SUBWAY'),METRO_CITY_TAGS.has(city.tag));}
  }
});
test('co-headed passenger rail and freight share the published cross-day interval',async()=>{
  const raw=railway();assert.equal(raw.region,'NATIONAL');
  const records=await transformRows([raw]),trains=records.filter(r=>r.category==='TRAIN');
  assert.deepEqual(trains.map(r=>[r.date,r.region,r.status,r.strike_windows]),[
    ['2026-11-20','NATIONAL','CONFIRMED',[{start:'21:00',end:'24:00'}]],
    ['2026-11-21','NATIONAL','CONFIRMED',[{start:'00:00',end:'20:00'}]],
  ]);
  for(const city of CITIES)assert.equal(filterStrikesForRegion(trains,city.tag).length,2);
});
test('dated TPL shift is only on its declared day and listed supported operator areas',async()=>{
  const raw=railway(),records=(await transformRows([raw])).filter(r=>r.category==='BUS');
  assert.deepEqual(records.map(r=>r.region).sort(),['BARI','NAPOLI','TORINO']);
  for(const r of records){assert.equal(r.date,'2026-11-21');assert.equal(r.status,'UNCERTAIN');assert.deepEqual(r.strike_windows,[]);assert.ok(r.timing_evidence.fields.operatorRestriction.value.includes('GTT'));assert.ok(r.timing_evidence.fields.affectedOperators.value.length);assert.deepEqual(r.timing_evidence.fields.supportedCityProjection.value.sort(),['BARI','NAPOLI','TORINO']);}
  for(const city of CITIES)assert.equal(filterStrikesForRegion(records,city.tag).length,['BARI','NAPOLI','TORINO'].includes(city.tag)?1:0);
  assert.ok(!records.some(r=>r.timing_evidence.fields.affectedOperators.value.includes('ATM')));
});
test('an unregistered restricted TPL company never expands into nationwide local transport',async()=>{
  const raw={...railway(),note:'PER TPL SOCC. UNKNOWN TRANSIT'};
  const result=await transformRows([raw]);assert.ok(result.some(r=>r.category==='TRAIN'));assert.ok(!result.some(r=>['BUS','SUBWAY'].includes(r.category)));
});
test('independent rail/contractor/aviation clauses never borrow their neighbors clocks',()=>{
  const text='FERROVIARIO: DALLE 09.01 ALLE 17.00; APPALTI FERROVIARI: SECONDO MEZZO TURNO; AEREO: DALLE 13.00 ALLE 17.00';
  assert.deepEqual(parseStrikeTiming(text,'TRAIN','2026-11-20').windows,[{start:'09:01',end:'17:00'}]);
  assert.deepEqual(parseStrikeTiming('FERROVIARIO: APPALTI FERROVIARI: DALLE 13.00 ALLE 17.00','TRAIN').windows,[]);
  assert.ok(timingSections(railway().modalita)[0].body.includes('21.00'));
});
test('all passenger-sector exclusions stay excluded in both new general and articulated notices',async()=>{
  const excluded=rows().filter(r=>/USI-CIT|ADL-COBAS\/CLAP|CIB-UNICOBAS/.test(r.unions));assert.equal(excluded.length,3);assert.deepEqual(await transformRows(excluded),[]);
  const raw={...general(),note:'ESCLUSI I SETTORI AEREO, FERROVIARIO, TPL; ADESIONE CGIL'};assert.deepEqual(await transformRows([raw]),[]);
});
test('coverage audit catches zero-output and wholly unknown geography rather than counting upserts as completeness',async()=>{
  const input=rows(),records=await transformRows(input),coverage=auditSourceCoverage(input,records);
  assert.equal(coverage.announcements,8);assert.equal(coverage.modeled,5);assert.equal(coverage.excluded,3);assert.deepEqual(coverage.issues,[]);
  const missing=auditSourceCoverage(input,records.filter(r=>r.source_key!==general().sourceKey));assert.ok(missing.issues.some(s=>s.startsWith('Unmodeled passenger declaration')));
  const partial=auditSourceCoverage([railway()],records.filter(r=>r.source_key===railway().sourceKey&&r.date!=='2026-11-20'));assert.ok(partial.issues.some(s=>s.startsWith('Unmodeled passenger mode/day')));
  const unprojected=auditSourceCoverage([railway()],records.filter(r=>r.source_key===railway().sourceKey).map(r=>({...r,region:'UNKNOWN'})));assert.ok(unprojected.issues.some(s=>s.startsWith('Unprojected passenger geography')));
});
test('national Techno Sky workforce is retained without turning every airport into affected lines',async()=>{
  const raw=rows().find(r=>/TECHNO SKY/.test(r.provider));assert.equal(raw.region,'NATIONAL');const records=await transformRows([raw]);
  assert.equal(records.length,1);assert.equal(records[0].category,'AIRPORT');assert.equal(records[0].timing_evidence.fields.scopeType.value,'NATIONAL_AVIATION');assert.deepEqual(records[0].affected_lines,[]);assert.deepEqual(records[0].timing_evidence.fields.affectedAirports.value,[]);
});
test('bus divisions of a railway company do not become train-crew events because of the brand',async()=>{
  const input=rows().filter(r=>r.date==='23/10/2026');assert.equal(input.length,2);const records=await transformRows(input);assert.equal(records.length,2);assert.ok(records.every(r=>r.category==='BUS'&&r.region==='BARI'));
});

test('a later matching official operator notice promotes only the matching local general-strike candidate',async()=>{
  const records=await transformRows([general()]),local=records.find(r=>r.category==='SUBWAY'&&r.region==='MILANO');
  const source={url:'https://www.atm.it/it/ViaggiaConNoi/InfoTraffico/Pagine/Avviso.aspx',authority:'official',name:'ATM',checked_at:'2026-11-15T10:00:00Z',excerpt:'20 novembre CGIL, Milano 08:45-15:00',content_hash:'fixture'};
  const notice={date:'2026-11-20',provider:'Atm Milano',territory:'Milano',unions:'CGIL',sector:'Trasporto pubblico locale',timing:'Atm Milano dalle 8:45 alle 15:00',status:'',source};
  const confirmed=applyTimingEvidence(local,[notice]);assert.equal(confirmed.status,'CONFIRMED');assert.equal(confirmed.timing_evidence.fields.modeApplicability.value,'EXPLICIT_TRANSPORT');
  const other=records.find(r=>r.category==='SUBWAY'&&r.region==='ROMA');assert.equal(applyTimingEvidence(other,[notice]).status,'UNCERTAIN');
});
