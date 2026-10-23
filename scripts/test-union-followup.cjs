/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),{test}=require('node:test');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,esModuleInterop:true,target:9}}).outputText,f);
const {parseStrikeHtml,transformRows}=require('../lib/strikeSync.ts');
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
test('later union sector clauses fill only that mode; guarantees, assemblies, exclusions and other years do not donate clocks',async()=>{
 const rows=await records(),html=article('<h2>Trasporto ferroviario:</h2><p>CGIL: astensione dalle 09:01 alle 17:00.</p><h2>Trasporto aereo:</h2><p>Modalita da comunicare.</p><h2>TPL:</h2><p>Modalita territoriali da definire.</p><h2>Manifestazione ferroviaria</h2><p>Concentramento dalle 08:00 alle 10:00.</p>');
 const notices=parseExternalNotices(html,cgUrl,['2026-11-20'],now.toISOString());const train=rows.find(r=>r.category==='TRAIN');
 assert.deepEqual(applyTimingEvidence(train,notices).strike_windows,[{start:'09:01',end:'17:00'}]);assert.equal(applyTimingEvidence(train,notices).timing_evidence.fields.modeApplicability.value,'EXPLICIT_TRANSPORT');
 for(const r of rows.filter(r=>r.category!=='TRAIN'))assert.deepEqual(applyTimingEvidence(r,notices).strike_windows,[]);
 for(const body of ['<h2>Trasporto ferroviario:</h2><p>Servizi garantiti dalle 06:00 alle 09:00.</p>','<h2>Trasporto ferroviario escluso:</h2><p>Dalle 09:01 alle 17:00.</p>','<h2>Appalti ferroviari:</h2><p>Dalle 09:01 alle 17:00.</p>'])assert.deepEqual(applyTimingEvidence(train,parseExternalNotices(article(body),cgUrl,[train.date])).strike_windows,[]);
 assert.deepEqual(parseExternalNotices(html.replaceAll('2026','2025'),cgUrl,['2026-11-20']),[]);
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
 global.fetch=async u=>{u=String(u);calls.push(u);let html='<main>No current links</main>';if(u===cgRoot&&phase===0)html=`<a href="${cgUrl}">CGIL sciopero 20 novembre 2026</a>`;if(u===cgUrl)html=phase===0?live:article('<h2>Trasporto ferroviario:</h2><p>CGIL dalle 09:01 alle 17:00.</p>');return new Response(html,{headers:{'Content-Type':'text/html'}});};
 try{const a=await enrichStrikeTiming([train],[],now);assert.deepEqual(a.records[0].strike_windows,[]);assert.ok(a.records[0].timing_evidence.fields.noticeDiscovery.sources.some(s=>s.url===cgUrl&&s.status==='FETCHED'));phase=1;calls.length=0;const b=await enrichStrikeTiming([train],[],now,Date.now()+10000,a.records);assert.ok(calls.includes(cgUrl));assert.deepEqual(b.records[0].strike_windows,[{start:'09:01',end:'17:00'}]);
 phase=0;const attachment='https://www.cgil.it/download/settore-trasporti';global.fetch=async u=>new Response(String(u)===cgRoot?`<a href="${cgUrl}">Sciopero 20 novembre 2026</a>`:String(u)===cgUrl?article(`<a href="${attachment}">Allegato modalita trasporti</a><a href="https://evil.test/file.pdf">allegato</a>`):String(u)===attachment?article('<h2>Trasporto ferroviario:</h2><p>CGIL dalle 10:00 alle 14:00.</p>'):'<main>News</main>',{headers:{'Content-Type':'text/html'}});const c=await enrichStrikeTiming([train],[],now);assert.deepEqual(c.records[0].strike_windows,[{start:'10:00',end:'14:00'}]);assert.ok(c.records[0].timing_evidence.fields.noticeDiscovery.sources.some(s=>s.url===attachment));
 }finally{global.fetch=before;}
});
