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
  assert.equal(computeImpact('CANCELLED', fullDay, 'strike'), 'cancelled');
  assert.equal(computeImpact('UNCERTAIN', [], null), 'unknown');
  assert.equal(computeImpact('CONFIRMED', fullDay, 'guarantee'), 'low');
  assert.equal(computeImpact('CONFIRMED', fullDay, null), 'high');
  assert.equal(computeImpact('CONFIRMED', [{ start: '13:00', end: '17:00', end_kind: 'clock' }], null), 'medium');
});
