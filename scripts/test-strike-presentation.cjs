const fs=require('node:fs');
const ts=require('typescript');
const assert=require('node:assert/strict');
const {test}=require('node:test');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {CITIES}=require('../lib/cities.ts');
const {CITY_STRIKE_SOURCES,sourceCities,assertCitySourceCoverage}=require('../lib/strikeSources.ts');
const {parseExternalNotices,parseExternalWindows,matchesNotice,applyTimingEvidence,enrichStrikeTiming}=require('../lib/strikeEnrichment.ts');
const {aggregateStrikes,filterStrikesForRegion}=require('../components/utils.ts');
const {strikeTimeline,windowsDuration,intersectGuarantees}=require('../lib/strikePresentation.ts');
const {normalizeProviderList}=require('../lib/strikeNormalization.ts');
const {officialStrikeRecord,withOfficialRecord}=require('../lib/officialStrikeRecord.ts');
const row=(over={})=>({date:'2030-03-01',region:'MILANO',category:'BUS',provider:'ATM',status:'UNCERTAIN',strike_windows:[],guarantee_windows:[],affected_lines:['全部线路'],source_key:'mit-a',raw_payload:{provider:'ATM Milano',unions:'USB LAVORO PRIVATO',modalita:'24 ORE: VARIE MODALITA',sector:'Trasporto pubblico locale',sourceStatus:'Programmato'},...over});
const article=(city,hours='dalle 9:15 alle 13:45')=>`<main><article><h1>Sciopero ${city} 1 marzo 2030</h1><p>USB Lavoro Privato ha proclamato uno sciopero.</p><p>Il servizio sara interrotto ${hours}.</p></article></main>`;
const clock=(start,end)=>({start,end,end_kind:'clock'});
test('media links do not downgrade the adopted official timing, while source history remains',()=>{
 const make=(key,windows,confidence,sources=[])=>row({source_key:key,timing_evidence:{windows,confidence,sources,conflicts:[],unions:'USB'}});
 const media={url:'https://sciopero.net/example',authority:'reported'};
 const hours=[clock('08:45','15:00')];
 const cards=aggregateStrikes([make('official',hours,'official',[media]),make('reported-copy',hours,'reported',[media])],'MILANO');
 assert.equal(cards[0].timing_evidence.confidence,'official');assert.equal(cards[0].strike_events.length,2);assert.deepEqual(cards[0].timing_evidence.sources,[media]);
 const different=aggregateStrikes([make('official',hours,'official'),make('other',[clock('18:00','20:00')],'reported',[media])],'MILANO')[0];
 assert.equal(different.timing_evidence.confidence,'reported');assert.equal(different.strike_events.length,2);
});
test('official scope/guarantee quotes cannot turn reported hours into official; conflict wins',()=>{
 const hours=[clock('08:45','15:00')],source={url:'https://www.atm.it/charter',authority:'official'};
 const fields={timing:{value:hours,source:'REPORTED',confidence:'MEDIUM'},location:{value:'MILANO',source:'MIT',confidence:'HIGH'}};
 const reported=row({timing_evidence:{windows:hours,confidence:'official',sources:[source],fields,conflicts:[],unions:'USB'}});
 assert.equal(aggregateStrikes([reported],'MILANO')[0].timing_evidence.confidence,'reported');
 const corroborated={...reported,timing_evidence:{...reported.timing_evidence,confidence:'corroborated'}};
 assert.equal(aggregateStrikes([corroborated],'MILANO')[0].timing_evidence.confidence,'corroborated');
 const conflict={...reported,timing_evidence:{...reported.timing_evidence,confidence:'conflict'}};
 assert.equal(aggregateStrikes([conflict],'MILANO')[0].timing_evidence.confidence,'conflict');
 const active={...reported,source_key:'official',timing_evidence:{windows:hours,confidence:'official',sources:[],conflicts:[],unions:'USB'}};
 assert.equal(aggregateStrikes([active,{...conflict,status:'CANCELLED'}],'MILANO')[0].timing_evidence.confidence,'official');
});
test('unknown reported sibling never acquires official confirmation from a timed event',()=>{
 const official=row({source_key:'a',timing_evidence:{windows:[clock('08:45','15:00')],confidence:'official',sources:[],conflicts:[]}});
 const pending=row({source_key:'b',timing_evidence:{windows:[],confidence:'reported',sources:[],conflicts:[]}});
 const card=aggregateStrikes([official,pending],'MILANO')[0];assert.equal(card.timing_evidence.confidence,'reported');assert.equal(card.has_unknown_timing,true);
});
test('official register is trimmed, preserves administrative Tutte and remains separate from operator hours',()=>{
 const raw={provider:'PERSONALE ATM MILANO',sector:'Trasporto pubblico locale',unions:'USB',rawRegion:'Lombardia',province:'Tutte',rilevanza:'Regionale',modalita:'24 ORE: VARIE MODALITA',proclamationDate:'2/10/2026',sourceUrl:'https://scioperi.mit.gov.it/mit2/public/scioperi',privateField:'DO_NOT_EXPOSE'};
 const record=withOfficialRecord({...row(),raw_payload:raw,timing_evidence:{windows:[clock('08:45','15:00')],confidence:'official',sources:[],conflicts:[]}});
 assert.equal(record.official_record.proclaimed,'2026-10-02');assert.equal(record.official_record.area,'Lombardia · Tutte');assert.deepEqual(record.official_record.windows,[]);assert.equal(record.official_record.mode,raw.modalita);
 assert.ok(!JSON.stringify(record).includes('DO_NOT_EXPOSE'));assert.ok(!('raw_payload' in record));
 const card=aggregateStrikes([record],'MILANO')[0];assert.equal(card.official_record,undefined);assert.deepEqual(card.strike_events[0].official_record,record.official_record);assert.deepEqual(card.timing_evidence.windows,[clock('08:45','15:00')]);
});
test('official record uses category-specific original clocks and validates dates and links',()=>{
 const raw={provider:'SCIOPERO GENERALE',sector:'Plurisettoriale',modalita:'FERROVIARIO: DALLE 09.01 ALLE 17.00 / APPALTI FERROVIARI: SECONDO MEZZO TURNO / TPL: 4 ORE VARIE MODALITA',proclamationDate:'31/02/2026',sourceUrl:'https://user:password@scioperi.mit.gov.it/mit2/public/scioperi'};
 const train=officialStrikeRecord(raw,'TRAIN','2026-10-14');assert.deepEqual(train.windows,[clock('09:01','17:00')]);assert.equal(train.proclaimed,null);assert.equal(train.url,'https://scioperi.mit.gov.it/mit2/public/scioperi');
 assert.deepEqual(officialStrikeRecord(raw,'BUS','2026-10-14').windows,[]);
 assert.equal(officialStrikeRecord({...raw,proclamationDate:'29/02/2028'},'TRAIN','2028-10-14').proclaimed,'2028-02-29');
 for(const p of [null,[],false,'bad',{}])assert.equal(officialStrikeRecord(p,'TRAIN','2026-10-14'),null);
});
test('every listed city has official discovery sources, including shared and homonymous operators',()=>{
 assert.equal(CITIES.length,20);assertCitySourceCoverage();
 assert.deepEqual(sourceCities('https://www.fsbusitalia.it/it/veneto/avviso.html'),['PADOVA']);
 assert.deepEqual(sourceCities('https://www.fsbusitalia.it/it/umbria/avviso.html'),['PERUGIA']);
 assert.deepEqual(sourceCities('https://www.atmmessinaspa.it/notice'),['MESSINA']);
 assert.deepEqual(normalizeProviderList('ATM Messina人员'),['ATM Messina人员']);
});
for(const city of CITIES) test(`${city.tag}: discovers a future operator article over 31 days away, preserving identity`,async()=>{
 const source=CITY_STRIKE_SOURCES.find(s=>s.cities.includes(city.tag));
 const base=source.urls[0],target=new URL('sciopero-test',base).href;
 const record=row({region:city.tag,provider:source.name,raw_payload:{...row().raw_payload,provider:source.aliases[0]+' '+city.slug}});
 const original=global.fetch;
 global.fetch=async url=>new Response(String(url)===target?article(city.slug):String(url)===base?`<main><a href="${target}">Sciopero ${city.slug}</a></main>`:'<main><h1>News</h1></main>',{headers:{'content-type':'text/html'}});
 try{const result=await enrichStrikeTiming([record],[],new Date('2029-12-29T12:00:00Z'));assert.equal(result.records[0].display_time,'09:15 - 13:45');assert.equal(result.records[0].source_key,'mit-a');assert.equal(result.records[0].timing_evidence.confidence,'official');assert.equal(result.records[0].timing_evidence.sources[0].url,target);}finally{global.fetch=original;}
});
test('shared Tuscany operator never donates a Pisa-only announcement to Florence',()=>{
 const notices=parseExternalNotices(article('Pisa'),'https://www.at-bus.it/it/news/sciopero',['2030-03-01']);
 assert.equal(matchesNotice(notices[0],row({region:'FIRENZE',raw_payload:{...row().raw_payload,provider:'Autolinee Toscane Firenze'}})),false);
 assert.equal(matchesNotice(notices[0],row({region:'PISA',raw_payload:{...row().raw_payload,provider:'Autolinee Toscane Pisa'}})),true);
});
test('a Milan ATM article cannot enrich homonymous Messina ATM',()=>{
 const notices=parseExternalNotices(article('Milano'),'https://www.atm.it/it/sciopero',['2030-03-01']);
 assert.equal(matchesNotice(notices[0],row({region:'MESSINA',raw_payload:{...row().raw_payload,provider:'ATM Messina'}})),false);
});
test('separate paragraphs of one official notice combine, while guarantee clauses stay separate',()=>{
 const html=article('Milano').replace('</article>','<p>Il servizio sara interrotto dalle 18:00 a fine servizio.</p><h2>Fasce di garanzia</h2><p>Servizio garantito dalle 6:00 alle 9:00.</p></article>');
 const notices=parseExternalNotices(html,'https://www.atm.it/it/sciopero',['2030-03-01']);
 const result=applyTimingEvidence(row(),notices);
 assert.deepEqual(result.timing_evidence.windows,[clock('09:15','13:45'),{start:'18:00',end:null,end_kind:'end_of_service'}]);
 assert.equal(result.timing_evidence.confidence,'official');assert.ok(result.guarantee_windows.some(w=>w.start==='06:00'&&w.end==='09:00'));
});
test('operator-wide official notices match the day; unnamed media notices do not',()=>{
 const html=article('Milano').replace('USB Lavoro Privato','Il sindacato');
 const n=parseExternalNotices(html,'https://www.atm.it/it/sciopero',['2030-03-01']);assert.equal(matchesNotice(n[0],row()),true);
 const reported=parseExternalNotices(html,'https://www.virgilio.it/notizie/test',['2030-03-01']);assert.equal(matchesNotice(reported[0],row()),false);
});
test('old yearless announcements cannot match a later annual event',()=>{
 const html='<meta property="article:published_time" content="2025-03-01T12:00:00Z">'+article('Milano').replace('1 marzo 2030','1 marzo');
 assert.equal(parseExternalNotices(html,'https://www.atm.it/it/sciopero',['2030-03-01']).length,0);
});
test('start and end of service stay symbolic rather than inventing clocks',()=>{
 const w=parseExternalWindows("da inizio servizio alle 6:00, dalle 9:00 alle 16:30 e dalle 19:30 a fine servizio",row());
 assert.deepEqual(w,[{start:null,end:'06:00',end_kind:'clock'},clock('09:00','16:30'),{start:'19:30',end:null,end_kind:'end_of_service'}]);
 assert.equal(windowsDuration(w),'分时段（按运营时间）');
 const segments=strikeTimeline(w);assert.equal(segments[0].colorType,'open');assert.equal(segments.at(-1).colorType,'open');assert.ok(Math.abs(segments.reduce((n,s)=>n+s.widthPct,0)-100)<1e-8);
});
test('explicit dated overnight windows split at the right day',()=>{
 const text='dalle 21.00 del 1/3/2030 alle 6.00 del 2/3/2030';
 assert.deepEqual(parseExternalWindows(text,row()),[clock('21:00','24:00')]);
 assert.deepEqual(parseExternalWindows(text,row({date:'2030-03-02'})),[clock('00:00','06:00')]);
 assert.deepEqual(parseExternalWindows(text,row({date:'2030-03-03'})),[]);
});
test('metro and bus clauses without colons retain their separate schedules',()=>{
 const text='metropolitana dalle 8 alle 15; autobus dalle 9 alle 13';
 assert.deepEqual(parseExternalWindows(text,row({category:'SUBWAY'})),[clock('08:00','15:00')]);
 assert.deepEqual(parseExternalWindows(text,row()),[clock('09:00','13:00')]);
});
test('one day/type card preserves active, cancelled and unknown notices and excludes cancelled timing',()=>{
 const a=row({status:'CONFIRMED',strike_windows:[{start:'09:00',end:'12:00'}]});
 const b=row({source_key:'mit-b',status:'CANCELLED',strike_windows:[{start:'00:00',end:'24:00'}]});
 const c=row({source_key:'mit-c'});
 const cards=aggregateStrikes([a,b,c],'MILANO');assert.equal(cards.length,1);assert.equal(cards[0].strike_events.length,3);assert.equal(cards[0].has_unknown_timing,true);assert.deepEqual(cards[0].strike_windows,[{start:'09:00',end:'12:00'}]);
 assert.equal(aggregateStrikes([c,b,a],'MILANO')[0].id,cards[0].id);
 assert.deepEqual(aggregateStrikes(cards,'MILANO')[0].strike_events,cards[0].strike_events);
 assert.ok(strikeTimeline(cards[0].timing_evidence.windows,[],false,true).some(s=>s.colorType==='unknown'));
});
test('all cancelled notices keep cancellation and a neutral bar',()=>{
 const cards=aggregateStrikes([row({status:'CANCELLED',strike_windows:[{start:'09:00',end:'12:00'}]})],'MILANO');assert.equal(cards[0].status,'CANCELLED');assert.ok(strikeTimeline(cards[0].timing_evidence.windows,[],true).every(s=>s.colorType==='grey'));
});
test('local evidence replaces only its national parent, not unrelated announcements',()=>{
 const base=row({region:'NATIONAL'}),local=row({strike_windows:[{start:'09:00',end:'12:00'}]}),other=row({region:'NATIONAL',source_key:'mit-b'});
 const scoped=filterStrikesForRegion([base,local,other],'MILANO');assert.equal(scoped.length,2);assert.equal(scoped.find(s=>s.source_key==='mit-a').region,'MILANO');
 assert.equal(filterStrikesForRegion([base,local,other],'ROMA').length,2);
});
test('aggregate guarantees are only the intersection across all active notices',()=>{
 const make=w=>({windows:[clock('09:00','12:00')],guarantee_windows:w});
 assert.deepEqual(intersectGuarantees([make([{start:'06:00',end:'09:00'}]),make([{start:'07:00',end:'10:00'}])]),[{start:'07:00',end:'09:00'}]);assert.deepEqual(intersectGuarantees([make([{start:'06:00',end:'09:00'}]),make([])]),[]);
});
test('national general strike gets independent city timings without exporting one city to others',async()=>{
 const original=global.fetch;
 const templates=new Map([['MILANO','9:00'],['PADOVA','10:00'],['PERUGIA','11:00']].map(([city,hour])=>{const base=CITY_STRIKE_SOURCES.find(s=>s.cities.includes(city)).urls[0];return[base,{city,hour,url:new URL('sciopero-city',base).href}];}));
 global.fetch=async input=>{const url=String(input),root=templates.get(url),page=[...templates.values()].find(v=>v.url===url);return new Response(root?`<a href="${root.url}">Sciopero</a>`:page?article(page.city,`dalle ${page.hour} alle 13:00`):'<main>News</main>',{headers:{'content-type':'text/html'}});};
 try{
 const result=await enrichStrikeTiming([row({region:'NATIONAL',raw_payload:{...row().raw_payload,provider:'SCIOPERO GENERALE CATEGORIE PUBBLICHE E PRIVATE'}})],[],new Date('2029-12-29T12:00:00Z'));
 assert.equal(result.records.length,5);assert.deepEqual(result.records.find(r=>r.region==='NATIONAL').timing_evidence.windows,[]);
 for(const [city,hour] of [['MILANO','09:00'],['PADOVA','10:00'],['PERUGIA','11:00']]){const card=aggregateStrikes(filterStrikesForRegion(result.records,city),city)[0];assert.equal(card.strike_events.length,1);assert.equal(card.display_time,`${hour} - 13:00`);assert.equal(card.has_unknown_timing,false);}
 assert.equal(result.records.filter(r=>r.category==='SUBWAY').length,1);assert.equal(result.records.find(r=>r.category==='SUBWAY').region,'MILANO');
 assert.equal(aggregateStrikes(filterStrikesForRegion(result.records,'TORINO'),'TORINO')[0].has_unknown_timing,true);
 }finally{global.fetch=original;}
});
function plainPdf(text){
 const stream=`BT /F1 12 Tf 40 700 Td (${text.replace(/[()\\]/g,'\\$&')}) Tj ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n',offsets=[0];for(const [i,obj] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(pdf);
}
test('official PDF attachments under h2 event headings pass through actual text extraction and matching',async()=>{
 const original=global.fetch,base=CITY_STRIKE_SOURCES[0].urls[0],url='https://www.atm.it/it/sciopero-current',pdfUrl='https://www.atm.it/it/avviso.pdf';
 global.fetch=async input=>new Response(String(input)===pdfUrl?plainPdf('Sciopero Milano 1 marzo 2030 USB Lavoro Privato dalle 9:15 alle 13:45.'):String(input)===url?`<main><h1>Notizie</h1><h2>Sciopero Milano 1 marzo 2030</h2><a href="${pdfUrl}">Allegato PDF</a></main>`:String(input)===base?`<a href="${url}">Sciopero</a>`:'<main>News</main>',{headers:{'content-type':String(input)===pdfUrl?'application/pdf':'text/html'}});
 try{const warnings=[],result=await enrichStrikeTiming([row()],warnings,new Date('2029-12-29T12:00:00Z'));assert.equal(result.records[0].display_time,'09:15 - 13:45',warnings.join('\n'));assert.equal(result.records[0].timing_evidence.sources[0].url,pdfUrl);}finally{global.fetch=original;}
});
test('real AMTAB notice distinguishes interruption from slash-separated protected clocks',()=>{
 const url='https://www.amtab.it/it/140-news-chatbot/3528-sciopero-aziendale-di-4-ore-del-personale-amtab-3';
 const notices=parseExternalNotices(fs.readFileSync(require('node:path').join(__dirname,'fixtures/amtab-2026-10-12.html'),'utf8'),url,['2026-10-12']);
 const result=applyTimingEvidence(row({date:'2026-10-12',region:'BARI',provider:'AMTAB',raw_payload:{...row().raw_payload,provider:'PERSONALE AMTAB BARI',unions:'UIL TRASPORTI, FILT CGIL, FIT CISL, UGL AUTOFERRO'}}),notices);
 assert.equal(result.display_time,'08:30 - 12:29');assert.deepEqual(result.guarantee_windows,[{start:'05:30',end:'08:29'},{start:'12:30',end:'15:29'}]);assert.equal(result.timing_evidence.confidence,'official');
});
test('all registered and previously unknown operator names survive presentation normalization',()=>{
 for(const source of CITY_STRIKE_SOURCES) assert.ok(normalizeProviderList(source.name).length,source.name);
 assert.deepEqual(normalizeProviderList('PERSONALE NUOVALINEA SPA'),['NUOVALINEA人员']);
});
test('date navigation spans the entire 90-day backend range in Rome across years and DST',()=>{
 const {upcomingJourneyDays}=require('../lib/strikePresentation.ts');
 for(const now of [new Date('2029-12-29T23:30:00Z'),new Date('2030-03-30T23:30:00Z')]){const days=upcomingJourneyDays(now);assert.equal(days.length,91);assert.equal(new Set(days).size,91);assert.equal(Date.parse(days.at(-1))-Date.parse(days[0]),90*86400000);}
 assert.equal(upcomingJourneyDays(new Date('2029-12-29T23:30:00Z'))[0],'2029-12-30');
});
test('generic official pages do not fetch unrelated PDF documents',async()=>{
 const original=global.fetch;let downloaded=false;
 global.fetch=async input=>{const url=String(input);if(url.endsWith('manual.pdf'))downloaded=true;return new Response(url.includes('trenitalia.com')?'<main><h1>Treni garantiti in caso di sciopero</h1><a href="/manual.pdf">Manuale privacy</a></main>':'<main>News</main>',{headers:{'content-type':'text/html'}});};
 try{await enrichStrikeTiming([row({region:'NATIONAL',category:'TRAIN',provider:'Trenitalia',raw_payload:{...row().raw_payload,provider:'Trenitalia',sector:'Ferroviario'}})],[],new Date('2029-12-29T12:00:00Z'));assert.equal(downloaded,false);}finally{global.fetch=original;}
});
