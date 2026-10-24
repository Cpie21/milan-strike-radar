/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),{test}=require('node:test');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,esModuleInterop:true,target:9}}).outputText,f);
const {refreshEpoch,DAY_MS}=require('../lib/refreshEpoch.ts');
const {optionalSyncStage}=require('../lib/syncStageBudget.ts');
const {verifyGestAlias,gestEndpointPairs}=require('../lib/gestAliasRefresh.ts');
const {canonicalLineAlias}=require('../lib/canonicalLineAlias.ts');
const {parseStrikeHtml,translateText}=require('../lib/strikeSync.ts');
const {discoverProfileDocument,PROFILE_INDEXES,refreshGuaranteeProfiles}=require('../lib/guaranteeProfileRefresh.ts');
const catalog=require('./fixtures/gest-route-catalog-2026-10-06.json');
const official='La linea T1 Leonardo collega Villa Costanza a Careggi senza interruzioni di linea';
const pairs=['villa costanza|careggi ospedale','careggi ospedale|villa costanza'];
test('daily and weekly cache keys rotate through year boundaries, staying stable within their interval',()=>{
 const a=new Date('2026-12-31T23:59:59Z'),b=new Date('2027-01-01T00:00:00Z');
 assert.notEqual(refreshEpoch(a,DAY_MS),refreshEpoch(b,DAY_MS));assert.equal(refreshEpoch(b,DAY_MS),refreshEpoch(new Date('2027-01-01T05:10:00Z'),DAY_MS));
 assert.notEqual(refreshEpoch(a,7*DAY_MS),refreshEpoch(new Date(a.getTime()+7*DAY_MS),7*DAY_MS));assert.throws(()=>refreshEpoch(b,0));assert.throws(()=>refreshEpoch(new Date('bad'),DAY_MS));
});
test('renewed GEST identity follows future publisher dates and changed route IDs without a fixed-year ceiling',()=>{
 const c={...catalog,checkedAt:new Date().toISOString(),validFrom:'2027-01-01',validTo:'2027-06-30',routes:catalog.routes.map(r=>({...r,id:'next-'+r.id}))};
 const proof=verifyGestAlias(c,official,pairs);assert.equal(proof.status,'VERIFIED');
 const route=c.routes.find(r=>r.name==='T1.3'),context={...c,operator:'GEST_FIRENZE',date:'2027-03-10',category:'BUS',aliasVerification:proof};
 assert.equal(canonicalLineAlias(route,context).routeId,route.id);
 for(const altered of [{status:'UNAVAILABLE'},{checkedAt:'2025-01-01'},{validTo:'2028-01-01'},{source:'https://other.test'}])assert.equal(canonicalLineAlias(route,{...context,aliasVerification:{...proof,...altered}}),undefined);
});
test('GEST renewal stops when the official identity or trip endpoints change',()=>{
 for(const [text,ends] of [[official.replace('T1','T2'),pairs],[official,[...pairs,'new terminus|villa costanza']],[official,[pairs[0]]],[official.replace('senza interruzioni di linea','interrotta'),pairs]])assert.equal(verifyGestAlias(catalog,text,ends).status,'UNVERIFIED');
 const trips=[{route_id:'t',trip_id:'x'}],stops=[{stop_id:'a',stop_name:'Villa Costanza'},{stop_id:'b',stop_name:'Careggi Ospedale'}],times=[{trip_id:'x',stop_id:'b',stop_sequence:'8'},{trip_id:'x',stop_id:'a',stop_sequence:'1'}];
 assert.deepEqual(gestEndpointPairs('t',trips,stops,times),[pairs[0]]);assert.throws(()=>gestEndpointPairs('t',trips,stops,[]));assert.throws(()=>gestEndpointPairs('t',trips,stops,[{...times[0],stop_id:'missing'}]));
});
test('optional stages defer or fail without blocking the fresh official snapshot write',async()=>{
 let calls=0;const warnings=[],fresh=[{source:'fresh MIT'}];
 assert.equal(await optionalSyncStage('secondary',100,100,warnings,async()=>{calls++;},()=>fresh,()=>1),fresh);assert.equal(calls,0);assert.match(warnings[0],/deferred/);
 assert.equal(await optionalSyncStage('secondary',1000,100,warnings,async()=>{throw Error('offline');},()=>fresh,()=>1),fresh);assert.match(warnings[1],/unavailable/);
 assert.deepEqual(await optionalSyncStage('secondary',1000,100,warnings,async()=>['enriched'],()=>fresh,()=>1),['enriched']);assert.equal(warnings.length,2);
});
test('guarantee document discovery follows current editions, excludes old editions and parking guides, rejects ambiguous or unsafe links',()=>{
 const index=PROFILE_INDEXES.ATM_MILANO;
 assert.equal(discoverProfileDocument('ATM_MILANO','<a href="/Carta-Mobilita-ATM-2027.pdf">Scaricate</a><a href="/Carta-Mobilita-ATM-2026.pdf">2026</a>',index),'https://www.atm.it/Carta-Mobilita-ATM-2027.pdf');
 const a=PROFILE_INDEXES.ATAC_ROMA;assert.equal(discoverProfileDocument('ATAC_ROMA','<a href="/tpl2027.pdf">Carta della qualità dei servizi del trasporto pubblico 2027</a><a href="/parking.pdf">Carta dei servizi complementari 2027</a>',a),'https://www.atac.roma.it/tpl2027.pdf');
 const b=PROFILE_INDEXES.ARRIVA_BERGAMO;assert.equal(discoverProfileDocument('ARRIVA_BERGAMO','<a href="https://arriva.it/BERGAMO-Carta-2027.pdf">Carta della mobilità di Bergamo</a><a href="https://arriva.it/LECCO-Carta.pdf">Carta della mobilità di Lecco</a>',b),'https://arriva.it/BERGAMO-Carta-2027.pdf');
 for(const html of ['<a href="https://evil.test/Carta-Mobilita-ATM.pdf">Scaricate</a>','<a href="/Carta-Mobilita-ATM.pdf">Scaricate</a><a href="/Carta-Mobilita-ATM-new.pdf">Scaricate</a>'])assert.throws(()=>discoverProfileDocument('ATM_MILANO',html,index));
});
test('new official edition without confirming guarantee bands does not renew the old rule',async()=>{
 const warnings=[];const p=await refreshGuaranteeProfiles(new Date('2027-01-10'),warnings,async()=>({text:'new charter, no guaranteed hours stated',source:'https://www.atm.it/2027.pdf',fetchedAt:'2027-01-10T00:00:00Z'}));assert.equal(p.length,0);assert.ok(warnings.some(w=>w.includes('rule changed')));
});
test('malformed official rows fail before reconciliation; unrelated tables cannot fabricate strikes',()=>{
 const h=['Inizio','Fine','Sindacati','Settore','Categoria','Modalità','Rilevanza','Note','Data proclamazione','Regione','Provincia'];const table=c=>'<table><tr>'+h.map(x=>'<th>'+x+'</th>').join('')+'</tr><tr>'+c.map(x=>'<td>'+x+'</td>').join('')+'</tr></table>';
 for(const date of ['bad','31/02/2026'])assert.throws(()=>parseStrikeHtml(table([date,'09/10/2026','U','Aereo','EASYJET','24 ORE','Nazionale','','01/10/2026','Italia','Tutte'])));
 assert.deepEqual(parseStrikeHtml('<table><tr>'+h.map(x=>'<th>'+x+'</th>').join('')+'</tr></table><table><tr><td>09/10/2026</td><td>other</td><td>x</td><td>x</td><td>x</td><td>x</td></tr></table>'),[]);
});
test('translation cannot use a paid endpoint or redirect even with an environment override',async()=>{
 const before=global.fetch,key=process.env.DEEPL_API_KEY,url=process.env.DEEPL_API_URL;let calls=0;
 process.env.DEEPL_API_KEY='dummy';global.fetch=async (u,o)=>{calls++;assert.equal(u,'https://api-free.deepl.com/v2/translate');assert.equal(o.redirect,'error');return Response.json({translations:[{text:'free result'}]});};
 try {for(const u of ['https://api.deepl.com/v2/translate','https://openrouter.ai/api/v1/chat/completions','https://api-free.deepl.com/v2/translate?paid=true']){process.env.DEEPL_API_URL=u;assert.equal(await translateText('original'),'original');}assert.equal(calls,0);delete process.env.DEEPL_API_URL;assert.equal(await translateText('original'),'free result');assert.equal(calls,1);}finally{global.fetch=before;if(key===undefined)delete process.env.DEEPL_API_KEY;else process.env.DEEPL_API_KEY=key;if(url===undefined)delete process.env.DEEPL_API_URL;else process.env.DEEPL_API_URL=url;}
});

test('in-progress synchronization preserves completed warning quality; failures never look clean',()=>{
 const {syncDataQuality}=require('../lib/syncHealth.ts');
 const running={status:'running',warning_count:0,unknown_timing:null},previous={status:'success',warning_count:25,unknown_timing:8};
 assert.equal(syncDataQuality(true,running,previous),'PARTIAL');assert.equal(syncDataQuality(false,running,previous),'UNAVAILABLE');assert.equal(syncDataQuality(true,{...previous,warning_count:0,unknown_timing:0},null),'NO_RECORDED_ISSUES');assert.equal(syncDataQuality(true,running,null),'PARTIAL');
});
