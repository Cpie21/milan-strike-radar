// Read-only verification: no synchronization, paid model or writes.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,esModuleInterop:true,target:9}}).outputText,f);
const {loadRouteCatalog}=require('../lib/officialTransitData.ts');
(async()=>{
 const catalog=await loadRouteCatalog('GTFS_GEST',Date.now()+45000),origin=process.env.STRIKE_AUDIT_ORIGIN||'https://www.theitalystrike.com',checks=[];
 const expected={T1:catalog.routes.find(r=>r.name==='T1.3').id,T2:catalog.routes.find(r=>r.name==='T2').id};
 for(const line of [null,'T1','T2']){
  const p=new URLSearchParams({region:'FIRENZE',date:'2026-10-10',category:'BUS'});if(line)p.set('line',line);
  const r=await fetch(origin+'/api/line-impact?'+p,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const b=await r.json();
  const event=b.declared.events.find(e=>e.impact.declaredScope.value.operatorIds.includes('GEST_FIRENZE'));assert.ok(event);assert.deepEqual(event.impact.potentialLines.map(l=>l.displayName),line?[line]:['T1','T2']);
  for(const l of event.impact.potentialLines){assert.deepEqual(l.routeIds,[expected[l.displayName]]);assert.equal(l.actualOperationConfirmed,false);if(l.displayName==='T1'){assert.equal(l.routeAliases[0].catalogName,'T1.3');assert.equal(l.routeAliases[0].catalogSource,catalog.source);}}
  if(line)assert.equal(event.lineMatch,'NAMED');checks.push({query:Object.fromEntries(p),http:r.status,event});
 }
 const lab=await fetch(origin+'/lab',{signal:AbortSignal.timeout(30000)});assert.equal(lab.status,200);
 const report={checkedAt:new Date().toISOString(),origin,expected,checks,labHttpStatus:lab.status,allPassed:true};fs.writeFileSync(process.argv[2]||'/tmp/gest-alias-http.json',JSON.stringify(report,null,2)+'\n');console.log({allPassed:true,publicLines:expected,lab:lab.status});
})().catch(e=>{console.error(e.message);process.exitCode=1;});
