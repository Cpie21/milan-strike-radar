const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {test}=require('node:test');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {makeScopeEvidence}=require('../lib/strikeScope.ts');
const {applyGuaranteeProfile,selectGuaranteePolicy,operatorGuaranteeProfiles,italianHoliday,intersectGuaranteeEvidence}=require('../lib/operatorGuaranteeProfiles.ts');
const {parseLineScope,mergeLineScopes}=require('../lib/lineScope.ts');
const {parseCsv,catalogFromFiles,validateLineRoutes,transitBytes,loadRouteCatalog}=require('../lib/officialTransitData.ts');
const {refreshGuaranteeProfiles,ruleStillMatches}=require('../lib/guaranteeProfileRefresh.ts');
const {decodeServiceAlerts,currentServiceAlerts}=require('../lib/transitServiceAlerts.ts');
const {transit_realtime:gtfs}=require('gtfs-realtime-bindings');
const {aggregateStrikes}=require('../components/utils.ts');
const {applyTimingEvidence}=require('../lib/strikeEnrichment.ts');
function record(provider='PERSONALE ATM MILANO',region='MILANO',category='BUS',date='2026-10-09',modalita='24 ORE',note='') {
 const raw_payload={provider,sector:category==='TRAIN'?'Ferroviario':'Trasporto pubblico locale',modalita,note,unions:'USB',province:region,rilevanza:'Locale',date,endDate:date,region,rawRegion:region};
 const fields=makeScopeEvidence(raw_payload,region,category,[]);
 return {provider,region,category,date,status:'UNCERTAIN',raw_payload,strike_windows:[],guarantee_windows:[],affected_lines:[],display_time:'待公布',source_key:provider,timing_evidence:{fields,windows:[],sources:[],confidence:'official',conflicts:[],unions:'USB'}};
}
const fact=value=>({value,confidence:'HIGH',source:'OPERATOR_OFFICIAL'});
const window=(start,end)=>({start,end,end_kind:'clock'});
test('ATM operator profile keeps service start symbolic without assuming midnight',()=>{
 const r=applyGuaranteeProfile(record());assert.equal(r.timing_evidence.fields.guaranteeSource,'OPERATOR_RULE');assert.deepEqual(r.timing_evidence.fields.guaranteeEvidenceWindows.value,[window(null,'08:45'),window('15:00','18:00')]);assert.deepEqual(r.guarantee_windows,[{start:'15:00',end:'18:00'}]);assert.equal(r.strike_windows.length,0);
 const a=aggregateStrikes([r])[0];assert.equal(a.guaranteeSource,'OPERATOR_RULE');assert.deepEqual(a.guaranteeEvidenceWindows,r.timing_evidence.fields.guaranteeEvidenceWindows.value);
});
test('city alone, ATM Messina, other Rome operator, mixed operators and cancellation cannot select a profile',()=>{
 for(const r of [record('Trasporto pubblico MILANO'),record('ATM MESSINA','MESSINA'),record('ROMA TPL','ROMA'),record('ATAC / ROMA TPL','ROMA'),{...record(),status:'CANCELLED'}])assert.equal(selectGuaranteePolicy(r),undefined);
});
test('GTT city mode and interurban service stay separate',()=>{
 assert.ok(selectGuaranteePolicy(record('GTT servizio urbano','TORINO')));
 assert.ok(selectGuaranteePolicy(record('GTT METROPOLITANA','TORINO','SUBWAY')));
 assert.equal(selectGuaranteePolicy(record('GTT EXTRAURBANO','TORINO')),undefined);assert.equal(selectGuaranteePolicy(record('GTT','TORINO')),undefined);
});
test('expired profiles do not silently keep applying to future strikes',()=>{assert.equal(selectGuaranteePolicy(record('ATM MILANO','MILANO','BUS','2026-12-01')),undefined);});
test('event-specific guarantee and source conflict block profile fallback',()=>{
 const r=record();r.timing_evidence.fields.guaranteeSource='OFFICIAL_STRIKE_NOTICE';r.guarantee_windows=[{start:'07:00',end:'09:00'}];assert.deepEqual(applyGuaranteeProfile(r),r);
 r.timing_evidence.fields.guaranteeSource='UNKNOWN';r.timing_evidence.fields.guaranteedServiceWindow.confidence='CONFLICT';assert.equal(selectGuaranteePolicy(r),undefined);
});
test('dated operator disruption overlapping a normal protection rule is never relabelled protected',()=>{
 const r=record();r.timing_evidence.fields.timing.source='OPERATOR_OFFICIAL';r.timing_evidence.windows=[window('09:00','18:00')];assert.equal(selectGuaranteePolicy(r),undefined);
});
test('regional Trenitalia has distinct weekday and holiday frameworks, not guaranteed train numbers',()=>{
 const weekday=applyGuaranteeProfile(record('TRENITALIA REGIONALE PERSONALE DI BORDO','BOLOGNA','TRAIN','2026-10-09'));
 const holiday=applyGuaranteeProfile(record('TRENITALIA REGIONALE PERSONALE DI BORDO','BOLOGNA','TRAIN','2026-10-11'));
 assert.equal(weekday.guarantee_windows[0].start,'06:00');assert.equal(holiday.guarantee_windows[0].start,'07:00');assert.equal(weekday.timing_evidence.fields.guaranteedTrains.confidence,'UNKNOWN');assert.deepEqual(weekday.timing_evidence.fields.guaranteedTrains.value,[]);
 for(const provider of ['FS SECURITY REGIONE SICILIA','RFI DOIT PALERMO','TRENITALIA CUSTOMER OPERATIONS','TRENORD REGIONALE','APPALTI FERROVIARI','TRENITALIA FRECCIAROSSA'])assert.equal(selectGuaranteePolicy(record(provider,'BOLOGNA','TRAIN')),undefined);
 assert.equal(italianHoliday('2026-10-10'),false);assert.equal(italianHoliday('2026-11-01'),true);assert.equal(italianHoliday('2026-04-06'),true);
});
test('Arriva profile needs the named Bergamo consortia and excludes airport shuttles',()=>{
 const r=record('ARRIVA ITALIA BERGAMO','BERGAMO');r.timing_evidence.fields.lineScope=fact(parseLineScope('servizi di linea gestiti da BERGAMO TRASPORTI SUD, BERGAMO TRASPORTI EST e BERGAMO TRASPORTI OVEST',['ARRIVA_BERGAMO'],true));
 assert.deepEqual(applyGuaranteeProfile(r).guarantee_windows,[{start:'06:00',end:'08:30'},{start:'12:30',end:'16:00'}]);assert.equal(selectGuaranteePolicy(record('ARRIVA AEROPORTO BERGAMO','BERGAMO')),undefined);
});
test('source refresh extends only revalidated rules; changed rules stop fallback immediately',async()=>{
 const warnings=[];const profiles=await refreshGuaranteeProfiles(new Date('2026-10-10T10:00:00Z'),warnings,async url=>url.includes('atm.it')?'In caso di sciopero dall’inizio del servizio alle 8.45 e dalle 15.00 alle 18.00':'Changed rule');
 assert.equal(profiles.length,1);assert.equal(profiles[0].operator,'ATM_MILANO');assert.equal(profiles[0].validTo,'2026-11-09');
 const expired=await refreshGuaranteeProfiles(new Date('2026-12-01T10:00:00Z'),[],async()=>{throw new Error('offline')});assert.deepEqual(expired,[]);
 const rail=operatorGuaranteeProfiles.find(p=>p.operator==='TRENITALIA_REGIONALE');assert.equal(ruleStillMatches(rail,'In caso di sciopero dalle 06:00 alle 09:00 e dalle 18:00 alle 21:00 giorni feriali; 07.00 alle 10.00 e 18.00 alle 21.00 festivi, individuati per numero di treno'),true);
});
test('operator our-lines scope never expands to every city operator or all employees',()=>{
 assert.equal(parseLineScope('Le nostre linee potrebbero non essere garantite',['ATM_MILANO'],true).kind,'ALL_OPERATOR_LINES');
 for(const [text,ids,official] of [['Le nostre linee',['ATM_MILANO'],false],['tutto il personale',['ATM_MILANO'],true],['tutte le linee',[],true]])assert.equal(parseLineScope(text,ids,official).kind,'UNKNOWN');
 const a=record();const n={date:a.date,provider:'ATM Milano',territory:'Milano',sector:'Trasporto pubblico locale',unions:'USB',timing:'dalle 8:45 alle 15',field_text:'Le nostre linee potrebbero non essere garantite',status:'',source:{url:'https://www.atm.it/it/ViaggiaConNoi/InfoTraffico/Pagine/test.aspx',authority:'official',name:'ATM',excerpt:'Le nostre linee',checked_at:'2026-10-05',content_hash:'h'}};
 assert.equal(applyTimingEvidence(a,[n]).timing_evidence.fields.lineScope.value.kind,'ALL_OPERATOR_LINES');
});
test('specific line lists preserve leading zeros and do not turn clocks into line numbers',()=>{
 assert.deepEqual(parseLineScope('linee 021, 043 e 90 dalle 8:30 alle 15',['ATAC_ROMA'],true).affectedLineNames,['021','043','90']);
 assert.deepEqual(parseLineScope('linee M1 e M2, linea 15',['ATM_MILANO'],true).affectedLineNames,['M1','M2','15']);
 assert.equal(parseLineScope('servizio dalle 08:45 alle 15:00',['ATM_MILANO'],true).kind,'UNKNOWN');
});
test('all-except excludes specified routes; unparsed exceptions do not become all lines',()=>{
 const v=parseLineScope('intera rete ATAC, ad eccezione delle linee 021, 043 e 040',['ATAC_ROMA'],true);assert.equal(v.kind,'ALL_EXCEPT');assert.deepEqual(v.excludedLineNames,['021','043','040']);
 assert.equal(parseLineScope('tutte le linee eccetto alcune non specificate',['ATAC_ROMA'],true).kind,'UNKNOWN');assert.equal(parseLineScope('M1 esclusa',['ATM_MILANO'],true).kind,'UNKNOWN');
});
test('aggregate line coverage unions same-operator impacts but never merges distinct networks as all lines',()=>{
 const a=parseLineScope('tutte le linee eccetto linea 021',['ATAC_ROMA'],true),b=parseLineScope('linea 021',['ATAC_ROMA'],true);
 assert.equal(mergeLineScopes([fact(a),fact(b)]).kind,'ALL_OPERATOR_LINES');
 assert.equal(mergeLineScopes([fact(a),fact(parseLineScope('le nostre linee',['ATM_MILANO'],true))]).kind,'UNKNOWN');
});
const files={'agency.txt':'agency_id,agency_name\na,ATAC\nb,Troiani\n','routes.txt':'route_id,agency_id,route_short_name,route_type\nr021,a,021,3\nr43,a,043,3\nmA,a,A,1\nother,b,021,3\n','calendar.txt':'service_id,start_date,end_date\ns,20261001,20261031\n'};
test('CSV quotes, BOM and multiline fields work; malformed rows are rejected',()=>{
 assert.deepEqual(parseCsv('\ufeffid,name\r\n1,"name, with ""quote""\nsecond line"\r\n'),[{id:'1',name:'name, with "quote"\nsecond line'}]);
 assert.throws(()=>parseCsv('id,name\n1,"oops'));assert.throws(()=>parseCsv('id,id\n1,2'));assert.throws(()=>parseCsv('id,name\n1'));
});
test('GTFS matches only the verified agency and mode, not neighbouring operators',()=>{
 const c=catalogFromFiles('GTFS_ROMA',files);assert.equal(c.routes.length,3);
 const s=parseLineScope('linee 021, 043',['ATAC_ROMA'],true);const v=validateLineRoutes(s,c,'2026-10-10','BUS');assert.equal(v.routeValidation,'VERIFIED');assert.deepEqual(v.affectedRouteIds,['r021','r43']);
 assert.equal(validateLineRoutes(s,c,'2026-10-10','SUBWAY').routeValidation,'PARTIAL');assert.equal(validateLineRoutes(s,c,'2026-11-01','BUS').routeValidation,'OUT_OF_VALIDITY');
 assert.deepEqual(validateLineRoutes(parseLineScope('linea 21',['ATAC_ROMA'],true),c,'2026-10-10','BUS').affectedRouteIds,[]);
});
test('ambiguous GTFS names do not produce guessed IDs; exclusions have separate IDs',()=>{
 const c=catalogFromFiles('GTFS_ROMA',{...files,'routes.txt':files['routes.txt']+'r021b,a,021,3\n'});
 assert.equal(validateLineRoutes(parseLineScope('linea 021',['ATAC_ROMA'],true),c,'2026-10-10','BUS').routeValidation,'AMBIGUOUS');
 const v=validateLineRoutes(parseLineScope('intera rete eccetto linea 043',['ATAC_ROMA'],true),c,'2026-10-10','BUS');assert.deepEqual(v.excludedRouteIds,['r43']);assert.deepEqual(v.affectedRouteIds,[]);
});
test('official redirects are bounded and same-host; private URL and ignored oversized Range are rejected',async()=>{
 const original=global.fetch;try{
 global.fetch=async url=>String(url).endsWith('/old')?new Response(null,{status:301,headers:{location:'/new'}}):new Response('ok');assert.equal((await transitBytes('https://romamobilita.it/old',10,Date.now()+1000)).bytes.toString(),'ok');
 global.fetch=async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});await assert.rejects(transitBytes('https://romamobilita.it/old',10,Date.now()+1000),/Unsafe/);
 await assert.rejects(transitBytes('https://127.0.0.1/',10,Date.now()+1000),/Unapproved/);
 global.fetch=async()=>new Response('oversized',{headers:{'content-length':'9'}});await assert.rejects(transitBytes('https://romamobilita.it/new',2,Date.now()+1000),/too large/);
 }finally{global.fetch=original;}
});
const now=new Date('2026-10-05T09:00:00Z'),instant=now.getTime()/1000;
function encoded(cause=gtfs.Alert.Cause.STRIKE,effect=gtfs.Alert.Effect.NO_SERVICE,override={}) {
 return gtfs.FeedMessage.encode(gtfs.FeedMessage.create({header:{gtfsRealtimeVersion:'2.0',timestamp:instant},entity:[{id:'a',alert:{cause,effect,activePeriod:[{start:instant-60,end:instant+30}],informedEntity:[{routeId:'r021',stopId:'s1'}],headerText:{translation:[{text:'Avviso',language:'it'}]}}}],...override})).finish();
}
test('fresh strike service alert is explicitly scoped, construction is never attributed to strike',()=>{
 const r=decodeServiceAlerts(encoded(),now);assert.equal(r.status,'FRESH');assert.equal(r.alerts[0].confirmedStrikeDisruption,true);assert.equal(r.alerts[0].selectors[0].scope,'STOP');assert.equal(r.absenceMeansNormalService,false);
 assert.equal(decodeServiceAlerts(encoded(gtfs.Alert.Cause.CONSTRUCTION),now).alerts[0].confirmedStrikeDisruption,false);
});
test('stale, missing timestamp, future feed, expired alert, or differential feed never confirms current strike',()=>{
 for(const header of [{gtfsRealtimeVersion:'2.0'},{gtfsRealtimeVersion:'2.0',timestamp:instant-1000},{gtfsRealtimeVersion:'2.0',timestamp:instant+500}])assert.equal(decodeServiceAlerts(encoded(undefined,undefined,{header}),now).alerts[0].confirmedStrikeDisruption,false);
 const r=decodeServiceAlerts(encoded(),now);assert.equal(currentServiceAlerts(r,new Date(now.getTime()+31000)).alerts[0].confirmedStrikeDisruption,false);
 assert.throws(()=>decodeServiceAlerts(encoded(undefined,undefined,{header:{gtfsRealtimeVersion:'2.0',timestamp:instant,incrementality:gtfs.FeedHeader.Incrementality.DIFFERENTIAL}}),now),/Incremental/);
 assert.equal(decodeServiceAlerts(encoded(undefined,undefined,{entity:[]}),now).absenceMeansNormalService,false);
});
test('missing cause/effect, unknown selector and invalid periods cannot claim confirmed disruption',()=>{
 for(const alert of [{effect:1,informedEntity:[{routeId:'r021'}]},{cause:4,informedEntity:[{routeId:'r021'}]},{cause:4,effect:1,informedEntity:[]},{cause:4,effect:1,activePeriod:[{}],informedEntity:[{routeId:'r021'}]}]) {
 const r=decodeServiceAlerts(encoded(undefined,undefined,{entity:[{id:'a',alert}]}),now);assert.equal(r.alerts[0].confirmedStrikeDisruption,false);
 }
});
test('actual Milan GTFS metro naming is validated with both route ID and mode',()=>{
 const c=catalogFromFiles('GTFS_MILANO',{'agency.txt':'agency_id,agency_name\na,ATM\n','routes.txt':'route_id,agency_id,route_short_name,route_type\nM1,a,1,1\nT1,a,1,0\n','calendar.txt':'service_id,start_date,end_date\ns,20260914,20261019\n'});
 const s=parseLineScope('M1',['ATM_MILANO'],true);assert.deepEqual(validateLineRoutes(s,c,'2026-10-09','SUBWAY').affectedRouteIds,['M1']);assert.deepEqual(validateLineRoutes(s,c,'2026-10-09','BUS').affectedRouteIds,[]);
});
test('cached profile documents cannot acquire a false new checked date or extend their expiry',async()=>{
 const profiles=await refreshGuaranteeProfiles(new Date('2026-10-10T10:00:00Z'),[],async url=>({text:url.includes('atm.it')?'In caso di sciopero alle 8.45 e dalle 15.00 alle 18.00':'unknown',fetchedAt:'2026-10-05T10:00:00Z'}));assert.equal(profiles[0].checkedAt,'2026-10-05');assert.equal(profiles[0].validTo,'2026-11-04');
 const p=operatorGuaranteeProfiles.find(p=>p.operator==='GTT_TORINO');assert.equal(ruleStillMatches(p,'servizio urbano e suburbano fasce di garanzia 06.00–09.30 e 12.00–15.30'),false);
});
test('a general-strike projection can use the matched local official operator scope, not the national title',()=>{
 const r=record('SCIOPERO GENERALE SETTORI PUBBLICHI E PRIVATI');
 const n={date:r.date,provider:'ATM Milano sciopero nazionale USB',territory:'Milano nazionale',sector:'Trasporto pubblico locale',unions:'USB',timing:'dalle 8:45 alle 15 e dopo le 18 fino al termine del servizio',field_text:'Le nostre linee potrebbero non essere garantite',status:'',source:{url:'https://www.atm.it/it/ViaggiaConNoi/InfoTraffico/Pagine/event.aspx',authority:'official',name:'ATM',excerpt:'Le nostre linee',checked_at:'2026-10-05',content_hash:'h'}};
 const v=applyTimingEvidence(r,[n]);assert.equal(v.timing_evidence.fields.lineScope.value.kind,'ALL_OPERATOR_LINES');assert.equal(applyGuaranteeProfile(v).timing_evidence.fields.guaranteePolicy.operator,'ATM_MILANO');
});
test('aggregation retains GTFS exclusion IDs for a single notice',()=>{
 const c=catalogFromFiles('GTFS_ROMA',files);const v=validateLineRoutes(parseLineScope('intera rete eccetto linea 043',['ATAC_ROMA'],true),c,'2026-10-10','BUS');assert.deepEqual(mergeLineScopes([fact(v)]).excludedRouteIds,['r43']);assert.equal(mergeLineScopes([fact(v)]).routeValidation,'VERIFIED');
});
