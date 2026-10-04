const fs = require('node:fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

// Run the shared TypeScript logic without a separate test dependency.
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const { parseStrikeHtml, fetchAndFilter, transformRows } = require('../lib/strikeSync.ts');
const { classifyRegionTag } = require('../lib/strikeNormalization.ts');

const headers = ['Inizio', 'Fine', 'Sindacati', 'Settore*', 'Categoria', 'Modalità', 'Rilevanza', 'Note', 'Data proclamazione', 'Regione', 'Provincia'];
const row = ['09/10/2026', '09/10/2026', 'AL-COBAS', 'Trasporto pubblico locale', 'PERSONALE SOCC. GRUPPO ATM DI MILANO', '24 ORE: VARIE MODALITA', 'Provinciale', '', '27/07/2026', 'Lombardia', 'Tutte'];
const table = (rows) => `<table><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;

test('rejects an upstream error page instead of succeeding with no strikes', () => {
  assert.throws(() => parseStrikeHtml('<html>Temporarily unavailable</html>'), /table missing/);
});

test('accepts a valid empty official table', () => {
  assert.deepEqual(parseStrikeHtml(table([])), []);
});

test('handles accented headers and preserves Milan metro and bus records', async () => {
  const rows = parseStrikeHtml(table([row]));
  assert.equal(rows[0].modalita, row[5]);
  assert.equal(rows[0].region, 'MILANO');
  const records = (await transformRows(rows)).filter(r => r.date === '2026-10-09');
  assert.deepEqual(records.map(r => r.category).sort(), ['BUS', 'SUBWAY']);
});

test('all provinces in Marche does not mean a national strike', () => {
  assert.equal(classifyRegionTag({ regionText: 'Marche', provinceText: 'Tutte', providerText: 'PERSONALE AZIENDE TRASPORTO PUBBLICO LOCALE REGIONE MARCHE' }), 'OTHER');
});

test('regional strikes with all provinces still reach the target cities', () => {
  for (const [regionText, expected] of [['Lombardia', 'MILANO'], ['Lazio', 'ROMA'], ['Piemonte', 'TORINO']]) {
    assert.equal(classifyRegionTag({ regionText, provinceText: 'Tutte',relevanceText:'Regionale' }), expected);
  }
});

test('an excluded region does not hide a national strike', () => {
  assert.equal(classifyRegionTag({ regionText: 'Italia', provinceText: 'Tutte', providerText: 'SCIOPERO PLURISETTORIALE CATEGORIE PUBBLICHE E PRIVATE', noteText: 'ESCLUSO SOC. FS SECURITY SICILIA Nazionale' }), 'NATIONAL');
  assert.equal(classifyRegionTag({ regionText: 'Italia', provinceText: 'Tutte', providerText: 'PERSONALE SOC. ENAV APT LINATE' }), 'MILANO');
});

test('fetch uses HTTPS, bypasses cache, has a timeout and retries transient failures', async () => {
  const original = global.fetch;
  let attempts = 0;
  global.fetch = async (url, options) => {
    assert.ok(url.startsWith('https://'));
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    attempts += 1;
    return attempts === 1 ? new Response('unavailable', { status: 503 }) : new Response(table([row]));
  };
  try {
    assert.equal((await fetchAndFilter()).length, 1);
    assert.equal(attempts, 2);
  } finally {
    global.fetch = original;
  }
});

test('daily production schedule points at the real sync route', () => {
  const config = require('../vercel.json');
  assert.deepEqual(config.crons, [{ path: '/api/cron/sync-strikes', schedule: '0 5 * * *' }]);
  assert.ok(fs.existsSync(require('node:path').join(__dirname, '../app/api/cron/sync-strikes/route.ts')));
});

const { parseStrikeTiming } = require('../lib/strikeTiming.ts');
const { classifyRegionTags } = require('../lib/strikeNormalization.ts');
const { aggregateStrikes, filterStrikesForRegion } = require('../components/utils.ts');
const { CITIES, resolveCity, cityPath } = require('../lib/cities.ts');
const { getGuaranteeWindows } = require('../lib/guaranteeWindows.ts');

test('Oct 2 official railway exception overrides general 24 hours', () => {
  const timing = parseStrikeTiming("FINO A 24 ORE: SETTORE FERROVIARIO 3 ORE: DALLE 11.00 ALLE 14.00; SETTORE MARITTIMO: MODALITA' NON SPECIFICATE", 'TRAIN', '2026-10-02');
  assert.equal(timing.hours, '3小时');
  assert.deepEqual(timing.windows, [{ start: '11:00', end: '14:00' }]);
});

test('explicit overnight times override 24-hour duration and split by date', () => {
  const text = '24 ORE: DALLE 21.01 DEL 12/10 ALLE 21.00 DEL 13/10';
  assert.deepEqual(parseStrikeTiming(text, 'TRAIN', '2026-10-12').windows, [{ start: '21:01', end: '24:00' }]);
  assert.deepEqual(parseStrikeTiming(text, 'TRAIN', '2026-10-13').windows, [{ start: '00:00', end: '21:00' }]);
  assert.deepEqual(parseStrikeTiming(text, 'TRAIN', '2026-10-14').windows, []);
});

test('general strikes isolate railway, bus and highway timing', () => {
  const text = 'INTERA GIORNATA - FERROVIARIO DALLE 21.00 DEL 3/12 ALLE 21.00 DEL 4/12; AUTOSTRADE: DALLE 22.00 DEL 3/12 ALLE 22.00 DEL 4/12 / TPL: 4 ORE VARIE MODALITA';
  assert.deepEqual(parseStrikeTiming(text, 'TRAIN', '2026-12-03').windows, [{ start: '21:00', end: '24:00' }]);
  assert.deepEqual(parseStrikeTiming(text, 'BUS', '2026-12-04').windows, []);
  assert.deepEqual(parseStrikeTiming(text, 'AIRPORT', '2026-12-04').windows, []);
});

test('general sector rows without a colon still include explicit railway timing', async () => {
  const general = [...row];
  general[0] = '04/12/2026'; general[1] = '04/12/2026';
  general[3] = 'Generale'; general[4] = 'SCIOPERO GENERALE CATEGORIE PUBBLICHE E PRIVATE';
  general[5] = 'INTERA GIORNATA - FERROVIARIO DALLE 21.00 DEL 3/12 ALLE 21.00 DEL 4/12; AUTOSTRADE: DALLE 22.00 DEL 3/12 ALLE 22.00 DEL 4/12';
  general[9] = 'Italia'; general[10] = 'Tutte';
  const records = (await transformRows(parseStrikeHtml(table([general])))).filter(record => record.category === 'TRAIN');
  assert.deepEqual(records.map(record => [record.date, record.display_time]), [['2026-12-03', '21:00 - 24:00'], ['2026-12-04', '00:00 - 21:00']]);
});

test('unspecified and varying timings are never invented as full days', () => {
  for (const text of ['4 ORE', 'DA DEFINIRE', '24 ORE: VARIE MODALITA', 'INTERO TURNO']) {
    assert.deepEqual(parseStrikeTiming(text, 'BUS', '2026-10-10').windows, []);
  }
  assert.deepEqual(parseStrikeTiming('24 ORE', 'AIRPORT', '2026-10-16').windows, [{ start: '00:00', end: '24:00' }]);
});

test('archive parsing preserves source identity across timing and status revisions', async () => {
  const archivedHeaders = ['Stato', ...headers];
  const old = ['Effettuato', ...row];
  old[6] = 'FINO A 24 ORE: SETTORE FERROVIARIO 3 ORE: DALLE 11.00 ALLE 14.00';
  old[4] = 'Plurisettoriale';
  const html = values => `<table><tr>${archivedHeaders.map(h => `<th>${h}</th>`).join('')}</tr><tr>${values.map(c => `<td>${c}</td>`).join('')}</tr></table>`;
  const initial = parseStrikeHtml(html(old));
  const revised = [...old]; revised[0] = 'Revocato'; revised[6] = 'FERROVIARIO: DALLE 12.00 ALLE 15.00';
  const next = parseStrikeHtml(html(revised));
  assert.equal(initial[0].sourceKey, next[0].sourceKey);
  assert.equal((await transformRows(next))[0].status, 'CANCELLED');
});

test('city routes, aliases and local scope support all 20 cities', () => {
  assert.equal(CITIES.length, 20);
  for (const city of CITIES) {
    assert.equal(resolveCity(city.en)?.tag, city.tag);
    assert.equal(resolveCity(city.zh)?.tag, city.tag);
    assert.equal(classifyRegionTags({ regionText: city.region, provinceText: city.slug, providerText: `PERSONALE DI ${city.tag}` })[0], city.tag);
    assert.equal(cityPath(city.tag), city.tag === 'MILANO' ? '/' : `/${city.slug}`);
  }
  assert.equal(resolveCity('unknown'), undefined);
});

test('regional Tuscany scope reaches Florence and Pisa; local Florence does not reach Pisa', () => {
  assert.deepEqual(classifyRegionTags({ regionText: 'Toscana', provinceText: 'Tutte', providerText: 'PERSONALE REGIONALE',relevanceText:'Regionale' }), ['FIRENZE', 'PISA']);
  assert.deepEqual(classifyRegionTags({ regionText: 'Toscana', provinceText: 'Firenze', providerText: 'GEST DI FIRENZE' }), ['FIRENZE']);
});

test('rail notices share a journey card while retaining separate statuses and timings', () => {
  const base = { date: '2026-10-02', category: 'TRAIN', region: 'NATIONAL', provider: 'Trenord', status: 'CONFIRMED', duration_hours: '3小时', display_time: '11:00 - 14:00', strike_windows: [{ start: '11:00', end: '14:00' }] };
  const cards = aggregateStrikes([base, { ...base, provider: 'Trenitalia', duration_hours: '24小时', display_time: '全天 24小时', strike_windows: [{ start: '00:00', end: '24:00' }] }, { ...base, status: 'CANCELLED' }]);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].strike_windows, [{start:'00:00',end:'24:00'}]);
  assert.equal(cards[0].strike_events.length,3);
  assert.equal(cards[0].strike_events.filter(e=>e.status==='CANCELLED').length,1);
  assert.deepEqual(cards[0].strike_events.find(e=>e.provider==='Trenord'&&e.status==='CONFIRMED').windows,[{...base.strike_windows[0],end_kind:'clock'}]);
});

test('new city filtering includes national events and rejects another city', () => {
  const base = { category: 'BUS', date: '2026-10-16', provider: 'ANM', status: 'CONFIRMED' };
  const rows = filterStrikesForRegion([{ ...base, region: 'NAPOLI' }, { ...base, region: 'ROMA' }, { ...base, region: 'NATIONAL' }], 'NAPOLI');
  assert.deepEqual(rows.map(row => row.region), ['NAPOLI', 'NATIONAL']);
});

test('unknown timings and new cities do not receive Milan guarantee windows', () => {
  for (const city of CITIES.filter(city => !['MILANO', 'ROMA', 'TORINO'].includes(city.tag))) {
    assert.deepEqual(getGuaranteeWindows({ category: 'BUS', dateIso: '2026-10-16', region: city.tag }), []);
  }
});

test('archive lookback posts a Rome date range and preserves withdrawal status', async () => {
  const { fetchRecentRows } = require('../lib/strikeSync.ts');
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.ok(url.endsWith('/ricerca'));
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('dataInizio'), '26/09/2026');
    assert.equal(options.body.get('dataFine'), '01/01/2027');
    assert.equal(options.body.get('stato'), '0');
    return new Response(table([]));
  };
  try { assert.deepEqual(await fetchRecentRows('2026-10-03'), []); }
  finally { global.fetch = original; }
});

test('source upsert replaces stale time in the original row, preserves ID, and applies cancellation', async () => {
  const { upsertToSupabase } = require('../lib/strikeSync.ts');
  const stored = [{ id: 'original-id', date: '2026-10-02', category: 'TRAIN', region: 'NATIONAL', provider: '铁路相关人员', source_key: null, status: 'CONFIRMED', display_time: '全天 24小时' }];
  const db = { from: () => {
    let patch, predicates = [];
    const query = {
      select: () => query,
      in: (key, values) => { predicates.push(row => values.includes(row[key])); return query; },
      is: (key, value) => { predicates.push(row => (row[key] ?? null) === value); return query; },
      eq: (key, value) => { predicates.push(row => row[key] === value); return query; },
      update: value => { patch = value; return query; },
      then: resolve => {
        const matching = stored.filter(row => predicates.every(test => test(row)));
        if (patch) matching.forEach(row => Object.assign(row, patch));
        return Promise.resolve({ data: matching, error: null }).then(resolve);
      },
      upsert: async (rows, { onConflict }) => {
        const keys = onConflict.split(',');
        rows.forEach(row => {
          const existing = stored.find(item => keys.every(key => item[key] === row[key]));
          if (existing) Object.assign(existing, row);
          else stored.push({ id: `new-${stored.length}`, ...row });
        });
        return { error: null };
      },
    };
    return query;
  } };
  const corrected = { ...stored[0], source_key: 'official-event-key', display_time: '11:00 - 14:00', duration_hours: '3小时', strike_windows: [{ start: '11:00', end: '14:00' }], guarantee_windows: [], affected_lines: [] };
  delete corrected.id;
  assert.equal(await upsertToSupabase([corrected], db), 1);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, 'original-id');
  assert.equal(stored[0].display_time, '11:00 - 14:00');
  await upsertToSupabase([{ ...corrected, display_time: '12:00 - 15:00', strike_windows: [{ start: '12:00', end: '15:00' }], status: 'CANCELLED' }], db);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].status, 'CANCELLED');
  assert.equal(stored[0].display_time, '12:00 - 15:00');
});

test('generic railway events do not promise regional guarantees for high speed trains', () => {
  assert.deepEqual(getGuaranteeWindows({ category: 'TRAIN', dateIso: '2026-10-02', region: 'NATIONAL' }), []);
});

test('a named two-airport strike reaches both Florence and Pisa', () => {
  assert.deepEqual(classifyRegionTags({ regionText: 'Toscana', provinceText: 'Tutte', sectorText: 'Aereo', providerText: 'PERSONALE OPERANTE PRESSO GLI AEROPORTI DI PISA E FIRENZE' }), ['FIRENZE', 'PISA']);
});

test('rules support hour-only and comma-separated Italian clocks without AI', () => {
  for (const text of ['DALLE ORE 8 ALLE ORE 12', 'DALLE 8:00 ALLE 12:00', '8.00–12.00']) {
    assert.deepEqual(parseStrikeTiming(text, 'BUS', '2026-10-09').windows, [{ start: '08:00', end: '12:00' }]);
  }
  assert.deepEqual(parseStrikeTiming('DALLE 8,30 ALLE 12,30', 'BUS', '2026-10-09').windows, [{ start: '08:30', end: '12:30' }]);
  assert.deepEqual(parseStrikeTiming('DALLE 8.45 ALLE 15.00 E DALLE 18.00 ALLE 22.00', 'BUS').windows, [{ start: '08:45', end: '15:00' }, { start: '18:00', end: '22:00' }]);
});

test('end of service, shifts and invalid dates never become invented midnight endpoints', () => {
  for (const text of ['24 ORE: DALLE 18.00 A FINE SERVIZIO', '4 ORE A FINE TURNO', '24 ORE: DALLE 09.00 DEL 31/2 ALLE 12.00 DEL 31/2', '24 ORE: DALLE 25.00 ALLE 27.00', '24 ORE: DALLE 13.00 ALLE 13.00']) {
    assert.deepEqual(parseStrikeTiming(text, 'BUS', '2026-10-09').windows, [], text);
  }
});

test('unknown multi-day timings stay unknown on every date', async () => {
  const values = [...row]; values[1] = '10/10/2026'; values[5] = '24 ORE: VARIE MODALITA';
  const records = await transformRows(parseStrikeHtml(table([values])));
  assert.equal(records.length, 4);
  for (const record of records) { assert.deepEqual(record.strike_windows, []); assert.equal(record.status, 'UNCERTAIN'); }
});

test('invalid official dates stop reconciliation instead of silently normalizing', async () => {
  const values = [...row]; values[1] = '31/02/2026';
  await assert.rejects(transformRows(parseStrikeHtml(table([values]))), /Invalid official date span/);
});

test('unknown cards preserve their label and retired records stay hidden', () => {
  const base = { category: 'BUS', date: '2026-10-09', region: 'MILANO', status: 'UNCERTAIN', provider: 'ATM', display_time: '具体时段待公布', strike_windows: [] };
  const merged = aggregateStrikes([base, { ...base, provider: 'Busitalia' }]);
  assert.equal(merged[0].display_time, '具体时段待公布');
  assert.deepEqual(filterStrikesForRegion([{ ...base, status: 'STALE' }], 'MILANO'), []);
});

test('distinct official railway notices survive alongside legacy placeholder cleanup', () => {
  const base = { category: 'TRAIN', date: '2020-01-01', region: 'NATIONAL', status: 'UNCERTAIN', provider: 'Trenitalia' };
  const rows = filterStrikesForRegion([base, { ...base, source_key: 'official-a' }, { ...base, region: 'MILANO', status: 'CONFIRMED', source_key: 'official-b' }], 'MILANO');
  assert.equal(rows.length, 2);
});

test('hung sync is unhealthy even when the last completed run was recent', () => {
  const { syncHealth } = require('../lib/syncHealth.ts');
  const now = Date.parse('2026-10-04T12:00:00Z');
  assert.equal(syncHealth({ status: 'running', started_at: '2026-10-04T11:50:00Z' }, '2026-10-04T10:00:00Z', now).healthy, false);
  assert.equal(syncHealth({ status: 'running', started_at: '2026-10-04T11:59:00Z' }, '2026-10-04T10:00:00Z', now).healthy, true);
  assert.equal(syncHealth({ status: 'success', started_at: '2026-10-02T00:00:00Z' }, '2026-10-02T00:00:00Z', now).healthy, false);
});

test('feedback rejects empty, oversized and untyped input', () => {
  const { validateFeedback } = require('../lib/feedback.ts');
  for (const value of ['', ' ', 'x'.repeat(1001), {}, 123]) assert.equal(validateFeedback(value, undefined), null);
  assert.equal(validateFeedback('hello', 'x'.repeat(61)), null);
  assert.deepEqual(validateFeedback(' hello ', ' reader '), { content: 'hello', nickname: 'reader' });
});

test('calendar escaping and byte folds round-trip Chinese, punctuation and newlines', () => {
  const { escapeCalendarText, serializeCalendar } = require('../lib/ical.ts');
  const value = '公交,机场;线路\\名称\n中文'.repeat(20);
  const serialized = serializeCalendar(['BEGIN:VCALENDAR', `DESCRIPTION:${escapeCalendarText(value)}`, 'END:VCALENDAR']);
  assert.equal(serialized.replace(/\r\n /g, '').split('\r\n')[1], `DESCRIPTION:${escapeCalendarText(value)}`);
  for (const line of serialized.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(!serialized.replace(/\r\n/g, '').includes('\n'));
  assert.equal(escapeCalendarText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('local transit categories distinguish Messina ATM, metro divisions and broad city networks', async()=>{
 const template=parseStrikeHtml(table([row]))[0];
 for(const [provider,region,expected] of [['ATM MESSINA','MESSINA',['BUS']],['ATAC ROMA','ROMA',['BUS','SUBWAY']],['GTT TORINO','TORINO',['BUS','SUBWAY']],['ANM NAPOLI','NAPOLI',['BUS','SUBWAY']],['BRESCIA MOBILITA','BRESCIA',['BUS','SUBWAY']],['ATM MILANO METROPOLITANA','MILANO',['SUBWAY']],['ATM MILANO AUTOBUS','MILANO',['BUS']]]){
 const records=await transformRows([{...template,provider,region,sourceKey:'category-'+region+provider,sector:'Trasporto pubblico locale'}]);assert.deepEqual([...new Set(records.map(r=>r.category))].sort(),expected,provider);
 if(region==='MESSINA') assert.ok(records.every(r=>r.provider==='ATM Messina人员'));
 }
});
