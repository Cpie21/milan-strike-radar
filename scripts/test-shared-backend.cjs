const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
process.env.TS_NODE_COMPILER_OPTIONS=JSON.stringify({module:'CommonJS',moduleResolution:'node',jsx:'react-jsx'});require('ts-node/register/transpile-only');
const {PGlite}=require('@electric-sql/pglite');
const {readBoundedJson,BodyError}=require('../lib/apiGuard');
const {wallSlots,cleanStrokes,parseWallKey}=require('../lib/graffiti');
const {isIsoDate}=require('../lib/romeDate');
test('bounded JSON rejects oversized multibyte/chunked bodies, null, arrays and malformed data',async()=>{
 for(const body of ['null','[]','{','"hi"']) await assert.rejects(readBoundedJson(new Request('http://localhost',{method:'POST',body}),64),e=>e instanceof BodyError&&e.status===400);
 await assert.rejects(readBoundedJson(new Request('http://localhost',{method:'POST',body:JSON.stringify({query:'汉'.repeat(30)})}),80),e=>e.status===413);
 let cancelled=false;const chunks=[new Uint8Array(50),new Uint8Array(50)];
 const stream=new ReadableStream({pull(c){if(chunks.length)c.enqueue(chunks.shift());else c.close();},cancel(){cancelled=true;}});
 await assert.rejects(readBoundedJson(new Request('http://localhost',{method:'POST',body:stream,duplex:'half'}),80),e=>e.status===413);assert.equal(cancelled,true);
 assert.deepEqual(await readBoundedJson(new Request('http://localhost',{method:'POST',body:'{"query":"ok"}'}),80),{query:'ok'});
});
test('server geometry bounds a piece to its assigned panel plus five pixels, without accepting corrupted points',()=>{
 for(const mode of ['BUS','SUBWAY','TRAIN','AIRPORT']){
  const slots=wallSlots(mode);assert.ok(slots.length>=1&&slots.length<=2);
  const s=slots[0];const stroke={c:'#000000',w:1.5,p:[s.x-2,s.y,s.x+s.w+5,s.y+s.h+5]};
  assert.equal(cleanStrokes([stroke],'#FF4FA3',s)[0].c,'#FF4FA3');
  for(const p of [[s.x-6,s.y],[s.x,s.y-6],[s.x,Infinity],[s.x,'4'],[s.x,s.y,4]]) assert.equal(cleanStrokes([{...stroke,p}],'#FF4FA3',s),null);
  assert.equal(cleanStrokes([],'#FF4FA3',s),null);assert.equal(cleanStrokes([{...stroke,w:Infinity}],'#FF4FA3',s),null);
 }
 assert.ok(parseWallKey('doodled_MILANO|2026-10-09|BUS|','2026-10-06'));
 for(const key of ['doodled_UNKNOWN|2026-10-09|BUS|','doodled_MILANO|2026-02-31|BUS|','doodled_MILANO|2026-10-09|BUS|random','doodled_MILANO|2028-10-09|BUS|'])assert.equal(parseWallKey(key,'2026-10-06'),null);
 assert.equal(isIsoDate('2026-02-31'),false);
});
test('service database: atomic budgets, original-month settlement, shared limits, bounded refinements and moderated one-save walls',async t=>{
 const db=new PGlite();const q=async(sql,args=[])=> (await db.query(sql,args)).rows;const one=async(sql,args=[])=>(await q(sql,args))[0];
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;');
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261004221157_strike_semantic_review_budget.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261006081821_shared_backend_services.sql'),'utf8'));
  const reserve=(key,n=2000,purpose='ask')=>one('select reserve_ai_budget($1,$2,$3) ok',[purpose,key,n]).then(r=>r.ok);
  const settle=(key,n)=>one('select settle_ai_budget($1,$2) ok',[key,n]).then(r=>r.ok);
  const month=(await one("select date_trunc('month',now() at time zone 'UTC')::date::text m")).m;
  const charge=async()=>Number((await one('select charged_micro_usd n from ai_monthly_budget where month=$1',[month])).n);
  await t.test('reservation duplicates never authorize another call; settlement refunds once',async()=>{
   assert.equal(await reserve('test:original'),true);assert.equal(await reserve('test:original'),false);assert.equal(await charge(),2000);
   assert.equal(await settle('test:original',200),true);assert.equal(await settle('test:original',200),false);assert.equal(await charge(),200);
   assert.equal(await reserve('test:translate',2000,'translate'),false);assert.equal(await reserve('test:large',2001),false);assert.equal(await settle('test:missing',0),false);
  });
  await t.test('missing usage retains charge, past-month reservations settle their own ledger',async()=>{
   assert.equal(await reserve('test:unknown'),true);assert.equal(await settle('test:unknown',null),false);assert.equal(await charge(),2200);
   await db.exec("insert into ai_monthly_budget(month,charged_micro_usd) values('2025-12-01',2000);insert into ai_budget_reservations(call_key,purpose,budget_month,reserved_micro_usd) values('test:past','ask','2025-12-01',2000);");
   await settle('test:past',20);assert.equal(Number((await one("select charged_micro_usd n from ai_monthly_budget where month='2025-12-01'")).n),20);assert.equal(await charge(),2200);
  });
  await t.test('all callers share hard cap; unknown charges stand; unexpected spend disables paid work',async()=>{
   await db.query('update ai_monthly_budget set charged_micro_usd=197000 where month=$1',[month]);
   const outcomes=await Promise.all([reserve('test:racer-a'),reserve('test:racer-b')]);assert.equal(outcomes.filter(Boolean).length,1);assert.equal(await charge(),199000);
   assert.equal(await reserve('test:other'),false);
   await settle(outcomes[0]?'test:racer-a':'test:racer-b',2500);assert.equal(await charge(),199500);
   assert.equal((await one('select disabled from ai_monthly_budget where month=$1',[month])).disabled,true);assert.equal(await reserve('test:stopped',1),false);
   assert.equal((await one('select decision from reserve_strike_semantic_review($1,100)',['c'.repeat(64)])).decision,'budget');
  });
  await t.test('shared minute limiter does not reset on another function instance',async()=>{
   for(let i=0;i<10;i++)assert.equal((await one("select consume_api_limit('ask',$1) ok",['a'.repeat(64)])).ok,i<8);
   await db.exec("update api_rate_limits set window_start=now()-interval '2 minutes'");assert.equal((await one("select consume_api_limit('ask',$1) ok",['a'.repeat(64)])).ok,true);
  });
  const subject='b'.repeat(64),hash='c'.repeat(64);
  const acquire=async(id=randomUUID(),refine=null,who=subject)=> (await one('select acquire_ask_session($1,$2,$3,$4) result',[who,hash,id,refine])).result;
  const finish=async(id,request,outcome)=> (await one('select finish_ask_session($1,$2,$3) ok',[id,request,outcome])).ok;
  await t.test('in-flight questions hold quota, failed/refused questions release, answered counts once',async()=>{
   const sessions=await Promise.all(Array.from({length:13},()=>acquire()));assert.equal(sessions.filter(s=>s.id).length,12);assert.equal(sessions[12].error,'daily_limit');
   const id=sessions[0].id;assert.equal(await finish(id,id,'released'),true);assert.ok((await acquire()).id);
   assert.equal(await finish(sessions[1].id,sessions[1].id,'answered'),true);assert.equal(await finish(sessions[1].id,sessions[1].id,'released'),false);assert.equal((await acquire()).error,'daily_limit');
   await db.exec("update ask_sessions set expires_at=now()-interval '1 minute' where state='pending'");assert.ok((await acquire()).id);
  });
  await t.test('refinements bind person/query, expire and have at most three follow-ups',async()=>{
   const who='d'.repeat(64);const session=await acquire(randomUUID(),null,who);let rid=session.id;
   assert.equal(await finish(session.id,rid,'clarify'),true);
   assert.equal((await acquire(randomUUID(),session.id,'e'.repeat(64))).error,'invalid_refinement');
   for(let i=0;i<3;i++){rid=randomUUID();assert.equal((await acquire(rid,session.id,who)).id,session.id);assert.equal((await acquire(randomUUID(),session.id,who)).error,'invalid_refinement');assert.equal(await finish(session.id,rid,'clarify'),true);}
   assert.equal((await acquire(randomUUID(),session.id,who)).error,'invalid_refinement');
   const expired=await acquire(randomUUID(),null,who);await finish(expired.id,expired.id,'clarify');await db.query("update ask_sessions set expires_at=now()-interval '1 minute' where id=$1",[expired.id]);assert.equal((await acquire(randomUUID(),expired.id,who)).error,'invalid_refinement');
  });
  await t.test('panels are atomic, occupied claims are protected, a saved piece cannot be overwritten',async()=>{
   const claim=(person)=>one("select claim_graffiti_panel('test-wall-2026-10-09',$1,'#FF4FA3',2) v",[person]).then(r=>r.v);
   const [a,b]=await Promise.all([claim('1'.repeat(32)),claim('2'.repeat(32))]);assert.notEqual(a.slot,b.slot);
   assert.equal((await claim('3'.repeat(32))).error,'wall_busy');
   const draw=JSON.stringify([{c:'#FF4FA3',w:1.5,p:[30,60,40,60]}]);
   const save=()=>one("select save_graffiti_piece('test-wall-2026-10-09',$1,$2) v",['1'.repeat(32),draw]).then(r=>r.v);
   const results=await Promise.all([save(),save()]);assert.equal(results.filter(v=>v==='saved').length,1);
   assert.equal((await one("select approved from lab_graffiti where holder=$1",['1'.repeat(32)])).approved,false);
   assert.ok(Number.isInteger((await claim('3'.repeat(32))).slot));assert.equal((await claim('1'.repeat(32))).done,true);
   assert.equal(await save(),'already_painted_or_no_claim');
   assert.equal((await one("select save_graffiti_piece('test-wall-2026-10-09',$1,'[]') v",['3'.repeat(32)])).v,'bad_strokes');
  });
  await t.test('anonymous clients cannot read private data or call protected functions; service role can',async()=>{
   await db.exec('set role anon');for(const name of ['ask_feedback','ask_sessions','lab_graffiti','ai_budget_reservations','api_rate_limits'])await assert.rejects(q(`select * from ${name}`),/permission denied/);
   await assert.rejects(reserve('test:anonymous'),/permission denied/);await assert.rejects(q("select consume_api_limit('ask',$1)",['a'.repeat(64)]),/permission denied/);await db.exec('reset role');
   await db.exec('set role service_role');await db.exec("insert into ask_feedback(rating,query) values('good','test');");assert.equal((await one('select count(*)::int n from ask_feedback')).n,1);await db.exec('reset role');
  });
 }finally{await db.close();}
});
test('every Jev call fails closed on budget failure and settles known usage including malformed decisions',async()=>{
 const queryModule=require('../lib/strikeQuery');const priorDb=queryModule.serverDatabase,priorFetch=global.fetch,priorKey=process.env.OPENROUTER_API_KEY,priorReviewKey=process.env.STRIKE_REVIEW_API_KEY;
 const {decide}=require('../lib/ask/jev');let paid=0,allowed=false,dbFailed=false,cost=.0002,malformed=false;const settlements=[];
 queryModule.serverDatabase=()=>({rpc:async(name,args)=>{
  if(name==='reserve_ai_budget')return dbFailed?{error:{code:'PGRST202'}}:{data:allowed,error:null};
  settlements.push(args);return {data:true,error:null};
 }});
 process.env.OPENROUTER_API_KEY='mock-never-transmitted';delete process.env.STRIKE_REVIEW_API_KEY;
 const questions={relevant:{type:'noul',instructions:'Relevant?'}};
 global.fetch=async(url,options)=>{paid++;const request=JSON.parse(options.body);assert.equal(request.model,'typesafe/jev-1.13');return Response.json({answers:{relevant:{type:'noul',noul:malformed?1.2:.8}},usage:cost===null?{}:{cost}});};
 try{
  await assert.rejects(decide({},questions),e=>e.reason==='BUDGET_EXHAUSTED');assert.equal(paid,0);
  dbFailed=true;await assert.rejects(decide({},questions),e=>e.reason==='UNAVAILABLE');assert.equal(paid,0);
  dbFailed=false;allowed=true;assert.equal((await decide({},questions)).cost,.0002);assert.equal(settlements[0].actual_micro_usd,200);
  delete process.env.OPENROUTER_API_KEY;process.env.STRIKE_REVIEW_API_KEY='mock-existing-key';
  cost=null;await decide({},questions);assert.equal(settlements.length,1);
  cost=.0003;malformed=true;await assert.rejects(decide({},questions),/Invalid probability/);assert.equal(settlements.length,2);assert.equal(settlements[1].actual_micro_usd,300);
  const {reserveAiBudget}=require('../lib/aiBudget');assert.equal((await reserveAiBudget('translate','disabled-test',100)).reason,'TRANSLATION_DISABLED');
 }finally{queryModule.serverDatabase=priorDb;global.fetch=priorFetch;if(priorKey===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=priorKey;if(priorReviewKey===undefined)delete process.env.STRIKE_REVIEW_API_KEY;else process.env.STRIKE_REVIEW_API_KEY=priorReviewKey;}
});
test('API routes reject malformed/oversized payloads before touching the database and report failures truthfully',async()=>{
 const {NextRequest}=require('next/server');const queryModule=require('../lib/strikeQuery');const priorDb=queryModule.serverDatabase,priorSecret=process.env.FEEDBACK_RATE_LIMIT_SECRET;
 let dbCalls=0;queryModule.serverDatabase=()=>{dbCalls++;return {rpc:async()=>({error:{code:'unavailable'}})};};process.env.FEEDBACK_RATE_LIMIT_SECRET='test-secret';
 const routes=[require('../app/api/ask/route'),require('../app/api/ask/feedback/route'),require('../app/api/doodles/wall/route')];
 const post=(body)=>new NextRequest('http://localhost',{method:'POST',body});
 try{
  for(const route of routes){assert.equal((await route.POST(post('null'))).status,400);assert.equal((await route.POST(post('x'.repeat(41000)))).status,413);}
  assert.equal(dbCalls,0);
  assert.equal((await routes[0].POST(post(JSON.stringify({query:'Tomorrow metro?',hints:{modes:['SHIP']}})))).status,400);
  assert.equal((await routes[0].POST(post(JSON.stringify({query:'Tomorrow metro?',hints:{date:'2026-02-31'}})))).status,400);
  const feedback=await routes[1].POST(post(JSON.stringify({rating:'bad',query:'Test',city:'MILANO'})));assert.equal(feedback.status,503);assert.deepEqual(await feedback.json(),{ok:false,error:'not_stored'});
 }finally{queryModule.serverDatabase=priorDb;if(priorSecret===undefined)delete process.env.FEEDBACK_RATE_LIMIT_SECRET;else process.env.FEEDBACK_RATE_LIMIT_SECRET=priorSecret;}
});
