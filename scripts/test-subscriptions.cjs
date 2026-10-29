const fs = require('node:fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { calendarSubscriptionUrl, calendarTypes } = require('../lib/subscriptions.ts');
const { buildLabWidgetScript } = require('../lib/lab/widgetScript.ts');
const { buildWidgetScript } = require('../lib/widgetScript.ts');

test('subscription links are public, preserve city and selected modes, and reject empty/invalid filters', () => {
  for (const region of ['MILANO', 'ROMA', 'FIRENZE']) {
    for (const protocol of ['https', 'webcal']) {
      const url = new URL(calendarSubscriptionUrl(region, ['TRAIN', 'AIRPORT'], protocol));
      assert.equal(url.hostname, 'www.theitalystrike.com');
      assert.equal(url.protocol, protocol + ':');
      assert.equal(url.searchParams.get('region'), region);
      assert.equal(url.searchParams.get('types'), 'train,airport');
    }
  }
  assert.equal(calendarTypes(null).size, 4);
  assert.deepEqual([...calendarTypes(' TRAIN,airport ')], ['train', 'airport']);
  for (const value of ['', 'plane', 'train,', 'invalid']) assert.equal(calendarTypes(value), null);
});

// Execute the actual generated source against a small Scriptable API model.
// Rendering calls are recorded; this does not claim native iOS verification.
async function runWidget(code, records, { at = '2026-10-24T21:30:00Z', status = 200, offline = false, family = 'medium', fresh = true, sourceTime = at, cache = new Map() } = {}) {
  const texts = [], dots = [], requests = [];
  class Node {
    addStack() { return new Node(); }
    addText(value) { texts.push(value); return {}; }
    addImage() { return {}; }
    addSpacer() {}
    layoutHorizontally() {}
    layoutVertically() {}
    centerAlignContent() {}
    topAlignContent() {}
    setPadding() {}
    presentMedium() { throw new Error('must not present a preview while running as a widget'); }
    set backgroundColor(value) { dots.push(value.hex); }
  }
  class Color { constructor(hex) { this.hex = hex; } }
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [at])); }
    static now() { return Date.parse(at); }
    getTimezoneOffset() { return -480; } // a phone set to China
    getHours() { return (this.getUTCHours() + 8) % 24; }
  }
  let widget, completed = false;
  const context = {
    Date: Clock, Intl, console, Color, ListWidget: Node,
    config: { widgetFamily: family, runsInApp: false },
    Request: class { constructor(url) { requests.push(this); this.url = url; this.response = { statusCode: status }; } async loadString() { if (offline) throw new Error('offline'); return JSON.stringify({ version: 1, region: 'MILANO', fresh, lastSuccessfulSync: sourceTime, data: records }); } },
    FileManager: { local: () => ({ documentsDirectory: () => '/documents', joinPath: (dir, name) => dir + '/' + name, fileExists: path => cache.has(path), readString: path => cache.get(path), writeString: (path, value) => cache.set(path, value) }) },
    Size: class {}, Rect: class {}, Point: class {}, LinearGradient: class {},
    Path: class { addRoundedRect() {} },
    DrawContext: class { constructor() { return new Proxy({}, { get: (_, name) => name === 'getImage' ? () => ({}) : () => {} }); } },
    Font: new Proxy({}, { get: () => () => ({}) }),
    SFSymbol: { named: () => ({ image: {} }) }, Device: { screenSize: () => ({ width: 390 }) },
    Script: { setWidget: w => { widget = w; }, complete: () => { completed = true; } },
  };
  await vm.runInNewContext(`(async () => { ${code}\n })()`, context);
  assert.equal(completed, true);
  assert.ok(widget.refreshAfterDate instanceof Date);
  assert.equal(new URL(widget.url).searchParams.get('from'), 'widget');
  assert.equal(requests[0].timeoutInterval, 15);
  return { texts, dots, cache };
}
const labels = { titleMap: { SUBWAY: 'Metro strike' }, fallbackTitle: 'Strike', todayStrike: 'Strikes', safeTravel: 'All clear', noStrikeToday: 'No strikes today', dataError: 'Data error' };
const labCode = (types = ['SUBWAY'], lang = 'en') => buildLabWidgetScript({ origin: 'https://www.theitalystrike.com', region: 'MILANO', types, cityName: 'Milan', path: '/', lang });
const legacyCode = () => buildWidgetScript({ targetOrigin: 'https://www.theitalystrike.com', normalizedRegion: 'MILANO', typesJson: '["SUBWAY"]', regionLabel: 'Milan', widgetLabelsJson: JSON.stringify(labels), regionPagePath: '/' });
const record = (extra = {}) => ({ date: '2026-10-24', category: 'SUBWAY', status: 'CONFIRMED', strike_windows: [{ start: '08:45', end: '15:00' }], ...extra });

test('both widget sources use Rome today on a phone in China, including the DST boundary', async () => {
  for (const code of [labCode(), legacyCode()]) {
    const result = await runWidget(code, [record()]);
    assert.ok(!result.texts.includes('No strikes today'));
    const cancelled = await runWidget(code, [record({ status: 'CANCELLED' })]);
    assert.ok(cancelled.texts.includes('No strikes today'));
    // 00:30 Rome on the DST transition Sunday; still the previous UTC day.
    const next = await runWidget(code, [record({ date: '2026-10-25' })], { at: '2026-10-24T22:30:00Z' });
    assert.ok(!next.texts.includes('No strikes today'));
    const afterDst = await runWidget(code, [record({ date: '2026-10-25' })], { at: '2026-10-25T01:30:00Z' });
    assert.ok(!afterDst.texts.includes('No strikes today'));
  }
});

test('legacy single-event indicator follows planned hours instead of always turning red', async () => {
  const later = await runWidget(legacyCode(), [record()], { at: '2026-10-24T04:00:00Z' });
  assert.ok(later.dots.includes('#FFEC20'));
  assert.ok(!later.dots.includes('#FF3B30'));
  const past = await runWidget(legacyCode(), [record()], { at: '2026-10-24T18:00:00Z' });
  assert.ok(past.dots.includes('#8C8C8C'));
});

test('lab widget never says all hours are over when an announcement or endpoint is unknown', async () => {
  for (const extra of [
    { has_unknown_timing: true },
    { strike_windows: [] },
    { timing_evidence: { windows: [{ start: '18:00', end: null, end_kind: 'end_of_service' }] } },
    { timing_evidence: { windows: [{ start: null, end: '15:00', end_kind: 'clock' }] } },
  ]) {
    const result = await runWidget(labCode(), [record(extra)]);
    assert.ok(result.texts.includes('Hours pending'));
    assert.ok(!result.texts.includes('Over'));
    assert.ok(!result.texts.includes('No strikes today'));
  }
});

test('small widget preserves real line breaks for two windows', async () => {
  const r = await runWidget(labCode(), [record({ strike_windows: [{ start: '08:45', end: '15:00' }, { start: '18:00', end: '24:00' }] })], { family: 'small' });
  assert.ok(r.texts.some(t => t.includes('15:00\n18:00')));
});

test('widget HTTP failures, malformed responses and offline requests never become an all-clear day', async () => {
  for (const code of [labCode(), legacyCode()]) {
    for (const [records, options] of [[[], { status: 503 }], [{ error: 'unavailable' }, {}], [[], { offline: true }]]) {
      const result = await runWidget(code, records, options);
      assert.ok(result.texts.some(t => ['Data error', 'Can’t update right now'].includes(t)));
      assert.ok(!result.texts.includes('No strikes today'));
    }
  }
});

let today = '2026-10-24', queryStart, failRead = false;
let rows = [record({ id: 'id-1', region: 'MILANO' }), record({ id: 'id-2', date: '2026-10-23', region: 'MILANO', status: 'CANCELLED' })];
const queryPath = require.resolve('../lib/strikeQuery.ts');
require.cache[queryPath] = { id: queryPath, filename: queryPath, loaded: true, exports: { romeToday: () => today, readCityStrikes: async (_, since) => { queryStart = since; if (failRead) throw new Error('unavailable'); return rows; } } };
const { GET } = require('../app/api/calendar/route.ts');
const unfold = text => text.replace(/\r\n[ \t]/g, '');

test('real postponed strike cancels the same calendar UID, explains postponement and clears old hours', async () => {
  const { transformRows } = require('../lib/strikeSync.ts');
  const { general } = require('./fixtures/mit-usb-postponement.json');
  const saved = rows;
  try {
    rows = await transformRows([{ ...general, note: '' }]);
    const before = unfold(await (await GET(new Request('https://example.test/api/calendar?region=MILANO&types=train'))).text());
    rows = await transformRows([general]);
    const after = unfold(await (await GET(new Request('https://example.test/api/calendar?region=MILANO&types=train'))).text());
    assert.deepEqual(after.match(/^UID:.+$/gm), before.match(/^UID:.+$/gm));
    assert.equal((after.match(/STATUS:CANCELLED/g) || []).length, 2);
    assert.match(after, /SUMMARY:\[已延期 · 新日期待公布\]/);
    assert.match(after, /状态依据: ORDINANZA MINISTERIALE N. 204 T DI DIFFERIMENTO/);
    assert.doesNotMatch(after, /罢工时段: 21:00/);
  } finally { rows = saved; }
});

test('calendar retains recent events/cancellations across midnight with stable UIDs and valid all-day dates', async () => {
  const response = await GET(new Request('https://example.test/api/calendar?region=MILANO&types=subway'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/calendar/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(queryStart, '2026-09-24');
  const text = await response.text(), first = unfold(text);
  assert.match(first, /DTSTART;VALUE=DATE:20261024\r\nDTEND;VALUE=DATE:20261025/);
  assert.match(first, /STATUS:CANCELLED/);
  assert.match(first, /DTSTART;VALUE=DATE:20261023/);
  for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  today = '2026-10-25';
  const second = unfold(await (await GET(new Request('https://example.test/api/calendar?region=MILANO&types=subway'))).text());
  assert.deepEqual(first.match(/^UID:.+$/gm), second.match(/^UID:.+$/gm));
  assert.equal(queryStart, '2026-09-25');
  today = '2026-10-24';
});

test('calendar type filters, unsupported cities and sync failures return explicit errors without empty success', async () => {
  for (const params of ['types=', 'types=plane', 'region=UNKNOWN']) assert.equal((await GET(new Request('https://example.test/api/calendar?' + params))).status, 400);
  const filtered = unfold(await (await GET(new Request('https://example.test/api/calendar?types=train'))).text());
  assert.ok(!filtered.includes('BEGIN:VEVENT'));
  failRead = true;
  try {
    const failed = await GET(new Request('https://example.test/api/calendar'));
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get('cache-control'), 'no-store');
  } finally { failRead = false; }
});

test('both widgets keep a city-scoped disk snapshot through HTTP errors and midnight, with a visible delay instead of all clear', async () => {
  for (const code of [labCode(), legacyCode()]) {
    const first = await runWidget(code, [record()]);
    assert.equal(first.cache.size, 1);
    const saved = [...first.cache.values()][0];
    const second = await runWidget(code, [], { offline: true, at: '2026-10-25T10:00:00Z', cache: first.cache });
    assert.ok(second.texts.some(t => t.includes('Update delayed')));
    assert.ok(second.texts.some(t => t.includes('24/10')));
    assert.ok(!second.texts.includes('No strikes today'));
    assert.ok(!second.texts.includes('All clear'));
    assert.equal([...second.cache.values()][0], saved);
  }
});

test('server-delayed empty data cannot become no strikes; expired, future, wrong-city or corrupt cache is rejected', async () => {
  for (const code of [labCode(), legacyCode()]) {
    const delayed = await runWidget(code, [], { fresh: false });
    assert.ok(delayed.texts.some(t => t.includes('Update delayed')));
    assert.ok(!delayed.texts.includes('No strikes today'));
    const first = await runWidget(code, [record()]);
    const key = [...first.cache.keys()][0], saved = JSON.parse(first.cache.get(key));
    for (const value of [
      '{broken json',
      JSON.stringify({ ...saved, region: 'ROMA' }),
      JSON.stringify({ ...saved, lastSuccessfulSync: '2026-10-01T00:00:00Z' }),
      JSON.stringify({ ...saved, lastSuccessfulSync: '2030-01-01T00:00:00Z' }),
      JSON.stringify({ ...saved, data: [{}] }),
    ]) {
      const failed = await runWidget(code, [], { offline: true, cache: new Map([[key, value]]) });
      assert.ok(failed.texts.some(t => ['Data error', 'Can’t update right now'].includes(t)));
      assert.ok(!failed.texts.includes('No strikes today'));
    }
  }
});

require.cache[queryPath].exports.readSavedCityStrikeSnapshot = async (tag, since) => {
  queryStart = since;
  if (failRead) throw new Error('database offline');
  return { healthy: false, lastSuccessfulSync: '2026-10-24T07:41:23.985Z', records: rows };
};
const { GET: widgetGET } = require('../app/api/widget/route.ts');
test('widget API serves small saved notices with honest sync status while strict feeds retain their health gate', async () => {
  const response = await widgetGET(new Request('https://example.test/api/widget?region=MILANO'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.fresh, false);
  assert.equal(body.lastSuccessfulSync, '2026-10-24T07:41:23.985Z');
  assert.equal(body.region, 'MILANO');
  assert.ok(body.data.length);
  assert.equal(queryStart, '2026-10-23');
  assert.ok(body.data.every(row => !('raw_payload' in row) && !('lineImpacts' in row)));
  assert.equal((await widgetGET(new Request('https://example.test/api/widget?region=UNKNOWN'))).status, 400);
  failRead = true;
  try { assert.equal((await widgetGET(new Request('https://example.test/api/widget'))).status, 503); }
  finally { failRead = false; }
});
