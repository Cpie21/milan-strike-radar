const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const requireMock = id => Object.hasOwn(mocks, id) ? mocks[id] : require(id);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: requireMock, console, process, Buffer, URL, Response, ReadableStream, TextEncoder, ...globals }, { filename: file });
  return module.exports;
}
const contract = load('lib/analyticsContract.ts');
const id = '11111111-1111-4111-8111-111111111111';
const distinct = '22222222-2222-4222-8222-222222222222';
const analytics = { requestId: id, distinctId: distinct, sessionId: distinct, isTest: true };
const understanding = { query: 'PRIVATE QUESTION', intent: 'period_check', scopeBy: 'rule', cityBy: 'default', modes: [{ mode: 'TRAIN', by: 'rule' }], fallback: false, lines: ['PRIVATE LINE'], assumptions: [] };
const result = { kind: 'result', view: 'period', level: 'clear', understanding, matches: [], excluded: [], unchecked: 2, days: [{ date: '2026-10-09', items: [{}, {}] }], checked: { cities: ['MILANO'], modes: ['TRAIN'] }, cost: 0.00001, lastSync: 'x' };
test('only validated anonymous UUID context crosses to server; no raw input or tokens', () => {
  assert.equal(contract.readAnalyticsContext({ ...analytics, distinctId: 'someone@example.com' }), null);
  assert.equal(contract.readAnalyticsContext({ ...analytics, requestId: 'query' }), null);
  assert.equal(contract.readAnalyticsContext(null), null);
  const value = contract.readAnalyticsContext({ ...analytics, query: 'secret', sessionId: 'invalid', isTest: 'true' });
  assert.equal(value.isTest, false); assert.equal(value.sessionId, undefined); assert.equal(value.query, undefined);
});
test('period, clarification and uncertain result telemetry preserve counts without prompts, line names or itineraries', () => {
  const p = contract.askResultProperties(result);
  assert.equal(p.strike_day_count, 1); assert.equal(p.period_item_count, 2); assert.equal(p.unchecked_count, 2);
  assert.equal(p.match_count, 0); assert.equal(p.date_method, 'rule');
  assert.ok(!JSON.stringify(p).includes('PRIVATE'));
  assert.equal(contract.askResultProperties({ kind: 'clarify', missing: 'date', understanding }).missing, 'date');
  const s = contract.stageProperties({ id: 'understand', ms: 50, facts: [{ label: 'query', value: 'PRIVATE', by: 'jev', p: .4 }] });
  assert.equal(s.low_confidence_fact_count, 1); assert.ok(!JSON.stringify(s).includes('PRIVATE'));
});
test('SDK URL and nested initial person properties remove private query, fragment and raw content', () => {
  const p = contract.scrubSdkProperties({ '$current_url': 'https://www.theitalystrike.com/?query=private&date=2026-10-09&utm_source=instagram#secret', query: 'private', answer: { secret: true }, '$set_once': { '$initial_referrer': 'https://example.com/?email=private' } });
  assert.equal(p.$current_url, 'https://www.theitalystrike.com/?utm_source=instagram');
  assert.equal(p.$set_once.$initial_referrer, 'https://example.com/'); assert.ok(!JSON.stringify(p).includes('private'));
});
function harness({ limit = 'allowed', failFinish = false, failStore = false, sdkFails = false, run } = {}) {
  const tasks = [], sent = [], calls = [];
  class MockPostHog {
    capture(e) { if (sdkFails) throw new Error('offline'); sent.push(e); }
    async flush() {} async shutdown() {}
  }
  const previous = { key: process.env.NEXT_PUBLIC_POSTHOG_KEY, env: process.env.VERCEL_ENV };
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'public-project-mock'; process.env.VERCEL_ENV = 'production';
  const telemetry = load('lib/serverAnalytics.ts', { 'next/server': { after: callback => tasks.push(callback) }, 'posthog-node': { PostHog: MockPostHog }, './analyticsContract': contract });
  class BodyError extends Error {}
  const guard = { BodyError, readBoundedJson: request => request.json(), objectRecord: a => !!a && typeof a === 'object' && !Array.isArray(a), requestIdentity: () => 'private-hmac', privateHash: () => 'private-query-hash', sharedLimit: async () => limit };
  const db = { rpc: async (name) => { calls.push(name); return name === 'acquire_ask_session' ? { data: { id }, error: null } : { data: !failFinish, error: null }; }, from: () => ({ insert: async () => ({ error: failStore ? { code: 'unavailable' } : null }) }) };
  const mocks = { 'next/server': { NextResponse }, '../../../lib/cities': { resolveCity: city => ({ tag: city }) }, '../../../lib/romeDate': { isIsoDate: () => true }, '../../../lib/ask/pipeline': { runAsk: run ?? (async (q, city, hints, send) => { send({ id: 'understand', ms: 1, facts: [] }); return result; }) }, '../../../lib/aiBudget': { AiBudgetError: class extends Error {} }, '../../../lib/apiGuard': guard, '../../../lib/strikeQuery': { serverDatabase: () => db }, '../../../lib/serverAnalytics': telemetry, '../../../lib/analyticsContract': contract };
  const route = load('app/api/ask/route.ts', mocks);
  const feedback = load('app/api/ask/feedback/route.ts', { 'next/server': { NextResponse }, '../../../../lib/serverAnalytics': telemetry, '../../../../lib/analyticsContract': contract, '../../../../lib/cities': mocks['../../../lib/cities'], '../../../../lib/apiGuard': guard, '../../../../lib/strikeQuery': mocks['../../../lib/strikeQuery'] });
  const post = body => new NextRequest('https://www.theitalystrike.com/api/ask', { method: 'POST', body: JSON.stringify(body) });
  return { route, feedback, post, sent, calls, telemetry, flush: async () => { for (const task of tasks.splice(0)) await task(); }, restore: () => { for (const [k,v] of Object.entries({ NEXT_PUBLIC_POSTHOG_KEY: previous.key, VERCEL_ENV: previous.env })) if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
}
test('server completion, stages and browser correlation are emitted once after stream; no raw question', async () => {
  const h = harness(); try {
    const response = await h.route.POST(h.post({ query: 'PRIVATE QUESTION', analytics }));
    const stream = await response.text(); assert.ok(stream.includes('"type":"final"')); assert.equal(h.sent.length, 0);
    await h.flush();
    assert.deepEqual(h.sent.map(e => e.event), ['ai_query_started', 'ai_stage_completed', 'ai_query_completed']);
    assert.ok(h.sent.every(e => e.properties.request_id === id && e.distinctId === distinct));
    assert.ok(!JSON.stringify(h.sent).includes('PRIVATE')); assert.ok(h.sent.every(e => e.properties.is_test));
  } finally { h.restore(); }
});
test('limits and finalization failures never masquerade as completions', async () => {
  for (const limited of [true, false]) {
    const h = harness(limited ? { limit: 'limited' } : { failFinish: true }); try {
      const response = await h.route.POST(h.post({ query: 'test', analytics })); const text = await response.text(); await h.flush();
      assert.equal(response.status, limited ? 429 : 200); assert.ok(text.includes(limited ? 'rate_limited' : '"type":"error"'));
      assert.equal(h.sent.at(-1).event, limited ? 'ai_query_rejected' : 'ai_query_failed'); assert.ok(!h.sent.some(e => e.event === 'ai_query_completed'));
    } finally { h.restore(); }
  }
});
test('a disconnected browser is distinguished from successfully finished server work', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const h = harness({ run: async () => { await gate; return result; } }); try {
    const response = await h.route.POST(h.post({ query: 'test', analytics })); await response.body.cancel(); finish();
    await new Promise(resolve => setImmediate(resolve)); await h.flush();
    assert.equal(h.sent.find(e => e.event === 'ai_query_completed').properties.client_disconnected, true);
    assert.ok(h.sent.some(e => e.event === 'ai_client_disconnected'));
  } finally { h.restore(); }
});
test('feedback storage truth and SDK outages remain separate; missing consent context emits nothing', async () => {
  for (const failStore of [true, false]) {
    const h = harness({ failStore }); try {
      const response = await h.feedback.POST(h.post({ query: 'PRIVATE', rating: 'bad', reason: 'missing', analytics })); await h.flush();
      assert.equal(response.status, failStore ? 503 : 200); assert.equal(h.sent[0].event, failStore ? 'ai_feedback_store_failed' : 'ai_feedback_stored');
      assert.ok(!JSON.stringify(h.sent).includes('PRIVATE'));
    } finally { h.restore(); }
  }
  const h = harness({ sdkFails: true }); try {
    const response = await h.route.POST(h.post({ query: 'test', analytics })); assert.ok((await response.text()).includes('"type":"final"')); await h.flush();
    const optOut = h.telemetry.requestAnalytics(null); optOut.capture('ai_query_started'); optOut.flush(); await h.flush(); assert.equal(h.sent.length, 0);
  } finally { h.restore(); }
});
test('legacy once semantics work with unavailable storage; preview and opted-out visitors do not send', () => {
  let count = 0, optedOut = false;
  const storage = new Map();
  const sdk = { has_opted_out_capturing: () => optedOut, capture: () => { count++; return {}; }, get_distinct_id: () => distinct, get_session_id: () => distinct };
  const globals = { window: { location: { hostname: 'www.theitalystrike.com' } }, navigator: { userAgent: 'test' }, sessionStorage: { getItem: () => null }, localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) } };
  const prev = process.env.NEXT_PUBLIC_POSTHOG_KEY; process.env.NEXT_PUBLIC_POSTHOG_KEY = 'public-mock';
  try {
    const client = load('utils/analytics.ts', { 'posthog-js': sdk, '../lib/analyticsContract': contract }, globals);
    client.captureOnce('Widgets_tutorial_success'); client.captureOnce('Widgets_tutorial_success'); assert.equal(count, 1);
    optedOut = true; client.capture('share_intent_clicked'); assert.equal(count, 1); assert.equal(client.analyticsContext(id), null);
    optedOut = false; globals.window.location.hostname = 'localhost'; client.capture('share_intent_clicked'); assert.equal(count, 1);
    globals.window.location.hostname = 'www.theitalystrike.com'; globals.localStorage.getItem = () => { throw new Error('blocked'); }; globals.localStorage.setItem = globals.localStorage.getItem;
    client.captureOnce('CalendarSync_tutorial_success'); assert.equal(count, 2);
  } finally { if (prev === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY; else process.env.NEXT_PUBLIC_POSTHOG_KEY = prev; }
});
