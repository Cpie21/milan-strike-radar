// Explicit read-only audit. No database write, AI call, cron registration or UI deploy.
const fs=require('fs'),path=require('path'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {GTFS_FEEDS}=require('../lib/officialTransitData.ts');const {loadScheduleIndex,scheduleFromArchive}=require('../lib/gtfsSchedule.ts');const {scheduleForScope}=require('../lib/serviceSchedule.ts');const {parseLineScope}=require('../lib/lineScope.ts');const {serviceScheduleCoverage}=require('../lib/serviceScheduleEnrichment.ts');
(async()=>{
 const output=process.argv[2];if(!output)throw Error('Provide an output JSON path');const dir=process.argv[3];
 const result={checkedAt:new Date().toISOString(),actualOperationConfirmed:false,coverage:serviceScheduleCoverage(),feeds:[]};
 for(const [id,config]of Object.entries(GTFS_FEEDS)) {
  const started=Date.now();try {
   const i=dir?await scheduleFromArchive(id,fs.readFileSync(path.join(dir,id+'.zip'))):await loadScheduleIndex(id);
   const cases=[];for(const date of ['2026-10-09','2026-10-10','2026-10-16','2026-10-29'])for(const mode of ['BUS','SUBWAY','TRAIN']) {
    const r=scheduleForScope(i,date,mode,parseLineScope('Le nostre linee',[config.operator],true));cases.push({date,mode,status:r.status,reason:r.reason,routes:r.routes.length,first:r.firstDeparture,lastDeparture:r.lastDeparture,lastArrival:r.lastArrival});
   }
   result.feeds.push({id,source:config.url,hash:i.contentHash,validFrom:i.validFrom,validTo:i.validTo,modeValidTo:i.modeValidTo,cases,seconds:(Date.now()-started)/1000});
  }catch(e){result.feeds.push({id,source:config.url,status:'UNAVAILABLE',error:e.message});}
 }
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.feeds.map(f=>({id:f.id,status:f.status||'READ',validFrom:f.validFrom,validTo:f.validTo,seconds:f.seconds,error:f.error}))));
})().catch(e=>{console.error(e.message);process.exitCode=1});
