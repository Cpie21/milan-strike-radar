// Server-side, read-only. Uses the existing local service credential; never
// prints credentials or makes a paid model request.
const fs=require('node:fs'),ts=require('typescript');
process.loadEnvFile(process.env.STRIKE_REVIEW_ENV_FILE || '.env.local');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {serverDatabase}=require('../lib/strikeQuery.ts');
const {readSemanticReviewQueue}=require('../lib/semanticReviewQueue.ts');
const {REVIEW_VERSION}=require('../lib/strikeSemanticReview.ts');
(async()=>{
 const queue=await readSemanticReviewQueue(serverDatabase());
 const report={version:REVIEW_VERSION,checked_at:new Date().toISOString(),count:queue.length,queue};
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1});
