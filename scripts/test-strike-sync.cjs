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
    assert.equal(classifyRegionTag({ regionText, provinceText: 'Tutte' }), expected);
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
