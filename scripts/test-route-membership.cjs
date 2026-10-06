/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),{test}=require('node:test');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,esModuleInterop:true,target:9}}).outputText,f);
const {projectRouteMembership,membershipFact,freshMembership}=require('../lib/routeMembership.ts');
const {directoryCatalog,routeCatalogCoverage}=require('../lib/routeCatalogSources.ts');
const {enrichRouteMembership,catalogueForEmployer}=require('../lib/routeMembershipEnrichment.ts');
const {zip64MemberSizes,resolveGtfsSource,loadRouteCatalog}=require('../lib/officialTransitData.ts');
const {buildLineImpact,declaredLineMatch}=require('../lib/lineImpact.ts');
const {makeScopeEvidence}=require('../lib/strikeScope.ts');
const {parseLineScope}=require('../lib/lineScope.ts');
const {travellerLineImpacts}=require('../lib/travellerLineImpact.ts');
const now=new Date('2026-10-06T09:00:00Z'),date='2026-10-09';
const catalog=(routes,other={})=>({feedId:'GTFS_MILANO',operator:'ATM_MILANO',cities:['MILANO'],source:'https://dati.comune.milano.it/gtfs.zip',checkedAt:now.toISOString(),contentHash:'hash',validFrom:'2026-09-14',validTo:'2026-10-19',modeValidTo:{BUS:'2026-10-02',SUBWAY:'2026-10-15'},routes,...other});
const route=(id,name=id,type=3,other={})=>({id,name,type,operator:'ATM_MILANO',...other});
function record(category='BUS',provider='ATM MILANO',region='MILANO',operator='ATM_MILANO',text='Le nostre linee'){
 const raw_payload={provider,region,rawRegion:region,date,endDate:date,province:'Tutte',rilevanza:'Locale',sector:category==='TRAIN'?'Ferroviario':'Trasporto pubblico locale',modalita:'24 ORE',note:'',unions:'USB'};
 const fields=makeScopeEvidence(raw_payload,region,category,[]);
 if(text)fields.lineScope={value:parseLineScope(text,[operator],true),confidence:'HIGH',source:'OPERATOR_OFFICIAL',url:'https://www.atm.it/notice',excerpt:text};
 return {id:provider,provider,source_key:provider,region,date,category,status:'CONFIRMED',raw_payload,timing_evidence:{fields,windows:[],sources:[],conflicts:[],confidence:'official'}};
}
function withCatalog(r,c){r.timing_evidence.fields.routeMembership=membershipFact(projectRouteMembership(c,r.date,r.category,r.region,c.operator,[],now));return r;}
test('fresh route ownership does not inherit an expired surface timetable or metro service validity',()=>{
 const c=catalog([route('B90','90'),route('B91','91'),route('M1','1',1)]),r=withCatalog(record(),c);
 r.timing_evidence.fields.serviceSchedule={confidence:'UNKNOWN',source:'OPERATOR_OFFICIAL',value:{status:'OUT_OF_VALIDITY',date,category:'BUS',operator:'ATM_MILANO',routes:[]}};
 const impact=buildLineImpact(r,now);assert.deepEqual(impact.potentialLines.map(l=>l.displayName),['90','91']);
 assert.equal(impact.potentialLinesStatus,'PARTIAL');assert.equal(declaredLineMatch(impact,'90'),'POTENTIAL');assert.equal(declaredLineMatch(impact,'M1'),'UNCONFIRMED');
 assert.ok(impact.potentialLines.every(l=>!l.scheduledReference&&!l.actualOperationConfirmed&&l.noticeSource&&l.catalogSource));
 const metro=buildLineImpact(withCatalog(record('SUBWAY'),c),now);assert.deepEqual(metro.potentialLines.map(l=>l.displayName),['M1']);assert.match(metro.presentation.zh,/M1/);
});
test('cached, future-dated and obsolete re-downloaded directories cannot create current ownership',()=>{
 const c=catalog([route('B90','90')]);for(const other of [{checkedAt:'2026-10-03T08:00:00Z'},{checkedAt:'2026-10-06T09:06:00Z'},{validTo:'2026-05-31'}])assert.equal(projectRouteMembership({...c,...other},date,'BUS','MILANO','ATM_MILANO',[],now).status,'STALE');
 const fact=membershipFact(projectRouteMembership(c,date,'BUS','MILANO','ATM_MILANO',[],now));assert.equal(freshMembership(fact,date,'BUS','MILANO','ATM_MILANO',new Date('2026-10-09')),undefined);
});
test('operator, city, mode and named network must all have explicit directory evidence',()=>{
 const c=catalog([route('B90','90')]);for(const [city,op,mode,status] of [['BERGAMO','ATM_MILANO','BUS','UNAVAILABLE'],['MILANO','ARRIVA_BERGAMO','BUS','UNAVAILABLE'],['MILANO','ATM_MILANO','TRAIN','MODE_NOT_COVERED'],['MILANO','ATM_MILANO','AIRPORT','MODE_NOT_COVERED']])assert.equal(projectRouteMembership(c,date,mode,city,op,[],now).status,status);
 assert.equal(projectRouteMembership(c,date,'BUS','MILANO','ATM_MILANO',['network'],now).status,'NETWORK_UNVERIFIED');
 const n=catalog([route('90','90',3,{networks:['Sud']}),route('91','91',3,{networks:['Est']})]);assert.deepEqual(projectRouteMembership(n,date,'BUS','MILANO','ATM_MILANO',['Sud'],now).routes.map(r=>r.name),['90']);
});
test('specific notices never widen and exact exceptions retain leading zero identity',()=>{
 const c=catalog([route('r021','021'),route('r21','21'),route('r043','043'),route('r90','90')]);
 const named=buildLineImpact(withCatalog(record('BUS','ATM','MILANO','ATM_MILANO','linea 90'),c),now);assert.deepEqual(named.potentialLines.map(l=>l.displayName),['90']);
 const except=buildLineImpact(withCatalog(record('BUS','ATM','MILANO','ATM_MILANO','intera rete eccetto linee 021 e 043'),c),now);assert.deepEqual(except.potentialLines.map(l=>l.displayName),['21','90']);assert.equal(declaredLineMatch(except,'021'),'EXCLUDED');assert.equal(declaredLineMatch(except,'21'),'POTENTIAL');
 const without=buildLineImpact(record('BUS','ATM','MILANO','ATM_MILANO','linea 90'),now);assert.equal(without.potentialLinesStatus,'RESOLVED');assert.deepEqual(without.potentialLines[0].routeIds,[]);
});
test('staff, office, security, customer operations and aviation never expand into ordinary passenger lines',()=>{
 for(const r of [record('BUS','AMTAB BARI','BARI','AMTAB_BARI',null),record('TRAIN','FS SECURITY SICILIA','PALERMO','TRENITALIA',null),record('TRAIN','TRENITALIA CUSTOMER OPERATIONS','BOLOGNA','TRENITALIA',null),record('TRAIN','RFI DOIT PALERMO','PALERMO','TRENITALIA',null),record('AIRPORT','VENICE MARCO POLO','VENEZIA','ACTV_VENEZIA',null)]){
  withCatalog(r,catalog([route('90')],{operator:r.timing_evidence.fields.lineScope?.value.operatorIds[0]||'ATM_MILANO',cities:[r.region]}));assert.deepEqual(buildLineImpact(r,now).potentialLines,[]);
 }
 const conflicted=withCatalog(record(),catalog([route('90')]));conflicted.timing_evidence.fields.lineScope.confidence='CONFLICT';assert.equal(buildLineImpact(conflicted,now).potentialLinesStatus,'SCOPE_UNCONFIRMED');
});
test('per-line scheduled references cannot borrow another route latest arrival, day or stale evidence',()=>{
 const r=withCatalog(record('SUBWAY'),catalog([route('M1','1',1),route('M2','2',1)]));
 const clock=(clock,dayOffset=0)=>({clock,dayOffset,seconds:0});
 r.timing_evidence.fields.serviceSchedule={confidence:'UNKNOWN',source:'OPERATOR_OFFICIAL',value:{status:'PARTIAL',date,category:'SUBWAY',operator:'ATM_MILANO',checkedAt:now.toISOString(),source:'https://official.test/gtfs',routes:[{id:'M1',name:'1',firstDeparture:clock('06:00'),lastDeparture:clock('00:20',1),lastArrival:clock('00:55',1)},{id:'M2',name:'2',firstDeparture:clock('05:50'),lastDeparture:clock('00:32',1),lastArrival:clock('01:30',1)}]}};
 let lines=buildLineImpact(r,now).potentialLines;assert.equal(lines[0].scheduledReference.lastArrival.clock,'00:55');assert.equal(lines[1].scheduledReference.lastArrival.clock,'01:30');assert.equal(lines[0].scheduledReference.lastDeparture.dayOffset,1);
 for(const patch of [{date:'2026-10-10'},{category:'BUS'},{checkedAt:'2026-10-01'},{operator:'OTHER'},{status:'OUT_OF_VALIDITY'}]){const copy=structuredClone(r);Object.assign(copy.timing_evidence.fields.serviceSchedule.value,patch);assert.ok(buildLineImpact(copy,now).potentialLines.every(l=>!l.scheduledReference));}
});
test('directory parsing excludes navigation, historical notices, other agencies and unknown city assignments',()=>{
 const html='<nav><h3 class="card-title"><a href="/trasporti-pubblici/linee/prossime-corse?idroute=x">Linea 99</a></h3></nav><h3 class="card-title"><a href="/trasporti-pubblici/linee/prossime-corse?idroute=1">Linea 1</a></h3><h3 class="card-title"><a href="https://evil.test/trasporti-pubblici/linee/prossime-corse?idroute=2">Linea 2</a></h3>';
 assert.deepEqual(directoryCatalog('DIRECTORY_ATB',html).routes.map(r=>r.name),['1']);
 const air=directoryCatalog('DIRECTORY_AIR_CAMPANIA','<a href="/one.pdf">33-CE | Napoli - Benevento</a><a href="/two.pdf">33-CE | Roma - Campobasso</a><a href="https://evil.test/a">77 | Napoli</a>');assert.equal(air.routes.length,1);assert.deepEqual(air.routes[0].cities,['NAPOLI','ROMA']);assert.match(air.routes[0].longName,/Napoli.*Roma/);
 const rows=[{route_id:'r',route_short_name:'R5',route_long_name:'Milano - Brescia',agency_id:'1',route_type:'2'},{route_id:'s',route_short_name:'S1',route_long_name:'Saronno',agency_id:'1',route_type:'2'},{route_id:'foreign',route_short_name:'R6',agency_id:'other',route_type:'2'}];
 const rail=directoryCatalog('DIRECTORY_TRENORD',JSON.stringify(rows));assert.equal(rail.routes.length,2);assert.equal(projectRouteMembership(rail,date,'TRAIN','MILANO','TRENORD',[],new Date()).routes.length,1);
});
test('combined ATB/TEB publication cannot widen a single employer strike',()=>{
 const c=catalog([route('b','1'),route('t','T1',0)],{operator:'ATB_TEB_BERGAMO',cities:['BERGAMO']});
 assert.deepEqual(catalogueForEmployer(c,record('BUS','TEB BERGAMO')).routes.map(r=>r.name),['T1']);assert.deepEqual(catalogueForEmployer(c,record('BUS','ATB BERGAMO')).routes.map(r=>r.name),['1']);assert.equal(catalogueForEmployer(c,record('BUS','trasporto di Bergamo')),undefined);
});
test('a failed source clears prior ownership and does not block a different city',async()=>{
 const a=withCatalog(record(),catalog([route('90')])),b=record('BUS','GEST FIRENZE','FIRENZE','GEST_FIRENZE','linee T1 e T2'),warnings=[];
 const result=await enrichRouteMembership([a,b],warnings,async id=>{if(id==='GTFS_MILANO')throw Error('blocked');return catalog([route('t1','T1',0,{operator:'GEST_FIRENZE'})],{feedId:id,operator:'GEST_FIRENZE',cities:['FIRENZE']});},now);
 assert.equal(result.records[0].timing_evidence.fields.routeMembership.value.status,'UNAVAILABLE');assert.equal(result.records[1].timing_evidence.fields.routeMembership.value.status,'CURRENT_CATALOG');assert.equal(result.projected,1);assert.equal(warnings.length,1);
 const all=routeCatalogCoverage();assert.equal(all.length,20);assert.ok(all.every(c=>Object.keys(c.modes).length===4&&c.modes.AIRPORT.status==='FLIGHT_EVIDENCE_REQUIRED'));assert.equal(all.find(c=>c.city==='MESSINA').modes.BUS.status,'NO_VERIFIED_CATALOG');
});
test('one-line traveller query returns only that relevant potential line',()=>{
 const r=withCatalog(record(),catalog([route('90'),route('91')]));r.timing_evidence.fields.routeMembership.value.checkedAt=new Date().toISOString();
 const out=travellerLineImpacts([r],{region:'MILANO',date,category:'BUS',line:'90'});assert.equal(out.events[0].lineMatch,'POTENTIAL');assert.deepEqual(out.events[0].impact.potentialLines.map(l=>l.displayName),['90']);
});
test('TPER discovery follows official current Bologna version, never Ferrara or mismatched downloads',async()=>{
 const original=global.fetch;let mismatch=false;
 global.fetch=async u=>new Response(String(u).endsWith('open-data.aspx')?'<a href="open-data-detail.aspx?filename=gommagtfsfe&version=20260904">FE</a><a href="open-data-detail.aspx?filename=gommagtfsbo&version=20260928">BO</a>':`<a href="open-data-download.aspx?filename=gommagtfsbo&version=${mismatch?'20250101':'20260928'}&format=zip">ZIP</a>`);
 try{assert.match(await resolveGtfsSource('GTFS_TPER'),/filename=gommagtfsbo.*version=20260928/);mismatch=true;await assert.rejects(resolveGtfsSource('GTFS_TPER'),/download not found/);}finally{global.fetch=original;}
});
test('small ZIP64 CSV member sizes are decoded but truncated or unsafe 64-bit sizes are rejected',()=>{
 const extra=Buffer.alloc(20);extra.writeUInt16LE(1);extra.writeUInt16LE(16,2);extra.writeBigUInt64LE(281n,4);extra.writeBigUInt64LE(162n,12);assert.deepEqual(zip64MemberSizes(extra,0xffffffff,0xffffffff),{packed:162,unpacked:281});
 assert.throws(()=>zip64MemberSizes(extra.subarray(0,10),0xffffffff,0xffffffff));extra.writeBigUInt64LE(9007199254740992n,4);assert.throws(()=>zip64MemberSizes(extra,0xffffffff,0xffffffff),/Oversize/);
});
test('server ignoring Range is read as one bounded archive without mixing later range responses',async()=>{
 const entries={'agency.txt':'agency_id,agency_name\na,AMT\n','routes.txt':'route_id,agency_id,route_short_name,route_type\nr,a,101,3\n','calendar.txt':'service_id,start_date,end_date\ns,20261001,20261101\n'};let pos=0;const locals=[],centrals=[];
 for(const [name,text] of Object.entries(entries)){const n=Buffer.from(name),b=Buffer.from(text),h=Buffer.alloc(30),c=Buffer.alloc(46);h.writeUInt32LE(0x04034b50);h.writeUInt32LE(b.length,18);h.writeUInt32LE(b.length,22);h.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt32LE(b.length,20);c.writeUInt32LE(b.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(pos,42);locals.push(h,n,b);centrals.push(c,n);pos+=h.length+n.length+b.length;}
 const dir=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(pos,16);const archive=Buffer.concat([...locals,dir,end]),original=global.fetch;let downloads=0;
 global.fetch=async(_url,options)=>options.method==='HEAD'?new Response(null,{headers:{'content-length':String(archive.length),etag:'v1'}}):(downloads++,new Response(archive,{headers:{'content-length':String(archive.length),etag:'v1'}}));
 try{const c=await loadRouteCatalog('GTFS_GENOVA');assert.equal(c.routes[0].name,'101');assert.equal(downloads,1);}finally{global.fetch=original;}
});
test('additional city directories keep section, tram, employer and exact PDF line boundaries',()=>{
 const b=directoryCatalog('DIRECTORY_BRESCIA','<h4>Brescia</h4><div><div class="bm-route-square"><div class="line-number">2</div><div class="bm-title"><span class="title">Pendolina - Chiesanuova</span></div><div class="pdf-container"><a href="/line2.pdf">PDF</a></div></div></div><h4>Desenzano</h4><div><div class="bm-route-square"><div class="line-number">1</div><div class="pdf-container"><a href="/line1.pdf">PDF</a></div></div></div>');assert.deepEqual(b.routes.map(r=>r.name),['2']);
 const t=directoryCatalog('DIRECTORY_TRIESTE','<div><a aria-label="LINEA 2" href="/it/trasporto-pubblico/linee-orari/linea-2-tram"></a><div class="name">Opicina</div></div><div><a aria-label="LINEA A" href="/it/trasporto-pubblico/linee-orari/linea-a"></a></div><a aria-label="Marine" href="/it/marittimo"></a>');assert.deepEqual(t.routes.map(r=>[r.name,r.type]),[['2',0],['A',3]]);
 const p=directoryCatalog('DIRECTORY_PALERMO','<select><option value="101">Linea 101</option><option value="TRAM1">Linea TRAM1</option><option value="false">Other</option></select>');assert.deepEqual(p.routes.map(r=>r.name),['101','TRAM1']);
 const v=directoryCatalog('DIRECTORY_VERONA','<a href="/flex/cm/pages/ServeAttachment.php/L/IT/file.pdf">orario linea 11 (63 KB)</a><a href="https://evil.test/ServeAttachment.php/a">orario linea 12</a><a href="/news">LINEA 73 - Modifica</a>');assert.deepEqual(v.routes.map(r=>r.name),['11']);
});
test('scope without high confidence cannot promote network candidates and fresh dedup cannot borrow older routes',()=>{
 const r=withCatalog(record(),catalog([route('90')]));r.timing_evidence.fields.lineScope.confidence='MEDIUM';const i=buildLineImpact(r,now);assert.deepEqual(i.potentialLines,[]);assert.equal(declaredLineMatch(i,'90'),'UNCONFIRMED');
 const a=withCatalog(record('BUS','ATM'),catalog([route('90')])),b=withCatalog(record('BUS','ATM'),catalog([route('91')]));a.timing_evidence.fields.routeMembership.value.checkedAt=new Date(Date.now()-60000).toISOString();b.timing_evidence.fields.routeMembership.value.checkedAt=new Date().toISOString();
 const out=travellerLineImpacts([a,b],{region:'MILANO',date,category:'BUS'});assert.equal(out.events.length,1);assert.deepEqual(out.events[0].impact.potentialLines.map(l=>l.displayName),['91']);assert.equal(out.events[0].announcements.length,2);
});
test('regional EAV route publication does not donate unrelated regional lines or a network latest time',()=>{
 const {catalogFromFiles}=require('../lib/officialTransitData.ts'),{scheduleFeedFor}=require('../lib/serviceScheduleEnrichment.ts');
 const c=catalogFromFiles('GTFS_EAV',{'agency.txt':'agency_id,agency_name\na,Eav srl - Divisione Ferrovia\n','routes.txt':'route_id,agency_id,route_short_name,route_long_name,route_type\nr,a,1,Napoli - Sorrento,2\nout,a,2,Benevento - Avellino,2\n'});
 const p=projectRouteMembership({...c,operator:'EAV_NAPOLI',cities:['NAPOLI']},date,'TRAIN','NAPOLI','EAV_NAPOLI',[],new Date());assert.deepEqual(p.routes.map(r=>r.id),['r']);
 const r=record('TRAIN','EAV DTF NAPOLI','NAPOLI','EAV_NAPOLI');assert.equal(scheduleFeedFor(r),undefined);
 r.timing_evidence.fields.lineScope.value.kind='SPECIFIC_LINES';r.timing_evidence.fields.lineScope.value.affectedLineNames=['1'];assert.equal(scheduleFeedFor(r),'GTFS_EAV');
});
