// Read-only live MIT comparison: existing supported projections must remain
// unchanged; uncovered administrative declarations may acquire canonical IDs.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone TS loader. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const options={module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:options}).outputText,f);
const {parseStrikeHtml}=require('../lib/strikeSync.ts');
const baseline=new Module(path.resolve(__dirname,'../lib/strikeNormalization.ts'));
baseline.paths=Module._nodeModulePaths(path.dirname(baseline.id));
baseline._compile(ts.transpileModule(execFileSync('git',['show','40de9cc:lib/strikeNormalization.ts'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'}),{compilerOptions:options}).outputText,baseline.id);
const {classifyRegionTags}=require('../lib/strikeNormalization.ts');
(async()=>{
 const response=await fetch('https://scioperi.mit.gov.it/mit2/public/scioperi',{signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200);
 const rows=parseStrikeHtml(await response.text()),changed=[];let unchangedSupported=0;
 for(const r of rows){
  const input={regionText:r.rawRegion,provinceText:r.province,providerText:r.provider,sectorText:r.sector,noteText:r.note,relevanceText:r.rilevanza};
  const before=baseline.exports.classifyRegionTags(input),after=classifyRegionTags(input);
  if(!before.includes('UNKNOWN')){assert.deepEqual(after,before);unchangedSupported++;}
  else if(JSON.stringify(before)!==JSON.stringify(after))changed.push({date:r.date,provider:r.provider,officialRegion:r.rawRegion,province:r.province,before,after});
 }
 console.log(JSON.stringify({source:'https://scioperi.mit.gov.it/mit2/public/scioperi',checkedAt:new Date().toISOString(),rows:rows.length,unchangedSupported,changed},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
