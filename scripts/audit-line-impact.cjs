// Read-only replay of production evidence. Never calls a model or writes DB.
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
require('@next/env').loadEnvConfig(process.cwd());
const {createClient}=require('@supabase/supabase-js');
const {makeScopeEvidence}=require('../lib/strikeScope.ts');
const {buildLineImpact}=require('../lib/lineImpact.ts');
const {GTFS_FEEDS}=require('../lib/officialTransitData.ts');
const {operatorAdapters}=require('../lib/operatorAdapters.ts');
(async()=>{
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(20000)})}});
 const {data,error}=await db.from('strikes').select('date,provider,region,category,status,source_key,raw_payload,timing_evidence,last_seen_at').gte('date',today).not('status','in','(STALE,CANCELLED)');if(error)throw Error(error.message);
 const replay=data.map(r=>{
  const old=r.timing_evidence?.fields;
  if(!r.raw_payload||!old)return r;
  const guarantees=/\bENAV\b/i.test(r.raw_payload.provider)?[{start:'07:00',end:'10:00'},{start:'18:00',end:'21:00'}]:old.guaranteedServiceWindow?.value || [];
  const fresh=makeScopeEvidence(r.raw_payload,r.region,r.category,(r.timing_evidence.windows || []).filter(w=>w.start&&w.end),guarantees);
  // Retain already-adopted official line/timing/guarantee facts; recompute only
  // the corrected workforce classification and ENAV standard policy/exception.
  const fields={...old,scopeType:fresh.scopeType,passengerImpact:fresh.passengerImpact,...(/\bENAV\b/i.test(r.raw_payload.provider)?{guaranteeSource:fresh.guaranteeSource,guaranteeEvidenceWindows:fresh.guaranteeEvidenceWindows,guaranteeDuringStrike:fresh.guaranteeDuringStrike,guaranteedServiceWindow:fresh.guaranteedServiceWindow,protectedFlightExceptions:fresh.protectedFlightExceptions}:{})};
  return {...r,timing_evidence:{...r.timing_evidence,fields}};
 });
 const rows=replay.map(r=>({date:r.date,region:r.region,category:r.category,sourceKey:r.source_key,provider:r.raw_payload?.provider||r.provider,impact:buildLineImpact(r),guaranteeSource:r.timing_evidence?.fields?.guaranteeSource,guaranteeDuringStrike:r.timing_evidence?.fields?.guaranteeDuringStrike,protectedFlightExceptions:r.timing_evidence?.fields?.protectedFlightExceptions}));
 const counts={};rows.forEach(r=>{const k=r.impact.declaredScope.value.kind;counts[k]=(counts[k]||0)+1;});
 const report={checkedAt:new Date().toISOString(),mode:'READ_ONLY_REPLAY_NOT_DEPLOYED',databaseWrites:0,paidModelCalls:0,sourceRows:rows.length,independentAnnouncements:new Set(rows.map(r=>r.sourceKey)).size,counts,registeredOperators:operatorAdapters.length,registeredGtfsFeeds:Object.keys(GTFS_FEEDS).length,rows};
 fs.mkdirSync('docs/verification',{recursive:true});fs.writeFileSync('docs/verification/2026-10-line-impact-replay.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,rows:undefined},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
