/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),{test}=require('node:test');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,esModuleInterop:true,target:9}}).outputText,f);
const {SOURCE_USER_AGENT}=require('../lib/sourceRequest.ts');
const {easyJetNoticeDocuments,EASYJET_NOTICE_URL}=require('../lib/easyJetNotices.ts');
const {parseExternalNotices,applyTimingEvidence,enrichStrikeTiming}=require('../lib/strikeEnrichment.ts');
const {noticeRootsForRecord}=require('../lib/operatorAdapters.ts');
const {makeScopeEvidence}=require('../lib/strikeScope.ts');
const {rotateDiscoveryUrls}=require('../lib/discoveryRotation.ts');
const {attachFollowUpPlans}=require('../lib/recordFollowUp.ts');
const now=new Date('2026-10-06T12:00:00Z');
const row=(provider='PERSONALE ATAF DI FOGGIA',province='FOGGIA',date='2026-10-15')=>{
 const raw={provider,province,date,region:'PUGLIA',relevance:'Locale',sector:'Trasporto pubblico locale',unions:'USB',modalita:'24 ORE',sourceStatus:'Programmato',note:''};
 return {date,provider,region:'UNKNOWN',category:'BUS',status:'CONFIRMED',strike_windows:[{start:'00:00',end:'24:00'}],guarantee_windows:[],affected_lines:[],raw_payload:raw,source_key:provider,source_url:'https://scioperi.mit.gov.it/mit2/public/scioperi',timing_evidence:{windows:[],sources:[],conflicts:[],fields:makeScopeEvidence(raw,'UNKNOWN','BUS',[{start:'00:00',end:'24:00'}],[])}};
};
const card=(id,title,description,date='2026-10-05T00:00:00Z')=>({id,fields:{Title:{value:title},Description:{value:description},Date:{value:date},AnalyticsCardTitle:{value:'Italy strike 16 October 2026 from 01:00 to 03:00'}}});
const page=cards=>'<script type="application/json" id="__JSS_STATE__">'+JSON.stringify({sitecore:{context:{pageEditing:false,pageState:'normal',language:'en',itemPath:'/en/help-centre/before-you-fly/latest-travel-information'},route:{placeholders:{'jss-main':[{componentName:'Layout100Percent',placeholders:{content:[{componentName:'PaginatedCardList',fields:{Cards:cards}}]}}]}}}})+'</script>';
test('all public adapters use a truthful URL-free identity, including diagnostics and TLS adapters',()=>{
 assert.equal(SOURCE_USER_AGENT,'ItalyStrike/1.0');for(const file of ['lib/strikeEnrichment.ts','lib/cgsseTls.ts','lib/toscanaAirportNotices.ts','app/api/admin/source-access/route.ts']){const s=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8');assert.match(s,/User-Agent['"]?:\s*SOURCE_USER_AGENT/);assert.ok(!s.includes('(+https://'));}
});
test('easyJet reads only actual dated public cards, isolates events and ignores analytics or old notices',()=>{
 const html=page([card('a','Strike in Italy on 16 October 2026','<p>easyJet cabin crew national strike in Italy from 09:00 to 17:00.</p>'),card('b','Strike in Italy on 17 October 2026','<p>easyJet national strike from 10:00 to 12:00.</p>'),card('c','New baggage rules','<p>Travel normally.</p>'),card('d','Strike in Italy on 16 October 2025','<p>easyJet national strike from 01:00 to 03:00.</p>','2025-10-05T00:00:00Z')]);
 assert.equal(easyJetNoticeDocuments(html,EASYJET_NOTICE_URL).length,4);
 const notices=parseExternalNotices(html,EASYJET_NOTICE_URL,['2026-10-16']);assert.equal(notices.length,1);assert.equal(notices[0].date,'2026-10-16');assert.ok(!notices[0].timing.includes('01:00'));
 const r={...row('PERSONALE EASYJET','TUTTE','2026-10-16'),region:'NATIONAL',category:'AIRPORT'};assert.deepEqual(applyTimingEvidence(r,notices).strike_windows,[{start:'09:00',end:'17:00'}]);
 assert.equal(parseExternalNotices(page([card('x','Strike in Italy on 16 October 2026','<p>Protected time bands from 07:00 to 10:00.</p>')]),EASYJET_NOTICE_URL,['2026-10-16']).length,0);
});
test('easyJet refuses wrong page identity and duplicate cards rather than treating incomplete data as fact',()=>{
 const c=card('a','Travel','<p>Public.</p>');assert.throws(()=>easyJetNoticeDocuments(page([c,c]),EASYJET_NOTICE_URL),/duplicate/);assert.throws(()=>easyJetNoticeDocuments(page([c]).replace('pageEditing":false','pageEditing":true'),EASYJET_NOTICE_URL),/identity/);assert.equal(easyJetNoticeDocuments(page([c]),'https://evil.test'),null);
});
test('every candidate gets the first slot over a bounded rotation cycle regardless of input order',()=>{
 const urls=Array.from({length:250},(_,i)=>'https://official.test/'+i),heads=new Set();for(let day=0;day<250;day++){const date=new Date(now.getTime()+day*86400000),a=rotateDiscoveryUrls(urls,date),b=rotateDiscoveryUrls([...urls].reverse(),date);assert.deepEqual(a,b);heads.add(a[0]);}assert.equal(heads.size,250);
});
test('unsupported known cities discover their exact operators and refresh unchanged primary records',async()=>{
 const inputs=[row(),row('PERSONALE ARRIVA UDINE','UDINE','2026-10-20'),row('PERSONALE START ROMAGNA','FORLI','2026-10-29')];for(const r of inputs)assert.ok(noticeRootsForRecord(r).length);
 const original=global.fetch,calls=[];let announced=false;
 global.fetch=async(u,o)=>{u=String(u);calls.push(u);assert.equal(o.headers['User-Agent'],SOURCE_USER_AGENT);return new Response(u==='https://www.ataf.fg.it/?page_id=1083'&&announced?'<a href="/sciopero-15-ottobre-2026/">Sciopero 15 ottobre 2026</a>':u==='https://www.ataf.fg.it/sciopero-15-ottobre-2026/'?'<article><h1>ATAF Foggia sciopero 15 ottobre 2026</h1><p>USB dalle 09:00 alle 13:00.</p></article>':'<main>News</main>',{headers:{'Content-Type':'text/html'}});};
 try{const a=await enrichStrikeTiming(inputs,[],now);assert.equal(a.records[0].timing_evidence.fields.noticeDiscovery.status,'NO_MATCH');announced=true;const b=await enrichStrikeTiming(inputs,[],new Date(now.getTime()+86400000));assert.deepEqual(b.records[0].strike_windows,[{start:'09:00',end:'13:00'}]);assert.equal(b.records[0].region,'UNKNOWN');assert.equal(b.records[0].timing_evidence.fields.locationStatus,'UNSUPPORTED_CITY');assert.equal(b.records[0].timing_evidence.fields.noticeDiscovery.status,'MATCHED');assert.ok(calls.includes('https://www.arrivaudine.it/notice/'));assert.ok(calls.includes('https://www.startromagna.it/infobus/'));
 const unknown={...inputs[0],raw_payload:{...inputs[0].raw_payload,provider:'PERSONALE UNKNOWN'},timing_evidence:{...inputs[0].timing_evidence,fields:{...inputs[0].timing_evidence.fields,locationStatus:'UNKNOWN_LOCATION'}}};assert.deepEqual(applyTimingEvidence(unknown,parseExternalNotices('<article><h1>ATAF Foggia sciopero 15 ottobre 2026</h1><p>USB dalle 09:00 alle 13:00</p></article>','https://www.ataf.fg.it/sciopero-15-ottobre-2026/',['2026-10-15'])).strike_windows,unknown.strike_windows);
 }finally{global.fetch=original;}
});
test('follow-up plans survive optional-stage failure, distant events enter the rolling horizon and cancelled events still reconcile',()=>{
 const near=row(),far=row('PERSONALE ATAF DI FOGGIA','FOGGIA','2027-03-10'),cancelled={...near,status:'CANCELLED'},past={...near,date:'2026-10-01'},unsupported=row('PERSONALE ALTRO OPERATORE','FOGGIA');
 const out=attachFollowUpPlans([near,far,cancelled,past,unsupported],now).map(x=>x.timing_evidence.fields.followUp);assert.deepEqual(out.map(x=>x.notice),['SCHEDULED','WAITING_FOR_HORIZON','PRIMARY_STATUS_ONLY','HISTORICAL','PRIMARY_ONLY']);assert.equal(out[2].primary,'SCHEDULED');assert.equal(out[3].primary,'HISTORICAL');assert.equal(out[1].noticeEligibleFrom,'2026-12-10');assert.equal(attachFollowUpPlans([far],new Date('2026-12-11T12:00:00Z'))[0].timing_evidence.fields.followUp.notice,'SCHEDULED');assert.ok(out.every(x=>x.frequency==='DAILY'));
});
test('known official articles are rechecked after leaving the index; old evidence and unapproved addresses are never copied',async()=>{
 const r=row(),url='https://www.ataf.fg.it/sciopero-15-ottobre-2026/',old={...r,timing_evidence:{...r.timing_evidence,sources:[{url,authority:'official'},{url:'https://evil.test/old',authority:'official'}]}};
 const before=global.fetch,calls=[];let union='USB';global.fetch=async u=>{u=String(u);calls.push(u);return new Response(u===url?`<article><h1>ATAF Foggia sciopero 15 ottobre 2026</h1><p>${union} dalle 10:00 alle 14:00</p></article>`:'<main>No strike links</main>',{headers:{'Content-Type':'text/html'}});};
 try{const a=await enrichStrikeTiming([r],[],now,Date.now()+10000,[old]);assert.ok(calls.includes(url));assert.ok(!calls.includes('https://evil.test/old'));assert.deepEqual(a.records[0].strike_windows,[{start:'10:00',end:'14:00'}]);union='CUB';const b=await enrichStrikeTiming([r],[],now,Date.now()+10000,[old]);assert.deepEqual(b.records[0].strike_windows,r.strike_windows);}finally{global.fetch=before;}
});
test('one malformed public payload does not stop other official notice updates',async()=>{
 const original=global.fetch,r=row(),easy={...row('PERSONALE EASYJET','TUTTE','2026-10-16'),category:'AIRPORT',region:'NATIONAL'},url='https://www.ataf.fg.it/sciopero-15-ottobre-2026/';global.fetch=async u=>new Response(String(u)===EASYJET_NOTICE_URL?'<script type="application/json" id="__JSS_STATE__">{bad</script>':String(u)===url?'<article><h1>ATAF Foggia sciopero 15 ottobre 2026</h1><p>USB dalle 10:00 alle 14:00</p></article>':String(u)==='https://www.ataf.fg.it/?page_id=1083'?`<a href="${url}">Sciopero 15 ottobre 2026</a>`:'<main>News</main>',{headers:{'Content-Type':'text/html'}});
 try{const warnings=[],result=await enrichStrikeTiming([r,easy],warnings,now);assert.deepEqual(result.records[0].strike_windows,[{start:'10:00',end:'14:00'}]);assert.ok(warnings.some(w=>w.includes('content could not be verified')));assert.ok(result.records[1].timing_evidence.fields.noticeDiscovery.sources.some(s=>s.url===EASYJET_NOTICE_URL&&s.status==='FAILED'));}finally{global.fetch=original;}
});
test('a multi-basin unsupported event cannot borrow one basin timing as the whole event',()=>{
 const r=row('PERSONALE START ROMAGNA DEI BACINI DI FORLI CESENA RAVENNA E RIMINI','FORLI CESENA','2026-10-15'),url='https://www.startromagna.it/sciopero-15-ottobre-2026/';
 const notes=parseExternalNotices('<article><h1>Start Romagna Rimini sciopero 15 ottobre 2026</h1><p>USB dalle 10:00 alle 14:00</p></article>',url,[r.date]);assert.deepEqual(applyTimingEvidence(r,notes).strike_windows,r.strike_windows);
});
test('Rome authority discovery does not turn office or taxi strikes into ATAC service',()=>{
 const date='2026-12-04',url='https://romamobilita.it/infomobilita/sciopero/',base={...row('PERSONALE ATAC ROMA','ROMA',date),region:'ROMA'};
 const office=parseExternalNotices('<article><h1>Sciopero 4 dicembre 2026</h1><p>USB sportello di Roma Servizi per la Mobilita dalle 09:00 alle 17:00</p></article>',url,[date]);assert.deepEqual(applyTimingEvidence(base,office).strike_windows,base.strike_windows);
 const service=parseExternalNotices('<article><h1>Sciopero ATAC Roma 4 dicembre 2026</h1><p>USB: bus e metro ATAC dalle 09:00 alle 17:00</p></article>',url,[date]);assert.deepEqual(applyTimingEvidence(base,service).strike_windows,[{start:'09:00',end:'17:00'}]);assert.ok(noticeRootsForRecord(base).includes('https://romamobilita.it/infomobilita/'));
});
test('persistent discovery age keeps old deferred sources ahead of newly arriving URLs',()=>{
 const {orderDiscoveryUrls}=require('../lib/discoveryRotation.ts');const old='https://official.test/old',attempted='https://official.test/recent';const history=new Map([[old,{firstDiscoveredAt:'2026-10-01T12:00:00Z'}],[attempted,{firstDiscoveredAt:'2026-09-01T12:00:00Z',lastAttemptedAt:'2026-10-05T12:00:00Z'}]]);const urls=[...Array.from({length:100},(_,i)=>'https://official.test/new-'+i),attempted,old];assert.equal(orderDiscoveryUrls(urls,now,history)[0],old);assert.equal(orderDiscoveryUrls(urls,now,history)[1],attempted);
});
test('two cloud-refusing publishers allow at most one real-runtime compatibility retry; refusals stay failures',async()=>{
 const original=global.fetch,r={...row('PERSONALE BRESCIA TRASPORTI','BRESCIA','2026-10-15'),region:'BRESCIA'},calls=[];global.fetch=async(u,o)=>{u=String(u);calls.push({url:u,agent:o.headers['User-Agent']});return new Response(u==='https://www.bresciamobilita.it/news'?'Denied':'<main>News</main>',{status:u==='https://www.bresciamobilita.it/news'?403:200,headers:{'Content-Type':'text/html'}});};
 try{const warnings=[],result=await enrichStrikeTiming([r],warnings,now);const attempts=calls.filter(c=>c.url==='https://www.bresciamobilita.it/news');assert.equal(attempts.length,2);assert.deepEqual(attempts.map(c=>c.agent),[SOURCE_USER_AGENT,undefined]);assert.equal(result.records[0].timing_evidence.fields.noticeDiscovery.sources.find(s=>s.url==='https://www.bresciamobilita.it/news').status,'FAILED');assert.ok(warnings.some(w=>w.includes('HTTP 403')));}finally{global.fetch=original;}
});
test('runtime compatibility can read a real notice but never adopts a human-verification page',async()=>{
 const original=global.fetch,r={...row('PERSONALE BRESCIA TRASPORTI','BRESCIA','2026-10-15'),region:'BRESCIA'},root='https://www.bresciamobilita.it/news',detail=root+'/sciopero-15-ottobre-2026';let challenge=false;
 global.fetch=async(u,o)=>{u=String(u);const body=u===root?(o.headers['User-Agent']?'Denied':challenge?'Verify you are human':`<a href="${detail}">Sciopero 15 ottobre 2026</a>`):u===detail?'<article><h1>Sciopero Brescia Trasporti 15 ottobre 2026</h1><p>USB dalle 09:00 alle 13:00.</p></article>':'<main>News</main>';return new Response(body,{status:u===root&&o.headers['User-Agent']?403:200,headers:{'Content-Type':'text/html'}});};
 try{const a=await enrichStrikeTiming([r],[],now);assert.deepEqual(a.records[0].strike_windows,[{start:'09:00',end:'13:00'}]);challenge=true;const warnings=[],b=await enrichStrikeTiming([r],warnings,now);assert.deepEqual(b.records[0].strike_windows,r.strike_windows);assert.ok(warnings.some(w=>w.includes('blocked automated access')));}finally{global.fetch=original;}
});
