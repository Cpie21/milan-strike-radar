const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {test}=require('node:test');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {makeScopeEvidence,railScope}=require('../lib/strikeScope.ts');
const {parseLineScope,unknownLineScope,officialLineScope}=require('../lib/lineScope.ts');
const {buildLineImpact,attachLineImpacts,declaredLineMatch,lineRouteCatalogFeed}=require('../lib/lineImpact.ts');
const {operatorAdapters,identifyOperatorIds}=require('../lib/operatorAdapters.ts');
const {GTFS_FEEDS,catalogFromFiles,validateLineRoutes}=require('../lib/officialTransitData.ts');
const {parseLineImpactQuery,travellerLineImpacts}=require('../lib/travellerLineImpact.ts');
const {relevantLiveLineImpact}=require('../lib/liveLineImpact.ts');
const {applyTimingEvidence,parseExternalNotices,enrichStrikeTiming}=require('../lib/strikeEnrichment.ts');
const {aggregateStrikes}=require('../components/utils.ts');
const {CITIES}=require('../lib/cities.ts');
function record(provider='PERSONALE ATM MILANO',region='MILANO',category='BUS',date='2026-10-09',note='') {
 const raw_payload={provider,region,rawRegion:region,province:'Tutte',rilevanza:'Locale',date,endDate:date,sector:category==='TRAIN'?'Ferroviario':category==='AIRPORT'?'Aereo':'Trasporto pubblico locale',modalita:'24 ORE',note,unions:'USB'};
 return {id:provider,source_key:provider,provider,region,category,date,status:'CONFIRMED',raw_payload,strike_windows:[],guarantee_windows:[],affected_lines:[],display_time:'待公布',timing_evidence:{fields:makeScopeEvidence(raw_payload,region,category,[]),windows:[],sources:[],conflicts:[],confidence:'official',unions:'USB'}};
}
function lineFact(r,text){r.timing_evidence.fields.lineScope={value:parseLineScope(text,identifyOperatorIds(r),true),confidence:'HIGH',source:'OPERATOR_OFFICIAL',url:'https://www.atm.it/notice',excerpt:text};return r;}
test('all supported cities have bounded operator identity/source capabilities without inventing coverage',()=>{
 for(const c of CITIES)assert.ok(operatorAdapters.some(a=>a.cities.includes(c.tag)));
 assert.deepEqual(identifyOperatorIds(record('PERSONALE ATM MESSINA','MESSINA')),['ATM_MESSINA']);
 assert.deepEqual(identifyOperatorIds(record('PERSONALE ARRIVA BERGAMO','BERGAMO')),['ARRIVA_BERGAMO']);
 assert.deepEqual(identifyOperatorIds(record('PERSONALE ARRIVA BERGAMO','MILANO')),[]);
 assert.deepEqual(identifyOperatorIds(record('PERSONALE RATP','FIRENZE')),[]);
 assert.deepEqual(identifyOperatorIds(record('PERSONALE ATAF FOGGIA','UNKNOWN')),['ATAF_FOGGIA']);
 assert.deepEqual(identifyOperatorIds(record('PERSONALE ARRIVA UDINE','UNKNOWN')),['ARRIVA_UDINE']);
});
test('staff scope is known without claiming all operator lines or a stop',()=>{
 const f=buildLineImpact(record('PERSONALE AMTAB BARI','BARI'));
 assert.equal(f.declaredScope.value.kind,'OPERATOR_STAFF');assert.deepEqual(f.declaredScope.value.operatorIds,['AMTAB_BARI']);
 assert.match(f.declaredScope.url,/scioperi.mit.gov.it/);assert.equal(f.declaredScope.excerpt,'PERSONALE AMTAB BARI');assert.equal(f.specificLinesStatus,'NOT_CHECKED');assert.equal(f.observedStatus,'NOT_CHECKED');assert.doesNotMatch(f.presentation.zh,/全部线路|停运/);
 assert.equal(declaredLineMatch(f,'64'),'UNCONFIRMED');
});
test('official whole operator, named networks and exceptions retain their actual boundaries',()=>{
 const whole=buildLineImpact(lineFact(record(),'Le nostre linee potrebbero non essere garantite'));
 assert.equal(whole.declaredScope.value.kind,'ALL_OPERATOR_LINES');assert.equal(whole.specificLinesStatus,'NOT_ENUMERATED');assert.equal(declaredLineMatch(whole,'M99'),'UNCONFIRMED');
 const named=buildLineImpact(lineFact(record('ARRIVA BERGAMO','BERGAMO'),'servizi di linea gestiti da Bergamo Trasporti Sud, Bergamo Trasporti Est e Bergamo Trasporti Ovest'));
 assert.equal(named.declaredScope.value.kind,'NAMED_NETWORKS');assert.equal(named.declaredScope.value.networkNames.length,3);
 const except=buildLineImpact(lineFact(record('ATAC ROMA','ROMA'),'intera rete eccetto linee 021, 043'));
 assert.equal(except.declaredScope.value.kind,'ALL_EXCEPT');assert.equal(declaredLineMatch(except,'021'),'EXCLUDED');assert.equal(declaredLineMatch(except,'21'),'UNCONFIRMED');
});
test('Trenitalia department precedes company name; customer service is not operating crew',()=>{
 const r=record('PERSONALE SOC. TRENITALIA DIV. CUSTOMER OPERATIONS SEDI DI BOLOGNA','BOLOGNA','TRAIN');
 assert.equal(railScope(r.provider),'RAIL_CUSTOMER_SERVICE');assert.equal(r.timing_evidence.fields.passengerImpact.value,'INDIRECT_OR_UNCONFIRMED');
 const f=buildLineImpact(r);assert.equal(f.passengerRelevance,'SUPPORT_SERVICE');assert.equal(f.presentation.showLineSection,false);
 assert.equal(railScope('TRENITALIA PERSONALE DI MACCHINA E BORDO'),'RAIL_CREW');
});
test('regional rail scope preserves geography without creating passenger routes',()=>{
 const r=record('SCIOPERO GENERALE SETTORI PUBBLICI E PRIVATI ANCHE IN APPALTO','FIRENZE','TRAIN');
 r.raw_payload.modalita='FERROVIARIO: DALLE 09.01 ALLE 17.00 / APPALTI FERROVIARI: SECONDO MEZZO TURNO';r.raw_payload.rilevanza='Regionale';r.raw_payload.rawRegion='Toscana';r.timing_evidence.fields=makeScopeEvidence(r.raw_payload,r.region,r.category,[]);
 const f=buildLineImpact(r);assert.equal(f.declaredScope.value.kind,'REGIONAL_SERVICE');assert.equal(f.declaredScope.value.officialRegion,'Toscana');assert.deepEqual(f.declaredScope.value.affectedLineNames,[]);
});
test('failed, partial, unmatched, matched-without-lines and unexamined sources are distinct',()=>{
 const r=record();for(const [status,expected] of [['UNAVAILABLE','SOURCE_UNAVAILABLE'],['PARTIAL','SOURCE_PARTIAL'],['NO_MATCH','NO_MATCHED_NOTICE'],['MATCHED','NOT_STATED_IN_MATCHED_NOTICE'],['NOT_CHECKED','NOT_CHECKED']]){
  r.timing_evidence.fields.noticeDiscovery={checkedAt:'2026-10-05',status,sources:[]};assert.equal(buildLineImpact(r).specificLinesStatus,expected);
 }
 r.timing_evidence.fields.lineScope={value:parseLineScope('Le nostre linee',['ATM_MILANO'],true),confidence:'CONFLICT',source:'OPERATOR_OFFICIAL'};
 assert.equal(buildLineImpact(r).specificLinesStatus,'CONFLICT');assert.equal(declaredLineMatch(buildLineImpact(r),'M1'),'UNCONFIRMED');
});
test('ENAV protected policy survives an empty strike intersection and Bari remains an exception',()=>{
 const r=record('PERSONALE SOC. ENAV AEROPORTO DI MILANO MALPENSA','MILANO','AIRPORT','2026-11-22','GARANTITI I VOLI DA E PER L\'AEROPORTO DI BARI');
 let f=makeScopeEvidence(r.raw_payload,r.region,r.category,[{start:'13:00',end:'17:00'}]);
 assert.equal(f.guaranteeSource,'STANDARD_RULE');assert.equal(f.guaranteeEvidenceWindows.value.length,2);assert.deepEqual(f.guaranteeDuringStrike.value,[]);
 assert.equal(f.protectedFlightExceptions.value[0].airportName,'BARI');assert.ok(f.affectedAirports.value.every(a=>!/bari/i.test(a)));
 f=makeScopeEvidence(r.raw_payload,r.region,r.category,[{start:'09:00',end:'13:00'}]);assert.deepEqual(f.guaranteeDuringStrike.value,[{start:'09:00',end:'10:00',end_kind:'clock'}]);
 r.timing_evidence.fields=f;const impact=buildLineImpact(r);assert.equal(impact.specificLinesStatus,'NOT_APPLICABLE');assert.equal(impact.presentation.showLineSection,false);assert.equal(impact.aviation.protectedFlightExceptions.value[0].airportName,'BARI');
});
test('route catalogue selection covers all seven feeds and rejects mixed operator identities',()=>{
 for(const [id,feed] of Object.entries(GTFS_FEEDS)){const scope={...unknownLineScope(),operatorIds:[feed.operator]};assert.equal(lineRouteCatalogFeed(scope,GTFS_FEEDS),id);}
 assert.equal(lineRouteCatalogFeed({...unknownLineScope(),operatorIds:['ATM_MILANO','ATAC_ROMA']},GTFS_FEEDS),undefined);
});
test('catalogue mode expiry cannot borrow metro validity for surface routes',()=>{
 const c=catalogFromFiles('GTFS_MILANO',{'agency.txt':'agency_id,agency_name\na,ATM Milano\n','routes.txt':'route_id,agency_id,route_short_name,route_type\n90,a,90,3\nM1,a,1,1\n','feed_info.txt':'feed_start_date,feed_end_date,surface_end_date,mm_end_date\n20260901,20261019,20261002,20261015\n'});
 assert.equal(validateLineRoutes(parseLineScope('linea 90',['ATM_MILANO']),c,'2026-10-09','BUS').routeValidation,'OUT_OF_VALIDITY');
 assert.equal(validateLineRoutes(parseLineScope('M1',['ATM_MILANO']),c,'2026-10-09','SUBWAY').routeValidation,'VERIFIED');
});
test('official rail route codes are preserved but grievances never donate historical routes',()=>{
 assert.deepEqual(parseLineScope('Linee R23, R27, RE54, RE80 e S5',['TRENORD'],true).affectedLineNames,['R23','R27','RE54','RE80','S5']);
 assert.deepEqual(parseLineScope('Sciopero. MOTIVAZIONI: la linea R23 e M1 negli ultimi scioperi',['TRENORD'],true).affectedLineNames,[]);
});
test('traveller query excludes other dates, cities, modes, cargo and cancelled events',()=>{
 const q=parseLineImpactQuery(new URLSearchParams('region=MILANO&date=2026-10-09&category=BUS'),'2026-10-05');
 const rows=[record(),record('ATAC','ROMA'),record('ATM','MILANO','SUBWAY'),record('ATM2','MILANO','BUS','2026-10-10'),{...record('revoked'),status:'CANCELLED'},{...record('stale'),status:'STALE'}];
 assert.equal(travellerLineImpacts(rows,q).events.length,1);
 const aq=parseLineImpactQuery(new URLSearchParams('region=MILANO&date=2026-10-09&category=AIRPORT'),'2026-10-05');
 assert.equal(travellerLineImpacts([record('POSTE AIR CARGO','NATIONAL','AIRPORT')],aq).events.length,0);
 for(const input of ['region=FOGGIA','date=2026-02-31','category=SHIP','line=M1','category=AIRPORT&line=AZ1'])assert.throws(()=>parseLineImpactQuery(new URLSearchParams(input),'2026-10-05'));
});
test('line selection retains uncertain scope and keeps workforce advisories separate',()=>{
 const q=parseLineImpactQuery(new URLSearchParams('region=MILANO&date=2026-10-09&category=BUS&line=021'),'2026-10-05');
 const named=lineFact(record('ATM'),'linee 021 e 043');const another=lineFact(record('ATM2'),'linea 64');
 assert.equal(travellerLineImpacts([named,another,record('ATM3')],q).events.length,2);
 const r=record('FS SECURITY REGIONE SICILIA','PALERMO','TRAIN');
 const rq=parseLineImpactQuery(new URLSearchParams('region=PALERMO&date=2026-10-09&category=TRAIN'),'2026-10-05');
 const out=travellerLineImpacts([r],rq);assert.equal(out.events.length,0);assert.equal(out.relatedServices.length,1);assert.equal(out.absenceMeansNormalService,false);
});
test('aggregation retains each announcement scope and never drops unknown sibling evidence',()=>{
 const named=lineFact(record('ATM'),'linea 90');const unknown=record('ATM2');
 const card=aggregateStrikes(attachLineImpacts([named,unknown]),'MILANO')[0];assert.equal(card.lineImpacts.length,2);assert.ok(card.lineImpacts.some(x=>x.impact.declaredScope.value.kind==='SPECIFIC_LINES'));assert.ok(card.lineImpacts.some(x=>x.impact.declaredScope.value.kind!=='SPECIFIC_LINES'));
 const quoted={date:'2026-10-09',provider:'ATM Milano',territory:'Milano',unions:'USB',sector:'Trasporto pubblico locale',timing:'Le nostre linee potrebbero non essere garantite dalle 08:45 alle 15:00',source:{url:'https://www.atm.it/notice',name:'ATM',authority:'official',checked_at:'2026-10-05',content_hash:'x',excerpt:'Le nostre linee'}};
 const adopted=applyTimingEvidence(record(),[quoted]);assert.equal(buildLineImpact(adopted).declaredScope.value.kind,'ALL_OPERATOR_LINES');
});
const live={region:'ROMA',source:'https://official.test',feedTimestamp:'2026-10-09T09:00:00Z',checkedAt:'2026-10-09T09:00:01Z',status:'FRESH',alerts:[{id:'a',header:'Strike',description:'Reduced',effect:'REDUCED_SERVICE',isActive:true,confirmedStrikeDisruption:true,selectors:[{routeId:'r64',stopId:null,tripId:null}]},{id:'b',header:'Other',description:'Works',effect:'NO_SERVICE',isActive:true,confirmedStrikeDisruption:false,selectors:[{routeId:'m1',stopId:null,tripId:null}]}]};
const catalog={feedId:'GTFS_ROMA',validFrom:'2026-10-01',validTo:'2026-10-31',routes:[{id:'r64',name:'64',type:3,operator:'ATAC_ROMA'},{id:'m1',name:'A',type:1,operator:'ATAC_ROMA'}]};
test('live observations require current source, route identity, mode and exact line selection',()=>{
 const q={today:'2026-10-09',date:'2026-10-09',category:'BUS',line:'64'};
 const out=relevantLiveLineImpact(live,catalog,q);assert.equal(out.alerts.length,1);assert.equal(out.alerts[0].strikeCauseConfirmed,true);
 assert.equal(relevantLiveLineImpact(live,catalog,{...q,category:'SUBWAY'}).alerts.length,0);
 assert.equal(relevantLiveLineImpact(live,undefined,q).status,'UNVERIFIED_SCOPE');
 assert.equal(relevantLiveLineImpact({...live,status:'STALE'},catalog,q).alerts.length,0);
 assert.equal(relevantLiveLineImpact(live,catalog,{...q,date:'2026-10-10'}).status,'NOT_APPLICABLE');
 const trip={...live,alerts:[{...live.alerts[0],selectors:[{routeId:'r64',stopId:null,tripId:'t1'}]}]};assert.equal(relevantLiveLineImpact(trip,catalog,q).alerts.length,0);
 const other=relevantLiveLineImpact(live,catalog,{...q,category:'SUBWAY',line:'A'});assert.equal(other.alerts[0].strikeCauseConfirmed,false);
 assert.equal(relevantLiveLineImpact({...live,alerts:[]},catalog,q).absenceMeansNormalService,false);
});

test('identical line scope across unions has one traveller entry with both evidence records',()=>{
 const a=lineFact(record('ATM'),'Le nostre linee');const b=lineFact({...record('ATM'),id:'union-b',source_key:'union-b'},'Le nostre linee');
 const q=parseLineImpactQuery(new URLSearchParams('region=MILANO&date=2026-10-09&category=BUS'),'2026-10-05');
 const out=travellerLineImpacts([a,b,{...record('ATM'),id:'union-c',source_key:'union-c'}],q);
 assert.equal(out.events.length,2);assert.equal(out.events[0].announcements.length,2);assert.equal(out.events[1].impact.declaredScope.value.kind,'OPERATOR_STAFF');
});
test('operator-wide relevance for a requested line requires fresh dated mode-specific route membership',()=>{
 const r=lineFact(record('ATM','MILANO','SUBWAY'),'Le nostre linee');
 r.timing_evidence.fields.serviceSchedule={confidence:'HIGH',source:'OPERATOR_OFFICIAL',value:{status:'COMPLETE',date:r.date,category:'SUBWAY',operator:'ATM_MILANO',source:'https://official.test/gtfs',checkedAt:'2026-10-05T09:00:00Z',routes:[{id:'M1',name:'1'}],firstDeparture:{clock:'06:00',dayOffset:0,seconds:21600}}};
 const impact=buildLineImpact(r,new Date('2026-10-05T12:00:00Z'));
 assert.equal(declaredLineMatch(impact,'M1'),'POTENTIAL');assert.equal(declaredLineMatch(impact,'M99'),'UNCONFIRMED');
 assert.equal(declaredLineMatch(buildLineImpact(r,new Date('2026-10-08T12:00:00Z')),'M1'),'UNCONFIRMED');
 r.timing_evidence.fields.serviceSchedule.value.category='BUS';assert.equal(declaredLineMatch(buildLineImpact(r,new Date('2026-10-05T12:00:00Z')),'M1'),'UNCONFIRMED');
});
test('a dated official scope-only notice supplies lines without overwriting MIT time',()=>{
 const url='https://www.gestramvia.it/official-scope/';
 const html='<article><h1>Sciopero GEST Firenze 10 ottobre 2026</h1><p>USB: le linee T1 e T2 potrebbero subire cancellazioni.</p></article>';
 const notices=parseExternalNotices(html,url,['2026-10-10'],'2026-10-05T12:00:00Z');assert.ok(notices.length);
 const r=record('GEST FIRENZE','FIRENZE','BUS','2026-10-10');r.strike_windows=[{start:'10:00',end:'14:00'}];
 const out=applyTimingEvidence(r,notices);assert.deepEqual(out.affected_lines,['T1','T2']);assert.deepEqual(out.strike_windows,r.strike_windows);
 assert.equal(parseExternalNotices(html,url,['2027-10-10'],'2027-10-05T12:00:00Z').length,0);
 const grievance=html.replace('USB: le linee','USB: MOTIVAZIONI: le linee');assert.equal(parseExternalNotices(grievance,url,['2026-10-10']).length,0);
});

test('official mode sections never lend metro lines to buses or surface lines to metro',()=>{
 const source={authority:'official',url:'https://www.atm.it/notice'};
 const text='Metropolitana: linee M1 e M2. Superficie: linee 90 e 91.';
 const bus=officialLineScope(record('ATM'),text,source);const metro=officialLineScope(record('ATM','MILANO','SUBWAY'),text,source);
 assert.deepEqual(bus.value.affectedLineNames,['90','91']);assert.deepEqual(metro.value.affectedLineNames,['M1','M2']);
 assert.equal(officialLineScope(record('ATM'),'Metro linee M1 e M2',source).value.kind,'UNKNOWN');
 assert.equal(officialLineScope(record('ATM','MILANO','SUBWAY'),'Tram linee 15 e 16',source).value.kind,'UNKNOWN');
});

test('a reachable index with an inaccessible dated article is partial discovery, not an empty notice',async()=>{
 const original=global.fetch,url='https://www.gestramvia.it/10-ottobre-sciopero/';
 global.fetch=async input=>{const u=String(input);if(u===url)return new Response('Blocked',{status:403});return new Response(u==='https://www.gestramvia.it/news/'?`<main><a href="${url}">Sciopero 10 ottobre 2026</a></main>`:'<main>News</main>',{headers:{'content-type':'text/html'}});};
 try{const out=await enrichStrikeTiming([record('GEST FIRENZE','FIRENZE','BUS','2026-10-10')],[],new Date('2026-10-05T12:00:00Z'));const d=out.records[0].timing_evidence.fields.noticeDiscovery;assert.equal(d.status,'PARTIAL');assert.ok(d.sources.some(s=>s.url===url&&s.status==='FAILED'));}finally{global.fetch=original;}
});
test('national TPL can gain a city-specific official scope before exact hours exist',async()=>{
 const original=global.fetch,url='https://www.gestramvia.it/10-ottobre-sciopero/';
 global.fetch=async input=>new Response(String(input)===url?'<article><h1>Sciopero GEST Firenze 10 ottobre 2026</h1><p>USB: le linee T1 e T2 potrebbero subire cancellazioni.</p></article>':String(input)==='https://www.gestramvia.it/news/'?`<main><a href="${url}">Sciopero 10 ottobre 2026</a></main>`:'<main>News</main>',{headers:{'content-type':'text/html'}});
 try{const out=await enrichStrikeTiming([record('SCIOPERO GENERALE SETTORI PUBBLICI E PRIVATI','NATIONAL','BUS','2026-10-10')],[],new Date('2026-10-05T12:00:00Z'));const r=out.records.find(r=>r.region==='FIRENZE');assert.ok(r);assert.deepEqual(r.timing_evidence.fields.lineScope.value.affectedLineNames,['T1','T2']);assert.equal(r.timing_evidence.windows.length,0);}finally{global.fetch=original;}
});

test('official general-strike geography is retained without naming every operator or route',()=>{
 for(const [relevance,region,kind] of [['Regionale','Toscana','REGIONAL_SERVICE'],['Nazionale','Italia','NATIONAL_SERVICE']]) {
 const r=record('SCIOPERO GENERALE SETTORI PUBBLICI E PRIVATI',relevance==='Nazionale'?'NATIONAL':'FIRENZE');r.raw_payload.rilevanza=relevance;r.raw_payload.rawRegion=region;r.timing_evidence.fields=makeScopeEvidence(r.raw_payload,r.region,r.category,[]);
 const out=buildLineImpact(r);assert.equal(out.declaredScope.value.kind,kind);assert.deepEqual(out.declaredScope.value.operatorIds,[]);assert.deepEqual(out.declaredScope.value.affectedLineNames,[]);assert.equal(declaredLineMatch(out,'90'),'UNCONFIRMED');assert.doesNotMatch(out.presentation.zh,/全部线路|铁路/);
 }
});

test('mode extraction trims grievances before a historic tram section can replace current T1/T2',()=>{
 const text='Sabato 10 ottobre i tram delle linee T1 e T2 potrebbero subire ritardi o cancellazioni. Le MOTIVAZIONI: Relazioni col Personale. Tram: linea 1 e turni precedenti.';
 const source={authority:'official',url:'https://www.gestramvia.it/notice'};
 const f=officialLineScope(record('GEST FIRENZE','FIRENZE'),text,source);assert.deepEqual(f.value.affectedLineNames,['T1','T2']);
});
