const fs = require('node:fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const { parseQuery, parseScope, parseTime, weekEnd } = require('../lib/ask/parseQuery.ts');

// 2026-10-04 is a Sunday.
const SUNDAY = '2026-10-04';

test('relative days and weekdays resolve against Rome today', () => {
  assert.equal(parseScope('明天有罢工吗', SUNDAY).date, '2026-10-05');
  assert.equal(parseScope('后天', SUNDAY).date, '2026-10-06');
  assert.equal(parseScope('周五坐地铁', SUNDAY).date, '2026-10-09');
  assert.equal(parseScope('下周三', SUNDAY).date, '2026-10-07');
  assert.equal(parseScope('next friday', SUNDAY).date, '2026-10-09');
});

test('explicit dates, including the year rollover', () => {
  assert.equal(parseScope('10月16日下午', SUNDAY).date, '2026-10-16');
  assert.equal(parseScope('12月4号', SUNDAY).date, '2026-12-04');
  assert.equal(parseScope('1月10日', SUNDAY).date, '2027-01-10');
  assert.equal(parseScope('16/10', SUNDAY).date, '2026-10-16');
  assert.equal(parseScope('2026-11-21', SUNDAY).date, '2026-11-21');
});

test('on a Sunday "this week" means the coming week, not one day', () => {
  assert.equal(weekEnd(SUNDAY), '2026-10-11');
  const scope = parseScope('这周有罢工吗', SUNDAY);
  assert.deepEqual([scope.kind, scope.from, scope.to], ['range', SUNDAY, '2026-10-11']);
  assert.equal(weekEnd('2026-10-07'), '2026-10-11');
});

test('clock times, and decimals are not mistaken for dates', () => {
  assert.equal(parseTime('早上8点'), '08:00');
  assert.equal(parseTime('下午3点半'), '15:30');
  assert.equal(parseTime('晚上10点'), '22:00');
  assert.equal(parseTime('7:45的车'), '07:45');
  assert.equal(parseTime('早上8.30'), '08:30');
  assert.equal(parseTime('at 6pm'), '18:00');
  assert.equal(parseScope('早上8.30出发', SUNDAY), null);
});

test('cities, airports, modes and lines are read by rules', () => {
  const q = parseQuery('我10月16日下午3点要从马尔彭萨飞巴黎', SUNDAY);
  assert.deepEqual(q.cities, ['MILANO']);
  assert.ok(q.modes.includes('AIRPORT'));
  const m = parseQuery('周五早上9点坐M1，再转Trenord S5', SUNDAY);
  assert.deepEqual(m.lines, ['M1', 'S5']);
  assert.deepEqual(m.modes.sort(), ['SUBWAY', 'TRAIN']);
});

test('impact and actions follow facts the code computed', () => {
  // pipeline imports the database layer; load only its pure helpers.
  const src = fs.readFileSync(require.resolve('../lib/ask/pipeline.ts'), 'utf8');
  const pure = src.slice(src.indexOf('function minutes('), src.indexOf('function heuristicIntent('));
  const mod = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(pure, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(mod, mod.exports);
  const { computeOverlap, computeImpact } = mod.exports;
  const fullDay = [{ start: '00:00', end: '24:00', end_kind: 'clock' }];
  const guarantees = [{ start: '07:00', end: '10:00' }, { start: '18:00', end: '21:00' }];
  assert.equal(computeOverlap('15:00', fullDay, guarantees), 'strike');
  assert.equal(computeOverlap('08:00', fullDay, guarantees), 'guarantee');
  assert.equal(computeOverlap('12:00', [{ start: '13:00', end: '17:00', end_kind: 'clock' }], []), 'outside');
  assert.equal(computeOverlap('23:00', [{ start: '18:00', end: null, end_kind: 'end_of_service' }], []), 'strike');
  assert.equal(computeOverlap('09:00', [], []), 'unknown');
  // A part of the day: any strike minute inside it counts.
  const evening = { from: '18:00', to: '24:00' };
  assert.equal(computeOverlap(null, [{ start: '21:00', end: '24:00', end_kind: 'clock' }], [], evening), 'strike');
  assert.equal(computeOverlap(null, [{ start: '08:00', end: '12:00', end_kind: 'clock' }], [], evening), 'outside');
  assert.equal(computeImpact('CANCELLED', fullDay, 'strike'), 'cancelled');
  assert.equal(computeImpact('UNCERTAIN', [], null), 'unknown');
  assert.equal(computeImpact('CONFIRMED', fullDay, 'guarantee'), 'low');
  assert.equal(computeImpact('CONFIRMED', fullDay, null), 'high');
  assert.equal(computeImpact('CONFIRMED', [{ start: '13:00', end: '17:00', end_kind: 'clock' }], null), 'medium');
});

test('impossible dates and uncovered places are not searched', () => {
  const { parseQuery, unsupportedPlace } = require('../lib/ask/parseQuery.ts');
  assert.equal(parseQuery('2月31日地铁罢工吗', '2026-10-05').scope, null);
  assert.equal(unsupportedPlace('10月15日Foggia公交有罢工吗？'), 'Foggia');
  assert.equal(unsupportedPlace('米兰地铁周五罢工吗'), null);
});

test('everyday travel, trips abroad and parts of the day are read, not guessed silently', () => {
  const school = parseQuery('我下周上学会不会遇到罢工啊？', SUNDAY);
  assert.equal(school.daily, true);
  assert.equal(school.abroad, null);
  const swiss = parseQuery('12月3日晚上坐火车去瑞士会有问题吗', SUNDAY);
  assert.equal(swiss.abroad.country, 'CH');
  assert.deepEqual([swiss.dayPart.from, swiss.dayPart.to], ['18:00', '24:00']);
  assert.equal(parseQuery('train to Lugano tomorrow', SUNDAY).abroad.country, 'CH');
  assert.equal(parseQuery('明早 9 点坐 M1', SUNDAY).dayPart, null, 'a clock time wins over a part of the day');
  assert.equal(parseQuery('flight to Munich', SUNDAY).abroad.country, 'DE');
  assert.equal(parseQuery('a nice day in Milan', SUNDAY).abroad, null);
});

test('invalid ISO months are rejected rather than throwing while parsing a question',()=>{
  assert.equal(parseScope('2026-13-40 subway','2026-10-06'),null);
  assert.equal(parseScope('2026-02-31 subway','2026-10-06'),null);
});

// Bad case: a user named a specific date and was still asked "this week or
// next week?". Every way people write a date must read as that day.
test('explicit dates in English, Italian and Chinese numerals read as a day, not a clarify', () => {
  const TUE = '2026-10-06';
  const cases = {
    'is there a strike on October 9?': '2026-10-09', 'strike on 9 October in Milan': '2026-10-09', 'Oct 9th metro?': '2026-10-09',
    'on the 9th will the metro run': '2026-10-09', 'Oct. 12': '2026-10-12', '12th october train': '2026-10-12', 'the 4th of december': '2026-12-04',
    'Dec 4 train strike': '2026-12-04', 'fri 9 oct metro': '2026-10-09', 'October 9, 2026': '2026-10-09',
    '9 ottobre sciopero metro': '2026-10-09', 'sciopero venerdì 9 ottobre': '2026-10-09', '4 dicembre treno': '2026-12-04',
    'venerdì metro milano': '2026-10-09', 'sabato treni': '2026-10-10', 'lunedì prossimo': '2026-10-12', 'dopodomani': '2026-10-08',
    '十月九号地铁': '2026-10-09', '十二月四号火车': '2026-12-04', '10.9号地铁罢工吗': '2026-10-09', '10.9 地铁': '2026-10-09', '１０月９日': '2026-10-09',
    '2026年12月4日火车': '2026-12-04', '下下周三火车': '2026-10-21', 'next fri': '2026-10-16', 'tmr metro': '2026-10-07',
  };
  for (const [q, date] of Object.entries(cases)) assert.equal(parseScope(q, TUE)?.date, date, q);
  assert.deepEqual([parseScope('下下周', TUE).from, parseScope('下下周', TUE).to], ['2026-10-19', '2026-10-25']);
});

test('clocks, counts and line names are not misread as dates', () => {
  const TUE = '2026-10-06';
  for (const q of ['8.30 地铁', '3号线会罢工吗', '九号线', 'm3 2-3 people', '1.5 hours late?', 'it costs 2.5', '2-3个人坐地铁']) assert.equal(parseScope(q, TUE), null, q);
  assert.deepEqual(parseQuery('3号线明天', TUE).lines, ['M3']);
  assert.equal(parseTime('明天8.30坐地铁'), '08:30');
});
