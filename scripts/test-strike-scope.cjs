const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {test}=require('node:test');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {classifyRegionTags,normalizeAirportAffectedLines}=require('../lib/strikeNormalization.ts');
const {aviationScope,extractLineScope,makeScopeEvidence}=require('../lib/strikeScope.ts');
const {transformRows,parseStrikeHtml}=require('../lib/strikeSync.ts');
const {filterStrikesForRegion,aggregateStrikes}=require('../components/utils.ts');
const {parseExternalNotices,applyTimingEvidence,parseExternalWindows}=require('../lib/strikeEnrichment.ts');
const {getGuaranteeWindows}=require('../lib/guaranteeWindows.ts');
const {parseStrikeTiming}=require('../lib/strikeTiming.ts');
const {CITIES}=require('../lib/cities.ts');
const base={date:'16/10/2026',endDate:'16/10/2026',region:'BERGAMO',rawRegion:'Lombardia',provider:"PERSONALE SOC. ARRIVA ITALIA UNITA' PRODUTTIVA DI BERGAMO",sector:'Trasporto pubblico locale',province:'Bergamo',modalita:'24 ORE',note:'',rilevanza:'Locale',unions:'FILT-CGIL/FIT-CISL/UILT-UIL/FAISA-CISAL',sourceKey:'bergamo-16',sourceUrl:'https://scioperi.mit.gov.it/mit2/public/scioperi',proclamationDate:'24/09/2026'};
test('Arriva Bergamo remains independent of Milan in ingestion and every city view',async()=>{
 assert.deepEqual(classifyRegionTags({regionText:'Lombardia',provinceText:'Bergamo',providerText:base.provider,sectorText:base.sector,relevanceText:'Locale'}),['BERGAMO']);
 const records=await transformRows([base]);
 for(const c of CITIES) assert.equal(filterStrikesForRegion(records,c.tag).length,c.tag==='BERGAMO'?1:0);
 assert.deepEqual(records[0].affected_lines,[]);assert.equal(records[0].timing_evidence.fields.affectedLines.value,'UNKNOWN');
});
test('Monza, Varese and an unidentified Lombardia operator never become Milan',()=>{
 for(const place of ['Monza','Varese','Lecco']) assert.deepEqual(classifyRegionTags({regionText:'Lombardia',provinceText:place,providerText:'Personale Arriva Italia',sectorText:'Trasporto pubblico locale',relevanceText:'Locale'}),['UNKNOWN']);
 assert.deepEqual(classifyRegionTags({regionText:'Lombardia',provinceText:'Tutte',providerText:'Personale azienda sconosciuta',relevanceText:'Locale'}),['UNKNOWN']);
 assert.deepEqual(filterStrikesForRegion([{date:'2026-10-16',category:'BUS',provider:'Arriva Italia',region:'UNKNOWN'}],'MILANO'),[]);
 assert.deepEqual(classifyRegionTags({regionText:'Italia',provinceText:'Tutte',providerText:'Arriva Italia',relevanceText:'Locale'}),['UNKNOWN']);
});
test('named Venice airport overrides Italia/Tutte and never fans out to another city',async()=>{
 const provider='PERSONALE SOC. SICURITALIA IVRI AEROPORTO MARCO POLO DI VENEZIA';
 assert.deepEqual(classifyRegionTags({regionText:'Italia',provinceText:'Tutte',providerText:provider,sectorText:'Aereo',relevanceText:'Interregionale'}),['VENEZIA']);
 const records=await transformRows([{...base,region:'VENEZIA',sector:'Aereo',provider,sourceKey:'venice'}]);
 for(const c of CITIES) assert.equal(filterStrikesForRegion(records,c.tag).length,c.tag==='VENEZIA'?1:0);
 assert.deepEqual(records[0].affected_lines,['威尼斯机场']);
});
test('Bergamo airport branding and province never alias Milan',()=>{
 assert.deepEqual(classifyRegionTags({regionText:'Italia',provinceText:'Tutte',providerText:'Personale Milan Bergamo Airport',sectorText:'Aereo'}),['BERGAMO']);
 assert.deepEqual(classifyRegionTags({regionText:'Lombardia',provinceText:'Bergamo',providerText:'Personale aeroporto',sectorText:'Aereo'}),['BERGAMO']);
});
test('guaranteed Bari flights are not affected Bari airport geography',async()=>{
 const provider='PERSONALE SOC. ENAV AEROPORTO DI MILANO MALPENSA',note="GARANTITI I VOLI DA E PER L'AEROPORTO DI BARI";
 assert.deepEqual(classifyRegionTags({regionText:'Italia',provinceText:'Tutte',providerText:provider,noteText:note,sectorText:'Aereo',relevanceText:'Nazionale'}),['MILANO']);
 const records=await transformRows([{...base,region:'MILANO',provider,sector:'Aereo',note}]);
 assert.deepEqual(records[0].affected_lines,['马尔彭萨机场']);assert.equal(filterStrikesForRegion(records,'BARI').length,0);
});
test('unknown airport information never turns national/city labels into every airport',()=>{
 assert.deepEqual(normalizeAirportAffectedLines([],{contextText:'Personale aviazione Italia',regionTag:'NATIONAL'}),[]);
 assert.deepEqual(normalizeAirportAffectedLines([],{contextText:'Easyjet crew',regionTag:'MILANO'}),[]);
 assert.deepEqual(normalizeAirportAffectedLines(['全国相关机场'],{regionTag:'NATIONAL'}),[]);
});
test('airline, crew, airport staff, handling, cargo and national aviation have distinct scopes',()=>{
 for(const [text,region,expected] of [['EASYJET AIRLINES','NATIONAL','AIRLINE'],['PERSONALE NAVIGANTE SOC. EASYJET','NATIONAL','AIRLINE_CREW'],['SICURITALIA IVRI AEROPORTO MARCO POLO','VENEZIA','AIRPORT'],['DNATA AIRPORT HANDLING','MILANO','GROUND_HANDLING'],['NAVIGANTE POSTE AIR CARGO','NATIONAL','CARGO'],['PERSONALE SOC. ENAV','NATIONAL','NATIONAL_AVIATION']]) assert.equal(aviationScope(text,region),expected);
});
test('cargo is retained for traceability but excluded from all passenger city pages',async()=>{
 const records=await transformRows([{...base,region:'NATIONAL',sector:'Aereo',provider:'PERSONALE NAVIGANTE POSTE AIR CARGO'}]);
 assert.equal(records[0].timing_evidence.fields.scopeType.value,'CARGO');assert.deepEqual(records[0].guarantee_windows,[]);
 for(const c of CITIES) assert.equal(filterStrikesForRegion(records,c.tag).length,0);
});
test('easyJet national crew strike names no airports and cannot absorb another airline or airport strike',async()=>{
 const records=await transformRows([{...base,region:'NATIONAL',sector:'Aereo',provider:'PERSONALE NAVIGANTE EASYJET',sourceKey:'easyjet'},{...base,region:'NATIONAL',sector:'Aereo',provider:'PERSONALE NAVIGANTE ITA AIRWAYS',sourceKey:'ita'},{...base,region:'MILANO',sector:'Aereo',provider:'Personale aeroporto Malpensa',sourceKey:'airport'}]);
 const cards=aggregateStrikes(filterStrikesForRegion(records,'MILANO'),'MILANO');
 assert.equal(cards.length,3);assert.equal(cards.filter(c=>c.scopeType==='AIRLINE_CREW').length,2);assert.deepEqual(cards.find(c=>c.provider.includes('易捷')).affected_lines,[]);
});
test('only explicit network service scope becomes ALL_LINES, never all employees or missing detail',()=>{
 for(const text of ['','PERSONALE TUTTO','Trenitalia','M10','M1 esclusa','tutte le linee escluse M2','non interessata linea 23']) assert.equal(extractLineScope(text),'UNKNOWN');
 assert.deepEqual(extractLineScope('Sciopero linee M1 e M3; linea 23'),['M1','M3','23']);
 assert.equal(extractLineScope('sospensione su tutte le linee'),'ALL_LINES');
});
test('no city-wide guarantee fallback; generic aviation rule has explicit provenance',async()=>{
 for(const city of CITIES) assert.deepEqual(getGuaranteeWindows({category:'BUS',dateIso:'2026-10-16',region:city.tag}),[]);
 const records=await transformRows([{...base,region:'NATIONAL',sector:'Aereo',provider:'PERSONALE NAVIGANTE EASYJET'}]);
 const fields=records[0].timing_evidence.fields;
 assert.equal(fields.guaranteeSource,'STANDARD_RULE');assert.equal(fields.guaranteedServiceWindow.source,'STANDARD_RULE');assert.equal(fields.guaranteeType,'PROTECTED_FLIGHTS');assert.ok(fields.guaranteedServiceWindow.url.includes('enac.gov.it'));
});
test('real Arriva format parses negative guarantee wording and all three symbolic intervals',async()=>{
 const html='<main><article><h1>Sciopero Arriva Italia 16 ottobre 2026</h1><p>FILT CGIL, FIT CISL, UIL, FAISA CISAL.</p><p>NON saranno garantiti i servizi nelle fasce orarie:</p><p>Da inizio servizio alle ore 05:59 - dalle ore 08:31 alle ore 12:29 e dalle ore 16:01 sino a termine servizio.</p></article></main>';
 const notices=parseExternalNotices(html,'https://bergamo.arriva.it/notice/test/',['2026-10-16']);
 const [record]=await transformRows([base]);const result=applyTimingEvidence(record,notices);
 assert.deepEqual(result.timing_evidence.windows,[{start:null,end:'05:59',end_kind:'clock'},{start:'08:31',end:'12:29',end_kind:'clock'},{start:'16:01',end:null,end_kind:'end_of_service'}]);
 assert.deepEqual(result.guarantee_windows,[]);assert.equal(result.timing_evidence.fields.timing.source,'OPERATOR_OFFICIAL');
 assert.deepEqual(parseExternalWindows('NON saranno garantiti i servizi dalle 08:31 alle 12:29',record),[{start:'08:31',end:'12:29',end_kind:'clock'}]);
});
test('official exact times and explicit lines outrank MIT while both remain traceable',async()=>{
 const [record]=await transformRows([{...base,modalita:'DALLE 08.30 ALLE 12.30'}]);
 const source={url:'https://bergamo.arriva.it/notice/current/',name:'Arriva',authority:'official',checked_at:'2026-10-04',excerpt:'linea 23; ore 08:31–12:29',content_hash:'abc'};
 const result=applyTimingEvidence(record,[{date:record.date,provider:'Arriva Italia Bergamo',territory:'Bergamo',sector:base.sector,unions:base.unions,timing:'dalle 08:31 alle 12:29',field_text:'linea 23',status:'',source,guarantee_windows:[{start:'06:00',end:'08:30'}]}]);
 assert.equal(result.display_time,'08:31 - 12:29');assert.equal(result.source_url,base.sourceUrl);assert.ok(result.timing_evidence.conflicts.some(c=>c.url===base.sourceUrl));
 assert.deepEqual(result.affected_lines,['23']);assert.equal(result.timing_evidence.fields.affectedLines.source,'OPERATOR_OFFICIAL');assert.equal(result.timing_evidence.fields.guaranteeSource,'OFFICIAL_STRIKE_NOTICE');
});
test('explicit 23:59 is retained, never rounded to an invented midnight endpoint',()=>{
 assert.deepEqual(parseStrikeTiming('24 ORE: DALLE 00.00 ALLE 23.59','AIRPORT','2026-10-16').windows,[{start:'00:00',end:'23:59'}]);
});
test('every record exposes independently sourced fields without inventing unknown values',()=>{
 const fields=makeScopeEvidence({...base,modalita:'4 ORE'},'UNKNOWN','BUS',[],[]);
 for(const key of ['location','scopeType','affectedLines','affectedAirports','affectedOperators','timing','guaranteedServiceWindow']) assert.ok('value' in fields[key] && 'source' in fields[key] && 'confidence' in fields[key]);
 assert.equal(fields.location.confidence,'UNKNOWN');assert.equal(fields.affectedLines.value,'UNKNOWN');assert.equal(fields.guaranteeSource,'UNKNOWN');
});
test('general multi-sector strike is not dropped merely because it mentions freight alongside passenger rail',()=>{
 const headers=['Inizio','Fine','Sindacati','Settore*','Categoria','Modalità','Rilevanza','Note','Data proclamazione','Regione','Provincia'];
 const cells=['14/10/2026','14/10/2026','CGIL','Generale','SCIOPERO GENERALE SETTORI PUBBLICI E PRIVATI REGIONE TOSCANA','FERROVIARIO: DALLE 09.01 ALLE 17.00 / TPL: 4 ORE VARIE MODALITA / TRASPORTO MERCI SU ROTAIA: INTERA PRESTAZIONE','Regionale','ESCLUSO SETTORE TRASPORTO AEREO E GEST DI FIRENZE','17/09/2026','Toscana','Tutte'];
 const html=`<table><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr><tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr></table>`;
 assert.deepEqual(parseStrikeHtml(html).map(r=>r.region),['FIRENZE','PISA']);
});
test('registered indexes are discovery sources, never a single combined event',()=>{
 assert.deepEqual(parseExternalNotices('<main><h1>Notices</h1><h2>Sciopero Arriva Bergamo 16 ottobre 2026</h2><p>FILT CGIL FIT CISL UIL FAISA CISAL 8:31-12:29</p><h2>Other notice</h2><p>9:00-20:00</p></main>','https://bergamo.arriva.it/notice-category/avvisi-di-servizio/',['2026-10-16']),[]);
});
test('official guarantee-only notice adds protection without replacing exact MIT timing',async()=>{
 const [record]=await transformRows([{...base,modalita:'DALLE 09.00 ALLE 12.00'}]);
 const html='<main><article><h1>Sciopero Arriva Italia Bergamo 16 ottobre 2026</h1><p>FILT CGIL FIT CISL UIL FAISA CISAL</p><p>Servizi garantiti dalle 06:00 alle 09:00 e dalle 12:00 alle 15:00.</p></article></main>';
 const notices=parseExternalNotices(html,'https://bergamo.arriva.it/notice/guarantees/',['2026-10-16']);
 const result=applyTimingEvidence(record,notices);
 assert.equal(result.display_time,'09:00 - 12:00');assert.deepEqual(result.guarantee_windows,[{start:'06:00',end:'09:00'},{start:'12:00',end:'15:00'}]);assert.equal(result.timing_evidence.fields.guaranteeSource,'OFFICIAL_STRIKE_NOTICE');
});
test('Tuscany general notice retains TPL uncertainty, publishes passenger rail clocks and preserves GEST exclusion',async()=>{
 const rows=await transformRows([{...base,region:'FIRENZE',sector:'Generale',provider:'SCIOPERO GENERALE SETTORI PUBBLICI E PRIVATI REGIONE TOSCANA',date:'14/10/2026',endDate:'14/10/2026',modalita:"FERROVIARIO: DALLE 09.01 ALLE 17.00 / TPL: 4 ORE VARIE MODALITA / TRASPORTO MERCI SU ROTAIA: INTERA PRESTAZIONE",note:'ESCLUSO SETTORE TRASPORTO AEREO E PERSONALE GEST DI FIRENZE'}]);
 assert.deepEqual(rows.map(r=>r.category).sort(),['BUS','TRAIN']);assert.deepEqual(rows.find(r=>r.category==='BUS').strike_windows,[]);assert.ok(rows[0].timing_evidence.fields.exclusions.value[0].includes('GEST'));
});

test('unregistered operator with apostrophes remains identifiable after repeated display normalization',()=>{
 const {normalizeProviderList}=require('../lib/strikeNormalization.ts');const name="ARRIVA ITALIA UNITA' PRODUTTIVA BERGAMO人员";
 const first=normalizeProviderList(name).join(' / ');assert.ok(first.includes('ARRIVA'));assert.ok(normalizeProviderList(first).join(' / ').includes('BERGAMO'));
});
test('one operator article keeps different union dates, clocks, lines and guarantees in their own sections',async()=>{
 const html='<main><article><h1>Scioperi Arriva Italia Bergamo</h1><h2>USB 16 ottobre 2026</h2><p>linea 23</p><p>Servizio interrotto dalle 09:00 alle 12:00.</p><p>Servizi garantiti dalle 06:00 alle 09:00.</p><h2>CGIL 20 ottobre 2026</h2><p>linea 45</p><p>Servizio interrotto dalle 16:00 alle 19:00.</p><p>Servizi garantiti dalle 12:00 alle 15:00.</p></article></main>';
 const notices=parseExternalNotices(html,'https://bergamo.arriva.it/notice/multiple/',['2026-10-16','2026-10-20']);
 const records=await transformRows([{...base,unions:'USB LAVORO PRIVATO'},{...base,date:'20/10/2026',endDate:'20/10/2026',unions:'CGIL',sourceKey:'second'}]);
 const first=applyTimingEvidence(records[0],notices),second=applyTimingEvidence(records[1],notices);
 assert.equal(first.display_time,'09:00 - 12:00');assert.deepEqual(first.affected_lines,['23']);assert.deepEqual(first.guarantee_windows,[{start:'06:00',end:'09:00'}]);
 assert.equal(second.display_time,'16:00 - 19:00');assert.deepEqual(second.affected_lines,['45']);assert.deepEqual(second.guarantee_windows,[{start:'12:00',end:'15:00'}]);
});
