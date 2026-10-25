const fs = require('node:fs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { fetchMitRelay } = require('../lib/mitRelay.ts');
const { fetchAndFilter, fetchRecentRows } = require('../lib/strikeSync.ts');
const MIT = 'https://scioperi.mit.gov.it/mit2/public/scioperi';

test('existing source relay is direct-first, verifies original receipts, and rejects stale or modified transport data', async () => {
  const original = global.fetch, oldUrl = process.env.MIT_RELAY_URL, oldToken = process.env.MIT_RELAY_TOKEN;
  process.env.MIT_RELAY_URL = 'https://italystrike-mit-source.cloudflare-mit-source.workers.dev/source';
  process.env.MIT_RELAY_TOKEN = 'test-only-secret'.repeat(3);
  const html = fs.readFileSync(__dirname + '/fixtures/mit-2026-10-23-national.html', 'utf8');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let direct = 0, relay = 0, mutate = value => value;
  global.fetch = async (url, options) => {
    if (String(url).startsWith(MIT)) { direct++; throw new TypeError('fetch failed'); }
    assert.equal(url, process.env.MIT_RELAY_URL);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    const request = JSON.parse(options.body);
    relay++;
    const shift = days => new Date(Date.parse(today + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10).split('-').reverse().join('/');
    return Response.json(mutate({ version: 1, kind: request.kind, date: today, nonce: request.nonce,
      url: request.kind === 'history' ? MIT + '/ricerca' : MIT, method: request.kind === 'history' ? 'POST' : 'GET',
      form: request.kind === 'history' ? { dataInizio: shift(-7), dataFine: shift(90), settore: '0', rilevanza: '0', stato: '0', categoria: '', sindacato: '', submit: 'Ricerca' } : null,
      fetchedAt: new Date().toISOString(), html, sha256: createHash('sha256').update(html).digest('hex') }));
  };
  try {
    const receipts = [];
    assert.ok((await fetchAndFilter(today, r => receipts.push(r))).length);
    assert.equal(direct, 1); assert.equal(relay, 1);
    assert.equal(receipts[0].transport, 'ITALY_RELAY');
    assert.ok(!JSON.stringify(receipts).includes(process.env.MIT_RELAY_TOKEN));
    assert.ok((await fetchRecentRows(today)).length);
    for (const patch of [{ nonce: 'bad' }, { sha256: 'bad' }, { version: 0 }, { fetchedAt: '2020-01-01T00:00:00Z' }, { url: 'https://evil.test' }, { method: 'POST' }, { date: '2020-01-01' }, { form: {} }]) {
      mutate = value => ({ ...value, ...patch });
      await assert.rejects(fetchMitRelay(MIT, {}, today), /Invalid or stale/);
    }
    const before = relay;
    await assert.rejects(fetchMitRelay('https://evil.test', {}, today), /Unapproved/);
    await assert.rejects(fetchMitRelay(MIT + '/ricerca', { method: 'POST', body: new URLSearchParams({ stato: '1' }) }, today), /Unapproved/);
    assert.equal(relay, before);
    mutate = value => ({ ...value, html: '<main>Unavailable</main>', sha256: createHash('sha256').update('<main>Unavailable</main>').digest('hex') });
    await assert.rejects(fetchAndFilter(today), /unavailable after 3 attempts/);
  } finally {
    global.fetch = original;
    if (oldUrl === undefined) delete process.env.MIT_RELAY_URL; else process.env.MIT_RELAY_URL = oldUrl;
    if (oldToken === undefined) delete process.env.MIT_RELAY_TOKEN; else process.env.MIT_RELAY_TOKEN = oldToken;
  }
});
