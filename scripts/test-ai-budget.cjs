const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const {test}=require('node:test');
function gate(reply){const calls=[];const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(require.resolve('../lib/aiBudget.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({serverDatabase:()=>({rpc:async(name,args)=>{calls.push({name,args});if(reply instanceof Error)throw reply;return reply;}})}),mod,mod.exports);return {...mod.exports,calls};}
test('only explicit successful ledger reservation authorizes a paid call',async()=>{
 for(const reply of [{data:false,error:null},{data:null,error:null},{data:'true',error:null},{data:true,error:{code:'PGRST202'}},new Error('network')])assert.equal((await gate(reply).reserveAiBudget('ask','k',100)).ok,false);
 const g=gate({data:true,error:null});{const r=await g.reserveAiBudget('ask','k',100.5);assert.deepEqual([r.ok,r.metered,r.key],[true,true,'k']);}assert.equal(g.calls[0].args.reserve_micro_usd,101);
 assert.equal((await gate({data:false,error:null}).reserveAiBudget('ask','k',100)).reason,'BUDGET_EXHAUSTED');
 assert.equal((await gate(new Error('db')).reserveAiBudget('ask','k',100)).reason,'UNAVAILABLE');
});
test('translation never reserves paid budget even with a working ledger',async()=>{
 const g=gate({data:true,error:null});assert.equal((await g.reserveAiBudget('translate','k',100)).reason,'TRANSLATION_DISABLED');assert.equal(g.calls.length,0);
});
test('invalid reservations and settlements cannot release or bypass the cost guard',async()=>{
 const g=gate({data:true,error:null});for(const cost of [0,-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.equal((await g.reserveAiBudget('ask','k',cost)).reason,'INVALID_RESERVATION');assert.equal(g.calls.length,0);
 const r={ok:true,metered:true,key:'k'};for(const cost of [null,-1,NaN,Infinity])await g.settleAiBudget(r,cost);assert.equal(g.calls.length,0);
 await g.settleAiBudget(r,0.001);assert.deepEqual(g.calls[0],{name:'settle_ai_budget',args:{call_key:'k',actual_micro_usd:1000}});
});

// Without the RPC, the reservation is a compare-and-set on the shared ledger row.
function ledger(row, rpcCode = 'PGRST202') {
  const state = { ...row, updates: 0 };
  const table = () => {
    const q = { _f: {} };
    q.upsert = async () => ({ error: null });
    q.select = () => q;
    q.eq = (k, v) => { q._f[k] = v; return q; };
    q.maybeSingle = async () => ({ data: { charged_micro_usd: state.charged_micro_usd, disabled: state.disabled }, error: null });
    q.update = patch => { q._patch = patch; return q; };
    const run = async () => {
      if (q._patch && q._f.charged_micro_usd === state.charged_micro_usd) { Object.assign(state, q._patch); state.updates++; return { data: [{ month: 'm' }], error: null }; }
      return { data: [], error: null };
    };
    q.then = (res, rej) => run().then(res, rej);
    return q;
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(require.resolve('../lib/aiBudget.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => ({ serverDatabase: () => ({ rpc: async () => ({ data: null, error: { code: rpcCode } }), from: table }) }), mod, mod.exports);
  return { ...mod.exports, state };
}
test('missing RPC: reservations go to the shared ledger row, capped, and settle back', async () => {
  const l = ledger({ charged_micro_usd: 1000, disabled: false });
  const r = await l.reserveAiBudget('ask', 'k', 18000);
  assert.equal(r.ok, true); assert.equal(l.state.charged_micro_usd, 19000);
  await l.settleAiBudget(r, 0.0002);
  assert.equal(l.state.charged_micro_usd, 1200);
  const full = ledger({ charged_micro_usd: 195000, disabled: false });
  assert.equal((await full.reserveAiBudget('ask', 'k', 18000)).reason, 'BUDGET_EXHAUSTED');
  assert.equal(full.state.updates, 0);
  assert.equal((await ledger({ charged_micro_usd: 0, disabled: true }).reserveAiBudget('ask', 'k', 10)).reason, 'BUDGET_EXHAUSTED');
  assert.equal((await ledger({ charged_micro_usd: 0, disabled: false }, 'XX000').reserveAiBudget('ask', 'k', 10)).reason, 'UNAVAILABLE');
});
