const fs = require('node:fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const { buildRail, continuesOvernight, groupIdentical, overnightLine, relativeDay, skyFor, statusLine, segments } = require('../lib/lab/model.ts');

const card = (date, category, windows, extra = {}) => ({
  id: `${date}-${category}`, date, scope: '', category, status: 'CONFIRMED', provider: 'ATM', national: false, displayTime: '',
  windows, guarantees: [], guaranteeSource: 'UNKNOWN', guaranteeKind: 'GUARANTEED_SERVICE', lines: [], unknownTiming: false, confidence: 'official', sources: [], events: [], ...extra,
});
const clock = (start, end) => ({ start, end, end_kind: 'clock' });
const toEnd = start => ({ start, end: null, end_kind: 'end_of_service' });

test('calm stretches fold into one gap; event days, today and the selection stay', () => {
  const byDate = new Map([['2026-10-09', [card('2026-10-09', 'SUBWAY', [clock('08:45', '15:00')])]]]);
  const items = buildRail(byDate, '2026-10-04', '2026-10-12', '2026-10-04', '2026-10-04', new Set());
  assert.deepEqual(items.map(i => i.kind === 'fold' ? `${i.from}..${i.to}` : i.date), ['2026-10-04', '2026-10-05..2026-10-08', '2026-10-09', '2026-10-10..2026-10-12']);
  const opened = buildRail(byDate, '2026-10-04', '2026-10-12', '2026-10-04', '2026-10-04', new Set(['2026-10-05']));
  assert.equal(opened.filter(i => i.kind === 'day').length, 1 + 4 + 1 + 0);
});

test('a single calm day between events is shown, not folded', () => {
  const byDate = new Map([
    ['2026-10-09', [card('2026-10-09', 'BUS', [clock('08:45', '15:00')])]],
    ['2026-10-11', [card('2026-10-11', 'BUS', [clock('08:45', '15:00')])]],
  ]);
  const items = buildRail(byDate, '2026-10-09', '2026-10-11', '2026-10-01', '2026-10-09', new Set());
  assert.deepEqual(items.map(i => i.kind), ['day', 'day', 'day']);
});

test('every tile has one width: folds never cross a month, and month starts are flagged', () => {
  const items = buildRail(new Map(), '2026-10-30', '2026-11-03', '2026-10-30', '2026-10-30', new Set());
  assert.deepEqual(items.map(i => i.kind === 'fold' ? `${i.from}..${i.to}` : i.date), ['2026-10-30', '2026-10-31', '2026-11-01..2026-11-03']);
  assert.deepEqual(items.map(i => i.monthStart), [true, false, true]);
});

test('only a strike running through midnight joins two days', () => {
  const day1 = card('2026-12-03', 'TRAIN', [clock('21:00', '24:00')]);
  const day2 = card('2026-12-04', 'TRAIN', [clock('00:00', '21:00')]);
  assert.equal(continuesOvernight(day1, day2), true);
  assert.equal(continuesOvernight(card('2026-12-03', 'TRAIN', [clock('09:00', '17:00')]), day2), false);
  assert.equal(continuesOvernight(day1, { ...day2, status: 'CANCELLED' }), false);
  const rail = buildRail(new Map([['2026-12-03', [day1]], ['2026-12-04', [day2]]]), '2026-12-03', '2026-12-04', '2026-10-04', '2026-12-03', new Set());
  assert.equal(rail[0].joinNext, true);
  assert.equal(rail[1].joinPrev, true);
  assert.equal(rail[0].joinPrev, false);
});

test('status describes planned strike hours, never a live stoppage or a restart', () => {
  const metro = card('2026-10-09', 'SUBWAY', [clock('08:45', '15:00'), toEnd('18:00')]);
  assert.equal(statusLine(metro, '2026-10-09', 7 * 60).text, '08:45 起进入罢工时段');
  assert.equal(statusLine(metro, '2026-10-09', 10 * 60).text, '罢工时段内 · 至 15:00');
  assert.equal(statusLine(metro, '2026-10-09', 19 * 60).text, '罢工时段内 · 至运营结束');
  assert.equal(statusLine(metro, '2026-10-05', 10 * 60).text, '罢工时段 08:45–15:00、18:00–运营结束');
  assert.equal(statusLine({ ...metro, windows: [] }, '2026-10-09', 600).tone, 'pending');
  assert.equal(statusLine({ ...metro, status: 'CANCELLED' }, '2026-10-09', 600).text, '已取消');
});

test('the bar starts at first service and fades instead of inventing midnight', () => {
  const [seg] = segments([toEnd('18:00')]);
  assert.equal(seg.fade, true);
  assert.equal(Math.round((seg.left + seg.width) * 100), 100);
  const [night] = segments([clock('00:00', '08:45')]);
  assert.equal(night.left, 0);
  assert.equal(night.fromNight, true);
});

test('modes with the same schedule share one row; cancellations never merge', () => {
  const w = [clock('08:45', '15:00')];
  const groups = groupIdentical([card('d', 'SUBWAY', w), card('d', 'BUS', w), card('d', 'TRAIN', [clock('09:00', '17:00')])]);
  assert.deepEqual(groups.map(g => g.map(c => c.category)), [['SUBWAY', 'BUS'], ['TRAIN']]);
  const cancelled = groupIdentical([card('d', 'SUBWAY', w, { status: 'CANCELLED' }), card('d', 'BUS', w, { status: 'CANCELLED' })]);
  assert.equal(cancelled.length, 2);
});

test('an overnight strike is described as one span on both days', () => {
  const day1 = card('2026-12-03', 'TRAIN', [clock('21:00', '24:00')]);
  const day2 = card('2026-12-04', 'TRAIN', [clock('00:00', '21:00')]);
  assert.equal(overnightLine(day1, undefined, day2), '3日 21:00 → 4日 21:00 停运');
  assert.equal(overnightLine(day2, day1, undefined), '3日 21:00 → 4日 21:00 停运');
});

test('the sky follows the selected day and Rome night', () => {
  const strike = [card('2026-10-09', 'BUS', [clock('08:45', '15:00')])];
  assert.equal(skyFor([], 12 * 60), 'clear-day');
  assert.equal(skyFor(strike, 12 * 60), 'storm-day');
  assert.equal(skyFor(strike, 23 * 60), 'storm-night');
  assert.equal(skyFor([{ ...strike[0], status: 'CANCELLED' }], 23 * 60), 'clear-night');
});

test('relative day labels in both languages', () => {
  assert.equal(relativeDay('2026-10-09', '2026-10-04'), '5 天后');
  assert.equal(relativeDay('2026-10-05', '2026-10-04', 'en'), 'Tomorrow');
  assert.equal(relativeDay('2026-10-02', '2026-10-04'), '2 天前');
});

test('split windows read as one span with the break named', () => {
  const { timeSpan } = require('../lib/lab/model.ts');
  assert.deepEqual(timeSpan([toEnd('18:00'), clock('08:45', '15:00')]), { start: '08:45', end: null, breaks: [{ start: '15:00', end: '18:00' }] });
  assert.deepEqual(timeSpan([clock('09:00', '13:00')]), { start: '09:00', end: '13:00', breaks: [] });
  assert.equal(timeSpan([]), null);
});

test('operator quotes mark the hours they contain', () => {
  const { markTimes } = require('../lib/lab/model.ts');
  const parts = markTimes('Le linee potrebbero non essere garantite dalle 8:45 alle 15 e dopo le 18, fino al termine del servizio.');
  assert.deepEqual(parts.filter(p => p.mark).map(p => p.text), ['8:45', '15', '18', 'termine del servizio']);
  assert.equal(parts.map(p => p.text).join(''), 'Le linee potrebbero non essere garantite dalle 8:45 alle 15 e dopo le 18, fino al termine del servizio.');
});

test('guaranteed hours are carved out of the strike window', () => {
  const { carveGuarantees } = require('../lib/lab/model.ts');
  const out = carveGuarantees([clock('00:00', '23:59')], [{ start: '07:00', end: '10:00' }, { start: '18:00', end: '21:00' }]);
  assert.deepEqual(out.map(w => `${w.start}-${w.end}`), ['00:00-07:00', '10:00-18:00', '21:00-23:59']);
  const open = carveGuarantees([toEnd('18:00')], [{ start: '20:00', end: '21:00' }]);
  assert.deepEqual(open.map(w => `${w.start}-${w.end}-${w.end_kind}`), ['18:00-20:00-clock', '21:00-null-end_of_service']);
});

test('planned strike hours never read as live "stopped" and guarantees win', () => {
  const c = card('2026-10-10', 'BUS', [clock('00:00', '23:59')], { guarantees: [{ start: '06:00', end: '09:00', end_kind: 'clock' }], lineLabels: [], scheduledEnd: null });
  assert.match(statusLine(c, '2026-10-10', 7 * 60).text, /^保障时段内/);
  assert.match(statusLine(c, '2026-10-10', 12 * 60).text, /^罢工时段内/);
  assert.doesNotMatch(statusLine(c, '2026-10-10', 12 * 60).text, /停运|恢复/);
});

// ── Graffiti panels ──
const { slotsFor, assignSlot } = require('../components/lab/wall/slots.ts');

test('panels tile the body, centre-out, without overlap', () => {
  const body = { x0: 26, y0: 56, x1: 188, y1: 98 };
  const slots = slotsFor(body);
  assert.ok(slots.length >= 2);
  slots.forEach(s => { assert.ok(s.x >= body.x0 - 1 && s.x + s.w <= body.x1 + 1); assert.ok(s.y >= body.y0 - 1 && s.y + s.h <= body.y1 + 1); });
  for (const a of slots) for (const b of slots) if (a !== b) assert.ok(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1, 'overlap');
  const cx = (body.x0 + body.x1) / 2;
  const d = s => Math.abs(s.x + s.w / 2 - cx);
  assert.ok(d(slots[0]) <= d(slots[slots.length - 1]));
});

test('a person gets a free panel; many people spread out; a full wall paints over the oldest', () => {
  const slots = slotsFor({ x0: 0, y0: 0, x1: 340, y1: 44 });
  const taken = new Map([[0, 1], [1, 2]]);
  const mine = assignSlot(slots, taken, 'device-a');
  assert.ok(!taken.has(mine.i));
  const picks = new Set(Array.from({ length: 40 }, (_, k) => assignSlot(slots, new Map(), `device-${k}`).i));
  assert.ok(picks.size > 1, 'simultaneous arrivals should not all ask for the same panel');
  const full = new Map(slots.map((s, k) => [s.i, 100 + k]));
  full.set(slots[1].i, 1);
  assert.equal(assignSlot(slots, full, 'late').i, slots[1].i);
});

test('the lab widget script never claims a line is stopped and keeps end of service', () => {
  const { buildLabWidgetScript } = require('../lib/lab/widgetScript.ts');
  for (const lang of ['zh', 'en']) {
    const code = buildLabWidgetScript({ origin: 'https://x.test', region: 'MILANO', types: ['SUBWAY'], cityName: 'M', path: '/milan', lang });
    assert.doesNotMatch(code, /停运中|is stopped|not running/i);
    assert.match(code, lang === 'zh' ? /运营结束/ : /end of service/i);
    assert.doesNotThrow(() => new Function(`return async () => {${code}}`));
  }
});


test('lab translation cannot make a paid request even when an OpenRouter key exists', async () => {
  const savedFetch = global.fetch;
  const savedKey = process.env.OPENROUTER_API_KEY;
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Network access is forbidden for lab translation'); };
  process.env.OPENROUTER_API_KEY = 'unused-test-key';
  try {
    const { translateAll } = require('../lib/lab/translate.ts');
    assert.deepEqual(await translateAll(['Le nostre linee M1 e M2: 08:45–15:00', '米兰交通局人员']), {});
    assert.deepEqual(await translateAll([]), {});
    assert.equal(calls, 0);
  } finally {
    global.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = savedKey;
  }
});
