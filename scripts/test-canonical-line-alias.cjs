/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),{test}=require('node:test');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,esModuleInterop:true,target:9}}).outputText,f);
const {canonicalLineAlias}=require('../lib/canonicalLineAlias.ts');
const {validateLineRoutes}=require('../lib/officialTransitData.ts');
const {parseLineScope}=require('../lib/lineScope.ts');
const {scheduleForScope}=require('../lib/serviceSchedule.ts');
const {buildLineImpact,declaredLineMatch}=require('../lib/lineImpact.ts');
const {projectRouteMembership,membershipFact}=require('../lib/routeMembership.ts');
const catalog=require('./fixtures/gest-route-catalog-2026-10-06.json');
const date='2026-10-10',now=new Date(catalog.checkedAt),operator='GEST_FIRENZE';
const context={...catalog,operator,date,category:'BUS'};
const t1=catalog.routes.find(r=>r.name==='T1.3');
const scope=()=>parseLineScope('linee T1 e T2',[operator],true);
function impact(kind='SPECIFIC_LINES',other={}){
 const c={...catalog,operator,cities:['FIRENZE'],...other};
 const s=scope();s.kind=kind;if(kind==='ALL_EXCEPT'){s.excludedLineNames=['T1'];s.affectedLineNames=[];}
 const fields={lineScope:{value:validateLineRoutes(s,c,date,'BUS'),confidence:'HIGH',source:'OPERATOR_OFFICIAL',url:'https://www.gestramvia.it/10-ottobre-sciopero-aziendale-di-24-ore-indetto-da-cobas/'},routeMembership:membershipFact(projectRouteMembership(c,date,'BUS','FIRENZE',operator,[],now))};
 return buildLineImpact({date,provider:'GEST FIRENZE',region:'FIRENZE',category:'BUS',timing_evidence:{fields}},now);
}
test('actual October official GEST feed resolves both public lines, preserving raw identities and provenance',()=>{
 const r=validateLineRoutes(scope(),catalog,date,'BUS');assert.equal(r.routeValidation,'VERIFIED');assert.deepEqual(r.affectedRouteIds,[t1.id,catalog.routes.find(r=>r.name==='T2').id]);assert.deepEqual(r.affectedLineNames,['T1','T2']);assert.equal(r.routeAliases[0].catalogName,'T1.3');assert.equal(r.routeAliases[0].source,'https://www.firenzetramvia.it/linee/t1');assert.equal(catalog.routes[1].name,'T1.3');
});
test('alias rejects wrong operator, source, feed, mode, non-tram type and altered route name/identity',()=>{
 for(const c of [{operator:'ATB_TEB_BERGAMO'},{feedId:'GTFS_MILANO'},{source:catalog.source+'?other=1'},{category:'TRAIN'},{category:'SUBWAY'},{feedId:undefined}])assert.equal(canonicalLineAlias(t1,{...context,...c}),undefined);
 for(const r of [{...t1,type:3},{...t1,name:'T1.4'},{...t1,name:'T1.30'},{...t1,longName:'Unknown line'},{...t1,operator:'OTHER'}])assert.equal(canonicalLineAlias(r,context),undefined);
});
test('mapping respects reviewed and publisher dates; extensions need review',()=>{
 for(const c of [{date:'2026-08-09'},{date:'2026-12-31',validTo:'2027-02-01'},{date:'2026-02-30'},{validFrom:'2026-10-11'},{validTo:'2026-10-09'},{validTo:null}])assert.equal(canonicalLineAlias(t1,{...context,...c}),undefined);
 assert.ok(canonicalLineAlias(t1,{...context,date:'2026-12-30'}));
});
test('route IDs are discovered from the current reviewed feed, not hardcoded',()=>{
 const c={...catalog,routes:catalog.routes.map(r=>({...r,id:'new-'+r.id}))};assert.deepEqual(validateLineRoutes(scope(),c,date,'BUS').affectedRouteIds,[`new-${t1.id}`,`new-${catalog.routes[0].id}`]);
});
test('duplicate alias targets or coexisting public T1 are not silently collapsed',()=>{
 const duplicate={...catalog,routes:[...catalog.routes,{...t1,id:'second'}]};assert.equal(validateLineRoutes(scope(),duplicate,date,'BUS').routeValidation,'PARTIAL');
 const coexist={...catalog,routes:[...catalog.routes,{...t1,id:'public',name:'T1'}]};assert.equal(canonicalLineAlias(t1,{...context,routes:coexist.routes}),undefined);assert.deepEqual(validateLineRoutes(scope(),coexist,date,'BUS').affectedRouteIds,['public',catalog.routes[0].id]);
});
test('potential lines and public T1 selection receive resolved route IDs while membership retains raw label',()=>{
 const i=impact();assert.deepEqual(i.potentialLines.map(r=>[r.displayName,r.routeIds]),[['T1',[t1.id]],['T2',[catalog.routes[0].id]]]);assert.equal(declaredLineMatch(i,'T1'),'NAMED');assert.equal(i.potentialLines[0].routeAliases[0].catalogName,'T1.3');assert.equal(i.potentialLines[0].actualOperationConfirmed,false);
});
test('a public T1 exception also excludes its GTFS identity from expanded candidates',()=>{
 const s=scope();s.kind='ALL_EXCEPT';s.affectedLineNames=[];s.excludedLineNames=['T1'];assert.deepEqual(validateLineRoutes(s,catalog,date,'BUS').excludedRouteIds,[t1.id]);const i=impact('ALL_EXCEPT');assert.deepEqual(i.potentialLines.map(r=>r.displayName),['T2']);assert.equal(declaredLineMatch(i,'T1'),'EXCLUDED');
});
test('stale ownership or expired alias never fabricates a public T1 route ID',()=>{
 const i=impact('SPECIFIC_LINES',{checkedAt:'2026-10-01T00:00:00Z'});assert.equal(i.potentialLines.find(r=>r.displayName==='T1').routeIds.length,0);
 const s=validateLineRoutes(scope(),{...catalog,validTo:'2027-01-01'},'2026-12-31','BUS');assert.equal(s.routeValidation,'PARTIAL');assert.deepEqual(s.routeAliases,[]);
});
test('dated timetable uses the same identity for named lines and exceptions; keeps planned times separate',()=>{
 const index={...catalog,operator,timezone:'Europe/Rome',calendar:[{service_id:'s',start_date:'20260810',end_date:'20261230',saturday:'1'}],exceptions:[],services:catalog.routes.map(r=>({routeId:r.id,serviceId:'s',trips:1,complete:true,first:21600,lastDeparture:72000,lastArrival:74400}))};
 const r=scheduleForScope(index,date,'BUS',scope());assert.equal(r.status,'COMPLETE');assert.equal(r.routes.find(r=>r.id===t1.id).name,'T1.3');assert.equal(r.actualOperationConfirmed,false);
 const s=scope();s.kind='ALL_EXCEPT';s.excludedLineNames=['T1'];const except=scheduleForScope(index,date,'BUS',s);assert.deepEqual(except.routes.map(r=>r.id),[catalog.routes[0].id]);
 assert.equal(scheduleForScope({...index,feedId:undefined},date,'BUS',scope()).status,'PARTIAL');
});
