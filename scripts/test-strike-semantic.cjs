const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {test}=require('node:test');const {PGlite}=require('@electric-sql/pglite');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {aviationScope,railScope,makeScopeEvidence}=require('../lib/strikeScope.ts');
const {classifyRegionTags}=require('../lib/strikeNormalization.ts');
const {transformRows}=require('../lib/strikeSync.ts');const {aggregateStrikes}=require('../components/utils.ts');
const {parseExternalNotices,applyTimingEvidence}=require('../lib/strikeEnrichment.ts');
const {reviewInput,decodeReview,reconcileSemanticReview,reviewStrikeSemantics,checkJevPrice}=require('../lib/strikeSemanticReview.ts');
const now=new Date('2026-10-05T00:00:00Z');
const raw={date:'12/10/2026',endDate:'13/10/2026',region:'PALERMO',rawRegion:'Sicilia',provider:'PERSONALE SOC. RFI INFRASTRUTTURE SICILIA/DOIT PALERMO',sector:'Ferroviario',province:'Tutte',modalita:'24 ORE: DALLE 21.01 DEL 12/10 ALLE 21.00 DEL 13/10',note:'',rilevanza:'Regionale',unions:'OSR UILT-UIL',sourceKey:'a'.repeat(64),sourceUrl:'https://scioperi.mit.gov.it/mit2/public/scioperi',proclamationDate:'01/10/2026'};
const choice=(v,p=.99)=>({type:'choice',choice:v,confidence:p,probabilities:{[v]:p}});
const answer=()=>({answers:{locationRole:choice('ORGANIZATION'),location:choice('CURRENT'),subtype:choice('RAIL_INFRASTRUCTURE'),overexpanded:{type:'noul',noul:.01},omitted:{type:'noul',noul:.01},conflict:{type:'noul',noul:.01},duplicate:{type:'noul',noul:.01}},cost:.00002,ms:1});
test('mixed airport entities are not reduced to the handling operator',()=>{
 assert.equal(aviationScope('PERSONALE SOCC. TOSCANA AEROPORTI, GH TOSCANA E CONSULTA','FIRENZE'),'MIXED_AIRPORT_SERVICES');
 assert.equal(aviationScope('PERSONALE GH TOSCANA','FIRENZE'),'GROUND_HANDLING');
});
test('regional office names retain administrative scope, explicit local province stays local',()=>{
 const input={regionText:'Sicilia',provinceText:'Tutte',providerText:raw.provider,sectorText:'Ferroviario',relevanceText:'Regionale'};
 assert.deepEqual(classifyRegionTags(input).sort(),['CATANIA','MESSINA','PALERMO']);
 assert.deepEqual(classifyRegionTags({...input,provinceText:'Palermo',relevanceText:'Provinciale'}),['PALERMO']);
 assert.deepEqual(classifyRegionTags({...input,regionText:'Italia',relevanceText:'Nazionale'}),['NATIONAL']);
});
test('rail subjects remain distinct in passenger cards and have no invented train guarantees',async()=>{
 const security=(await transformRows([{...raw,date:'08/10/2026',endDate:'08/10/2026',provider:'PERSONALE SOC. FS SECURITY REGIONE SICILIA',modalita:'24 ORE'}]))[0];
 const operation=(await transformRows([{...raw,date:'08/10/2026',endDate:'08/10/2026',provider:'PERSONALE TRENITALIA',modalita:'24 ORE',sourceKey:'b'.repeat(64)}]))[0];
 assert.equal(railScope(raw.provider),'RAIL_INFRASTRUCTURE');assert.equal(security.timing_evidence.fields.scopeType.value,'RAIL_SECURITY');
 assert.equal(security.timing_evidence.fields.passengerImpact.value,'INDIRECT_OR_UNCONFIRMED');assert.deepEqual(security.guarantee_windows,[]);
 assert.equal(aggregateStrikes([security,operation],'PALERMO').length,2);
});
test('ATM yearless current-index notice covers both unions and modes without Como times',async()=>{
 const html=fs.readFileSync(__dirname+'/fixtures/atm-2026-10-09.html','utf8'),url='https://www.atm.it/it/ViaggiaConNoi/InfoTraffico/Pagine/Sciopero9ottobre.aspx';
 assert.equal(parseExternalNotices(html,url,['2026-10-09'],now.toISOString()).length,0);
 const notices=parseExternalNotices(html,url,['2026-10-09'],now.toISOString(),true);
 assert.equal(parseExternalNotices(html,url,['2027-10-09'],now.toISOString(),true).length,0);
 for(const unions of ['AL-COBAS','CONFIAL TRASPORTI']) for(const category of ['BUS','SUBWAY']){
  const r=(await transformRows([{...raw,date:'09/10/2026',endDate:'09/10/2026',region:'MILANO',rawRegion:'Lombardia',provider:'PERSONALE SOCC. GRUPPO ATM DI MILANO',sector:'Trasporto pubblico locale',modalita:"24 ORE: VARIE MODALITA'",unions}])).find(r=>r.category===category);
  const enriched=applyTimingEvidence(r,notices);
  assert.deepEqual(enriched.timing_evidence.windows,[{start:'08:45',end:'15:00',end_kind:'clock'},{start:'18:00',end:null,end_kind:'end_of_service'}]);
  assert.equal(enriched.timing_evidence.fields.timing.source,'OPERATOR_OFFICIAL');assert.deepEqual(enriched.guarantee_windows,[]);
 }
});
test('semantic hash changes for actual input or source content, not last_seen/fetch time',async()=>{
 const records=await transformRows([raw]);const a=reviewInput(raw,records);
 assert.equal(a.hash,reviewInput(raw,records.map(r=>({...r,last_seen_at:'tomorrow'}))).hash);
 assert.notEqual(a.hash,reviewInput({...raw,note:'changed'},records).hash);
 assert.ok(a.bytes<12000&&a.reserve<=1000);
});
test('strict decision validation rejects invented enums, missing verdicts and malformed probabilities',async()=>{
 const input=reviewInput(raw,await transformRows([raw]));const a=answer();a.answers.subtype=choice('ALIEN_SERVICE');assert.throws(()=>decodeReview(a,input,now));
 const b=answer();b.answers.overexpanded.noul='yes';assert.throws(()=>decodeReview(b,input,now));
 const c=answer();delete c.answers.conflict;assert.throws(()=>decodeReview(c,input,now));
});
test('Jev cannot invent hours/airports or override official subtype; disagreement stays flagged',async()=>{
 const records=await transformRows([raw]);const review=decodeReview(answer(),reviewInput(raw,records),now);review.transportSubtype='RAIL_SECURITY';
 const out=reconcileSemanticReview(records,raw,review);assert.deepEqual(out[0].strike_windows,records[0].strike_windows);assert.equal(out[0].timing_evidence.fields.scopeType.value,'RAIL_INFRASTRUCTURE');assert.equal(out[0].timing_evidence.semantic_review.disposition,'FLAGGED');
 const airport={...raw,sector:'Aereo',provider:'SICURITALIA IVRI MARCO POLO VENEZIA',region:'VENEZIA'};const a=await transformRows([airport]);review.locationChoice='ADMIN_REGION';
 assert.equal(reconcileSemanticReview(a,airport,review)[0].region,'VENEZIA');
});
test('regional correction chooses only existing official candidates and retains every date window',async()=>{
 const records=await transformRows([raw]);const review=decodeReview(answer(),reviewInput(raw,records),now);review.locationChoice='ADMIN_REGION';
 const out=reconcileSemanticReview(records,raw,review);assert.equal(out.length,6);assert.deepEqual([...new Set(out.map(r=>r.region))].sort(),['CATANIA','MESSINA','PALERMO']);
 for(const date of ['2026-10-12','2026-10-13']) for(const r of out.filter(r=>r.date===date)) assert.deepEqual(r.strike_windows,records.find(r=>r.date===date).strike_windows);
});
test('price guard disables paid calls for missing catalogue or higher input/output/request prices',async()=>{
 const fake=p=>async()=>({ok:true,json:async()=>({data:{endpoints:[{pricing:p}]}})});
 await checkJevPrice(fake({prompt:'0.000000042',completion:'0'}));
 await assert.rejects(checkJevPrice(fake({prompt:null,completion:'0'})));
 await assert.rejects(checkJevPrice(fake({prompt:'0.000001',completion:'0'})));
 await assert.rejects(checkJevPrice(fake({prompt:'0.000000042',completion:'1'})));
});
test('one changed announcement across dates/cities is one paid review, cache is reused',async()=>{
 const records=await transformRows([raw]);const cache=new Map();let paid=0;
 const db={rpc:async(name,args)=>{if(name.startsWith('reserve'))return {data:[cache.has(args.review_hash)?{decision:'cached',cached_result:cache.get(args.review_hash)}:{decision:'call',lease:'fake'}]};cache.set(args.review_hash,args.review_result);return {data:true};}};
 const deps={enabled:true,price:async()=>{},decide:async()=>{paid++;const result=answer();result.answers.location=choice('UNKNOWN',.6);return result;}};
 const a=await reviewStrikeSemantics(records,[raw,raw],db,[],now,deps),b=await reviewStrikeSemantics(records,[raw],db,[],now,deps);
 assert.equal(a.stats.called,1);assert.equal(b.stats.cached,1);assert.equal(paid,1);
 assert.equal([...cache.values()][0].disposition,'INCONCLUSIVE');
 assert.equal(b.records[0].timing_evidence.semantic_review.disposition,'INCONCLUSIVE');
});
test('reviewing an active cross-midnight source preserves its earlier dated segment',async()=>{
 const records=await transformRows([raw]);const db={rpc:async name=>({data:name.startsWith('reserve')?[{decision:'call',lease:'x'}]:true})};
 const out=await reviewStrikeSemantics(records,[raw],db,[],new Date('2026-10-13T09:00:00Z'),{enabled:true,price:async()=>{},decide:async()=>answer()});
 assert.equal(out.records.length,records.length);assert.ok(out.records.some(r=>r.date==='2026-10-12'));
});
test('API failures and budget denial keep deterministic output without paid retries',async()=>{
 const records=await transformRows([raw]);let paid=0;const deps={enabled:true,price:async()=>{},decide:async()=>{paid++;throw Error('timeout');}};
 const denied={rpc:async()=>({data:[{decision:'budget'}]})};const out=await reviewStrikeSemantics(records,[raw],denied,[],now,deps);assert.equal(paid,0);assert.equal(out.stats.budgetExhausted,true);assert.deepEqual(out.records,records);
 const failure={rpc:async(name)=>({data:name.startsWith('reserve')?[{decision:'call',lease:'x'}]:true})};const failed=await reviewStrikeSemantics(records,[raw],failure,[],now,deps);assert.equal(paid,1);assert.equal(failed.stats.failed,1);assert.deepEqual(failed.records,records);
});
test('PostgreSQL budget enforces cap, leases, cache, uncertain costs and role isolation',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(fs.readFileSync(__dirname+'/../supabase/migrations/20261004215721_strike_semantic_review_budget.sql','utf8'));
  const reserve=async(hash,amount)=> (await db.query('select * from reserve_strike_semantic_review($1,$2)',[hash,amount])).rows[0];
  const hash='a'.repeat(64),r=await reserve(hash,1000);assert.equal(r.decision,'call');assert.equal((await reserve(hash,1000)).decision,'busy');
  const finish=(token,result,cost)=>db.query('select finish_strike_semantic_review($1,$2,$3,$4) as ok',[hash,token,result===null?null:JSON.stringify(result),cost]);
  assert.equal((await finish(r.lease,{ok:true},20)).rows[0].ok,true);assert.equal((await finish(r.lease,{ok:true},0)).rows[0].ok,false);assert.equal((await reserve(hash,1000)).decision,'cached');
  assert.equal((await db.query('select charged_micro_usd as n from ai_monthly_budget')).rows[0].n,20);
  const unknown=await reserve('b'.repeat(64),1000);await db.query('select finish_strike_semantic_review($1,$2,null,null)',['b'.repeat(64),unknown.lease]);
  assert.equal((await reserve('b'.repeat(64),1000)).decision,'backoff');
  for(let i=0;i<220;i++)await reserve(i.toString(16).padStart(64,'0'),1000);
  assert.equal((await reserve('c'.repeat(64),1000)).decision,'budget');assert.ok((await db.query('select charged_micro_usd as n from ai_monthly_budget')).rows[0].n<=200000);
  await db.exec('set role anon');await assert.rejects(db.query('select * from ai_monthly_budget'));await assert.rejects(db.query('select * from reserve_strike_semantic_review($1,1)',['d'.repeat(64)]));await db.exec('reset role');
 }finally{await db.close();}
});
