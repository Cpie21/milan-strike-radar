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

test('status reads like opening hours on the day and as a range otherwise', () => {
  const metro = card('2026-10-09', 'SUBWAY', [clock('08:45', '15:00'), toEnd('18:00')]);
  assert.equal(statusLine(metro, '2026-10-09', 7 * 60).text, '08:45 起停运');
  assert.equal(statusLine(metro, '2026-10-09', 10 * 60).text, '停运中 · 15:00 恢复 · 18:00 再次停运');
  assert.equal(statusLine(metro, '2026-10-09', 19 * 60).text, '停运中 · 停运至运营结束');
  assert.equal(statusLine(metro, '2026-10-05', 10 * 60).text, '08:45–15:00、18:00–运营结束 停运');
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
