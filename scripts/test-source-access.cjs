/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),{test}=require('node:test');const {X509Certificate}=require('node:crypto'),{rootCertificates}=require('node:tls');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,esModuleInterop:true,target:9}}).outputText,f);
const {canonicalCgsseUrl,ACTALIS_OV_G3}=require('../lib/cgsseTls.ts');const {fetchToscanaNotice,renderToscanaArticle}=require('../lib/toscanaAirportNotices.ts');const {parseExternalNotices}=require('../lib/strikeEnrichment.ts');
test('source diagnostic refuses missing authorization before any network request, including unconfigured production',async()=>{
 const {GET}=require('../app/api/admin/source-access/route.ts');const old=process.env.CRON_SECRET;const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('Must not fetch');};
 try{delete process.env.CRON_SECRET;assert.equal((await GET(new Request('https://example.test/api/admin/source-access'))).status,503);process.env.CRON_SECRET='test-secret';assert.equal((await GET(new Request('https://example.test/api/admin/source-access?url=https://evil.test'))).status,401);assert.equal(calls,0);}finally{global.fetch=original;if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;}
});
const article={id:'id',title:'Sciopero 16 ottobre 2026',path:'/console/it/sciopero-16-ottobre-2026',created:{time:'2026-10-05T12:00:00Z'},body:{processed:'<p>PERSONALE TOSCANA AEROPORTI Pisa e Firenze sciopero USB dalle 10:00 alle 14:00</p>'}};
test('regulator intermediate is signed by an existing trusted root, unexpired, with fixed fingerprint',()=>{
 const ca=new X509Certificate(ACTALIS_OV_G3);assert.equal(ca.ca,true);assert.equal(ca.fingerprint256,'93:1A:AA:1E:C9:B2:BA:0F:A5:9A:82:30:2F:4F:83:06:28:C8:6D:9B:2D:2A:50:A4:D1:B2:CE:89:5C:4C:C6:48');assert.ok(rootCertificates.some(p=>{const r=new X509Certificate(p);return ca.issuer===r.subject&&ca.verify(r.publicKey);}));assert.ok(Date.parse(ca.validTo)>Date.now());
 for(const u of ['http://cgsse.it/','https://cgsse.it.evil.test/','https://user:password@cgsse.it/','https://cgsse.it:444/'])assert.throws(()=>canonicalCgsseUrl(u));assert.equal(canonicalCgsseUrl('https://www.cgsse.it/calendario-scioperi/x'),'https://cgsse.it/calendario-scioperi/x');
 assert.ok(fs.readFileSync(require.resolve('../lib/cgsseTls.ts'),'utf8').includes('rejectUnauthorized:true'));
});
test('official airport index follows actual backend page size and retains public document links',async()=>{
 let calls=0;const html=await fetchToscanaNotice('https://www.toscana-aeroporti.com/it/news/',Date.now()+5000,async(url,o)=>{assert.equal(url,'https://www.toscana-aeroporti.com/console/graphql');assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');const input=JSON.parse(o.body),page=input.variables.page;calls++;return Response.json({data:{articlesViewList:{results:[{...article,id:'id'+page,path:article.path+'-'+page}],pageInfo:{page,pageSize:1,total:2}}}});});assert.equal(calls,2);assert.match(html,/\/it\/news\/sciopero-16-ottobre-2026-1/);
});
test('public detail uses official body and publication date, with parser provenance and no script execution',async()=>{
 const html=await fetchToscanaNotice('https://www.toscana-aeroporti.com/it/news/sciopero-16-ottobre-2026',Date.now()+5000,async()=>Response.json({data:{route:{entity:{...article,body:{processed:article.body.processed+'<script>alert(1)</script>'}}}}}));assert.match(html,/article:published_time/);assert.ok(!html.includes('<script'));const notices=parseExternalNotices(html,'https://www.toscana-aeroporti.com/it/news/sciopero-16-ottobre-2026',['2026-10-16']);assert.ok(notices.length);assert.equal(notices[0].source.authority,'official');assert.equal(notices[0].date,'2026-10-16');
});
test('old official airport articles cannot be reused as this year strike notices',()=>{
 const a={...article,title:'Sciopero 16 ottobre 2025',created:{time:'2025-10-05T12:00:00Z'},body:{processed:article.body.processed.replace('2026','2025')}};
 assert.equal(parseExternalNotices(renderToscanaArticle(a),'https://www.toscana-aeroporti.com/it/news/old',['2026-10-16']).length,0);
});
test('airport schema errors, incomplete/duplicated pagination and mismatched identities fail explicitly',async()=>{
 for(const data of [{errors:[{message:'unknown field'}]},{data:{articlesViewList:{results:[],pageInfo:{page:0,pageSize:6,total:1}}}},{data:{articlesViewList:{results:[article,article],pageInfo:{page:0,pageSize:6,total:2}}}}])await assert.rejects(fetchToscanaNotice('https://www.toscana-aeroporti.com/it/news/',Date.now()+5000,async()=>Response.json(data)));
 await assert.rejects(fetchToscanaNotice('https://www.toscana-aeroporti.com/it/news/other',Date.now()+5000,async()=>Response.json({data:{route:{entity:article}}})),/Mismatched/);
 await assert.rejects(fetchToscanaNotice('https://evil.test/it/news/',Date.now()+5000));
});
