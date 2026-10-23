/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),{test}=require('node:test');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,esModuleInterop:true,target:9}}).outputText,f);
const {parseStrikeHtml,transformRows,fetchAndFilter}=require('../lib/strikeSync.ts');
test('the Italy relay candidate keeps raw HTML private, uses only fixed sources and has no database credential',async()=>{
 const worker=require('../ops/cloudflare-mit-source/worker.ts').default,original=global.fetch,calls=[];
 global.fetch=async function(u,o){assert.ok(!this || !Object.hasOwn(this,'serviceKey'),'Worker fetch must not be rebound to the dependency object');calls.push(String(u));assert.ok(['https://scioperi.mit.gov.it/mit2/public/scioperi','https://scioperi.mit.gov.it/mit2/public/scioperi/ricerca'].includes(String(u)));assert.equal(o.headers.authorization,undefined);return new Response('<table>Provincia Categoria PRIVATE_UPSTREAM_TEXT</table>',{headers:{'Content-Type':'text/html'}});};
 try{assert.equal((await worker.fetch(new Request('https://relay.test/source',{method:'POST'}),{})).status,503);assert.equal(calls.length,0);assert.equal((await worker.fetch(new Request('https://relay.test/source',{method:'POST'}),{MIT_RELAY_TOKEN:'x'.repeat(32)})).status,401);assert.equal(calls.length,0);const response=await worker.fetch(new Request('https://relay.test/probe?url=https://evil.test',{headers:{authorization:'Bearer '+ 'x'.repeat(32)}}),{MIT_RELAY_TOKEN:'x'.repeat(32)}),result=await response.json();assert.equal(calls.length,2);assert.ok(result.results.every(r=>r.validTable&&/^[a-f0-9]{64}$/.test(r.sha256)));assert.ok(!JSON.stringify(result).includes('PRIVATE_UPSTREAM_TEXT'));assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await worker.fetch(new Request('https://relay.test/other'),{})).status,404);}finally{global.fetch=original;}
});
const {parseExternalNotices,enrichStrikeTiming,applyTimingEvidence}=require('../lib/strikeEnrichment.ts');
const {noticeRootsForRecord}=require('../lib/operatorAdapters.ts');
const {attachFollowUpPlans}=require('../lib/recordFollowUp.ts');
const cgRoot='https://www.cgil.it/strumenti/scioperi-e-vertenze';
const cgUrl=cgRoot+'/cgil-proclamazione-sciopero-generale-per-il-giorno-20-novembre-2026-x0ylgq91';
const now=new Date('2026-10-23T12:00:00Z');
const live=fs.readFileSync(__dirname+'/fixtures/cgil-2026-11-20-proclamation.html','utf8');
async function records(){return transformRows(parseStrikeHtml(fs.readFileSync(__dirname+'/fixtures/mit-2026-10-23-national.html','utf8')).filter(r=>r.unions==='CGIL'));}
const article=body=>'<main><article><h1>CGIL sciopero generale nazionale 20 novembre 2026</h1>'+body+'</article></main>';
test('actual CGIL proclamation confirms a workday, not operational transport clocks',async()=>{
  const rows=await records();assert.match(live,/comunicheranno al pi/);const notices=parseExternalNotices(live,cgUrl,['2026-11-20'],now.toISOString());assert.deepEqual(notices,[]);
  for(const r of rows){assert.equal(applyTimingEvidence(r,notices).status,'UNCERTAIN');assert.deepEqual(applyTimingEvidence(r,notices).strike_windows,[]);assert.ok(noticeRootsForRecord(r).includes(cgRoot));assert.equal(attachFollowUpPlans([r],now)[0].timing_evidence.fields.followUp.notice,'SCHEDULED');}
});
test('primary outage keeps bounded retries and reports the failed official endpoint instead of empty data',async()=>{
 const before=global.fetch,https=require('node:https'),request=https.request;let attempts=0;global.fetch=async()=>{attempts++;throw new TypeError('fetch failed',{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});};https.request=()=>{attempts++;throw new Error('IPv4 also unavailable');};
 try{await assert.rejects(fetchAndFilter(),/MIT \/mit2\/public\/scioperi unavailable after 3 attempts: fetch failed \(UND_ERR_CONNECT_TIMEOUT\)/);assert.equal(attempts,3);}finally{global.fetch=before;https.request=request;}
});
test('cloud connection timeout retries the same official search over IPv4 with unchanged form and verified TLS',async()=>{
 const https=require('node:https'),request=https.request,fetch=global.fetch,{EventEmitter}=require('node:events');let fetches=0,native=0;global.fetch=async()=>{fetches++;throw new TypeError('fetch failed',{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});};https.request=(url,o,callback)=>{native++;assert.equal(url.hostname,'scioperi.mit.gov.it');assert.equal(url.pathname,'/mit2/public/scioperi/ricerca');assert.equal(o.method,'POST');assert.equal(o.family,4);assert.equal(o.rejectUnauthorized,true);assert.equal(o.agent,false);const req=new EventEmitter();req.end=body=>{const form=new URLSearchParams(body);assert.equal(form.get('dataInizio'),'16/10/2026');assert.equal(form.get('stato'),'0');queueMicrotask(()=>{const response=new EventEmitter();response.statusCode=200;response.headers={'content-type':'text/html'};callback(response);response.emit('data',Buffer.from(fs.readFileSync(__dirname+'/fixtures/mit-2026-10-23-national.html','utf8')));response.emit('end');});};return req;};
 try{const rows=await require('../lib/strikeSync.ts').fetchRecentRows('2026-10-23');assert.ok(rows.some(r=>r.unions==='CGIL'));assert.equal(fetches,1);assert.equal(native,1);}finally{global.fetch=fetch;https.request=request;}
});
test('alternate primary transport refuses unknown hosts, paths and request bodies',async()=>{
 const {fetchMitIpv4}=require('../lib/mitTransport.ts');for(const url of ['https://evil.test/mit2/public/scioperi','http://scioperi.mit.gov.it/mit2/public/scioperi','https://scioperi.mit.gov.it/private','https://scioperi.mit.gov.it/mit2/public/scioperi?url=https://evil.test'])await assert.rejects(fetchMitIpv4(url,{},AbortSignal.timeout(100)),/Unapproved/);await assert.rejects(fetchMitIpv4('https://scioperi.mit.gov.it/mit2/public/scioperi/ricerca',{method:'POST',body:'unvalidated'},AbortSignal.timeout(100)),/Unsupported/);
});
test('independent source transport authenticates before network access and only accepts fixed sources for today',async()=>{
 const {handleMitSource}=require('../supabase/functions/mit-official-source/index.ts');let calls=0;const deps={serviceKey:'private-test-key',fetcher:async()=>{calls++;throw Error('must not fetch');},now:()=>now};
 for(const req of [new Request('https://project.test/source',{method:'POST',body:'{}'}),new Request('https://project.test/source',{method:'POST',headers:{authorization:'Bearer anonymous-test-key'},body:'{}'})])assert.equal((await handleMitSource(req,deps)).status,401);
 for(const body of [{kind:'https://evil.test',date:'2026-10-23'},{kind:'history',date:'2026-10-22'},null])assert.equal((await handleMitSource(new Request('https://project.test/source',{method:'POST',headers:{authorization:'Bearer private-test-key'},body:JSON.stringify(body)}),deps)).status,400);assert.equal(calls,0);
});
test('independent transport preserves official state/date filters, returns integrity proof and keeps errors closed',async()=>{
 const {handleMitSource}=require('../supabase/functions/mit-official-source/index.ts'),{createHash}=require('node:crypto');let failure=false;const html=fs.readFileSync(__dirname+'/fixtures/mit-2026-10-23-national.html','utf8'),deps={serviceKey:'private-test-key',now:()=>now,fetcher:async(url,o)=>{assert.equal(url,'https://scioperi.mit.gov.it/mit2/public/scioperi/ricerca');assert.equal(o.method,'POST');assert.equal(o.redirect,'manual');assert.equal(o.headers.authorization,undefined);assert.equal(o.body.get('stato'),'0');assert.equal(o.body.get('dataInizio'),'16/10/2026');assert.equal(o.body.get('dataFine'),'21/01/2027');if(failure)throw Error('private upstream body');return new Response(html,{headers:{'Content-Type':'text/html'}});}};
 const request=()=>new Request('https://project.test/source',{method:'POST',headers:{authorization:'Bearer private-test-key'},body:JSON.stringify({kind:'history',date:'2026-10-23'})});const r=await handleMitSource(request(),deps),d=await r.json();assert.equal(r.status,200);assert.equal(d.html,html);assert.equal(d.sha256,createHash('sha256').update(html).digest('hex'));assert.equal(d.fetchedAt,now.toISOString());assert.ok(!JSON.stringify(d).includes('private-test-key'));failure=true;const bad=await handleMitSource(request(),deps);assert.equal(bad.status,502);assert.deepEqual(await bad.json(),{error:'Official source unavailable',failure:'Error'});
});
test('health database GET bypasses Next fetch cache while the existing row cache stays explicit',async()=>{
 const before=global.fetch,url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,calls=[];process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key';global.fetch=async(u,o)=>{calls.push(o.cache);return new Response('[]',{headers:{'Content-Type':'application/json'}});};
 try{const {serverDatabase}=require('../lib/strikeQuery.ts');await serverDatabase({fresh:true}).from('strike_sync_runs').select('status');await serverDatabase().from('strikes').select('id');assert.deepEqual(calls,['no-store',undefined]);}finally{global.fetch=before;if(url===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=url;if(key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=key;}
});
test('later union sector clauses fill only that mode; guarantees, assemblies, exclusions and other years do not donate clocks',async()=>{
 const rows=await records(),html=article('<h2>Trasporto ferroviario:</h2><p>CGIL: astensione dalle 09:01 alle 17:00.</p><h2>Trasporto aereo:</h2><p>Modalita da comunicare.</p><h2>TPL:</h2><p>Modalita territoriali da definire.</p><h2>Manifestazione ferroviaria</h2><p>Concentramento dalle 08:00 alle 10:00.</p>');
 const notices=parseExternalNotices(html,cgUrl,['2026-11-20'],now.toISOString());const train=rows.find(r=>r.category==='TRAIN');
 assert.deepEqual(applyTimingEvidence(train,notices).strike_windows,[{start:'09:01',end:'17:00'}]);assert.equal(applyTimingEvidence(train,notices).timing_evidence.fields.modeApplicability.value,'EXPLICIT_TRANSPORT');
 for(const r of rows.filter(r=>r.category!=='TRAIN'))assert.deepEqual(applyTimingEvidence(r,notices).strike_windows,[]);
 for(const body of ['<h2>Trasporto ferroviario:</h2><p>Servizi garantiti dalle 06:00 alle 09:00.</p>','<h2>Trasporto ferroviario escluso:</h2><p>Dalle 09:01 alle 17:00.</p>','<h2>Appalti ferroviari:</h2><p>Dalle 09:01 alle 17:00.</p>'])assert.deepEqual(applyTimingEvidence(train,parseExternalNotices(article(body),cgUrl,[train.date])).strike_windows,[]);
 assert.deepEqual(parseExternalNotices(html.replaceAll('2026','2025'),cgUrl,['2026-11-20']),[]);
 const unrelated=article('<p>La CGIL aveva scioperato il 20 novembre 2026.</p><h2>Trasporto ferroviario:</h2><p>CGIL dalle 10:00 alle 14:00.</p>').replace('20 novembre 2026</h1>','4 dicembre 2026</h1>');assert.deepEqual(applyTimingEvidence(train,parseExternalNotices(unrelated,cgUrl,['2026-11-20','2026-12-04'])).strike_windows,[]);
 const foreign=article('<h2>Trasporto ferroviario 21 novembre 2026:</h2><p>Dalle 10:00 alle 14:00.</p>');assert.deepEqual(applyTimingEvidence(train,parseExternalNotices(foreign,cgUrl,['2026-11-20','2026-11-21'])).strike_windows,[]);
});
test('local union notice never becomes nationwide or another city; publisher alone is not proof of a union',async()=>{
 const rows=await records(),local=article('<h2>TPL ATM Milano:</h2><p>CGIL: bus e metro ATM Milano dalle 08:45 alle 15:00.</p>');const notes=parseExternalNotices(local,cgUrl,['2026-11-20']);
 assert.deepEqual(applyTimingEvidence(rows.find(r=>r.category==='BUS'&&r.region==='NATIONAL'),notes).strike_windows,[]);
 assert.deepEqual(applyTimingEvidence(rows.find(r=>r.category==='SUBWAY'&&r.region==='MILANO'),notes).strike_windows,[{start:'08:45',end:'15:00'}]);
 assert.deepEqual(applyTimingEvidence(rows.find(r=>r.category==='SUBWAY'&&r.region==='ROMA'),notes).strike_windows,[]);
 const foggia=article('<h2>TPL:</h2><p>ATAF Foggia CGIL dalle 09:00 alle 13:00.</p>');assert.deepEqual(applyTimingEvidence(rows.find(r=>r.category==='BUS'),parseExternalNotices(foggia,cgUrl,['2026-11-20'])).strike_windows,[]);
 const wrong=article('<h2>Trasporto ferroviario:</h2><p>SGB sciopero dalle 09:00 alle 13:00.</p>').replace('CGIL sciopero','SGB sciopero');assert.deepEqual(applyTimingEvidence(rows.find(r=>r.category==='TRAIN'),parseExternalNotices(wrong,cgUrl,['2026-11-20'])).strike_windows,[]);
});
test('operator and regulator hours outrank union evidence with lower-priority conflicts retained',async()=>{
 const rows=await records(),train=rows.find(r=>r.category==='TRAIN'),notes=parseExternalNotices(article('<h2>Trasporto ferroviario:</h2><p>CGIL dalle 09:00 alle 17:00.</p>'),cgUrl,[train.date]);
 const mit={...train,status:'CONFIRMED',strike_windows:[{start:'10:00',end:'16:00'}],raw_payload:{...train.raw_payload,modalita:'FERROVIARIO: DALLE 10.00 ALLE 16.00'}};
 const result=applyTimingEvidence(mit,notes);assert.deepEqual(result.strike_windows,mit.strike_windows);assert.equal(result.timing_evidence.conflicts.length,1);
 const op={date:train.date,provider:'Trenitalia',territory:'Nazionale',unions:'CGIL',sector:'Trasporto ferroviario',timing:'Dalle 11:00 alle 15:00',status:'',source:{url:'https://www.trenitalia.com/it/avviso.html',authority:'official',name:'Trenitalia',checked_at:now.toISOString(),content_hash:'test',excerpt:'11-15'}};
 const specific={...mit,provider:'Trenitalia',raw_payload:{...mit.raw_payload,provider:'Trenitalia'}};assert.deepEqual(applyTimingEvidence(specific,[...notes,op]).strike_windows,[{start:'11:00',end:'15:00'}]);
});
test('discovery rereads an initially unresolved union article after it leaves the index and follows same-publisher attachments',async()=>{
 const rows=await records(),train=rows.find(r=>r.category==='TRAIN'),before=global.fetch,calls=[];let phase=0;
 global.fetch=async u=>{u=String(u);calls.push(u);let html='<main>No current links</main>';if(u===cgRoot&&phase===0)html=`<a href="${cgUrl}">CGIL sciopero 20 novembre 2026</a>`;if(u===cgUrl)html=phase<2?live:article('<h2>Trasporto ferroviario:</h2><p>CGIL dalle 09:01 alle 17:00.</p>');return new Response(html,{headers:{'Content-Type':'text/html'}});};
 try{const a=await enrichStrikeTiming([train],[],now);assert.deepEqual(a.records[0].strike_windows,[]);assert.ok(a.records[0].timing_evidence.fields.noticeDiscovery.sources.some(s=>s.url===cgUrl&&s.status==='FETCHED'));phase=1;calls.length=0;const b=await enrichStrikeTiming([train],[],now,Date.now()+10000,a.records);assert.ok(calls.includes(cgUrl));assert.deepEqual(b.records[0].strike_windows,[]);assert.ok(b.records[0].timing_evidence.fields.noticeDiscovery.sources.some(s=>s.url===cgUrl));phase=2;calls.length=0;const updated=await enrichStrikeTiming([train],[],now,Date.now()+10000,b.records);assert.ok(calls.includes(cgUrl));assert.deepEqual(updated.records[0].strike_windows,[{start:'09:01',end:'17:00'}]);
 phase=0;const attachment='https://www.cgil.it/download/settore-trasporti';global.fetch=async u=>new Response(String(u)===cgRoot?`<a href="${cgUrl}">Sciopero 20 novembre 2026</a>`:String(u)===cgUrl?article(`<a href="${attachment}">Allegato modalita trasporti</a><a href="https://evil.test/file.pdf">allegato</a>`):String(u)===attachment?article('<h2>Trasporto ferroviario:</h2><p>CGIL dalle 10:00 alle 14:00.</p>'):'<main>News</main>',{headers:{'Content-Type':'text/html'}});const c=await enrichStrikeTiming([train],[],now);assert.deepEqual(c.records[0].strike_windows,[{start:'10:00',end:'14:00'}]);assert.ok(c.records[0].timing_evidence.fields.noticeDiscovery.sources.some(s=>s.url===attachment));
 }finally{global.fetch=before;}
});
test('Italy relay validates fresh original source receipts and never accepts another form, hash, nonce or old table',async()=>{
 const {fetchMitRelay}=require('../lib/mitRelay.ts'),{handleMitSource}=require('../supabase/functions/mit-official-source/index.ts');
 const original=global.fetch,envUrl=process.env.MIT_RELAY_URL,envToken=process.env.MIT_RELAY_TOKEN;
 process.env.MIT_RELAY_URL='https://italystrike-mit-source.cloudflare-mit-source.workers.dev/source';process.env.MIT_RELAY_TOKEN='z'.repeat(40);
 const html=fs.readFileSync(__dirname+'/fixtures/mit-2026-10-23-national.html','utf8'),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let mutate=d=>d,calls=0;
 global.fetch=async(url,options)=>{calls++;assert.equal(url,process.env.MIT_RELAY_URL);assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');const r=await handleMitSource(new Request(url,options),{serviceKey:process.env.MIT_RELAY_TOKEN,now:()=>new Date(),fetcher:async(_,init)=>{assert.equal(init.redirect,'manual');return new Response(html,{headers:{'Content-Type':'text/html'}});}});return Response.json(mutate(await r.json()));};
 try {
  const result=await fetchMitRelay('https://scioperi.mit.gov.it/mit2/public/scioperi',{},today);assert.equal(result.html,html);
  for(const patch of [{nonce:'bad'},{sha256:'bad'},{fetchedAt:'2020-01-01T00:00:00Z'},{url:'https://evil.test'},{method:'POST'},{date:'2020-01-01'},{form:{stato:'1'}},{version:0}]){mutate=d=>({...d,...patch});await assert.rejects(fetchMitRelay('https://scioperi.mit.gov.it/mit2/public/scioperi',{},today),/Invalid or stale/);}
  const before=calls;await assert.rejects(fetchMitRelay('https://evil.test',{},today),/Unapproved/);await assert.rejects(fetchMitRelay('https://scioperi.mit.gov.it/mit2/public/scioperi/ricerca',{method:'POST',body:new URLSearchParams({stato:'1'})},today),/Unapproved/);assert.equal(calls,before);
  mutate=d=>d;const receipts=[];let direct=0;const relay=global.fetch;
  global.fetch=async(u,o)=>{if(String(u)===process.env.MIT_RELAY_URL)return relay(u,o);direct++;throw new TypeError('fetch failed');};
  const rows=await fetchAndFilter(today,r=>receipts.push(r));assert.ok(rows.length);assert.equal(direct,1);assert.equal(receipts[0].transport,'ITALY_RELAY');assert.ok(!JSON.stringify(receipts).includes('<table'));
  mutate=d=>({...d,html:'<main>Unavailable</main>',sha256:require('node:crypto').createHash('sha256').update('<main>Unavailable</main>').digest('hex')});await assert.rejects(fetchAndFilter(today),/unavailable after 3 attempts/);
 } finally {global.fetch=original;if(envUrl===undefined)delete process.env.MIT_RELAY_URL;else process.env.MIT_RELAY_URL=envUrl;if(envToken===undefined)delete process.env.MIT_RELAY_TOKEN;else process.env.MIT_RELAY_TOKEN=envToken;}
});
test('edge transport rejects upstream redirects without following them and keeps the probe private',async()=>{
 const {handleMitSource}=require('../supabase/functions/mit-official-source/index.ts'),worker=require('../ops/cloudflare-mit-source/worker.ts').default;
 const env={MIT_RELAY_TOKEN:'x'.repeat(32)};assert.equal((await worker.fetch(new Request('https://relay.test/probe'),env)).status,401);
 let calls=0;const response=await handleMitSource(new Request('https://source.test',{method:'POST',headers:{authorization:'Bearer test-key'},body:JSON.stringify({kind:'upcoming',date:'2026-10-23'})}),{serviceKey:'test-key',now:()=>now,fetcher:async(_,o)=>{calls++;assert.equal(o.redirect,'manual');return new Response('',{status:302,headers:{Location:'https://evil.test'}});}});
 assert.equal(response.status,502);assert.equal(calls,1);
});
