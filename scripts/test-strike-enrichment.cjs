const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { test } = require('node:test');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { parseExternalNotices, parseExternalWindows, matchesNotice, applyTimingEvidence, allowedSourceUrl, enrichStrikeTiming } = require('../lib/strikeEnrichment.ts');
const { aggregateStrikes } = require('../components/utils.ts');
const record = (override = {}) => ({ date:'2026-10-09', region:'MILANO', category:'SUBWAY', provider:'米兰交通局人员', status:'UNCERTAIN', display_time:'具体时段待公布', duration_hours:'24小时（时段待公布）', strike_windows:[], guarantee_windows:[], affected_lines:['全部线路'], source_key:'same-mit-identity', source_url:'https://scioperi.mit.gov.it/mit2/public/scioperi', raw_payload:{ provider:'PERSONALE GRUPPO ATM DI MILANO', unions:'CONFIAL TRASPORTI', sector:'Trasporto pubblico locale', modalita:"24 ORE: VARIE MODALITA'", sourceStatus:'Programmato' }, ...override });
const source = (url = 'https://sciopero.net/123-event/') => ({ url, name:'Report', authority:'reported', checked_at:'2026-10-04T14:00:00Z', content_hash:'hash', excerpt:'timing' });
const notice = (override = {}) => ({ date:'2026-10-09', provider:'Atm Milano, Net', territory:'Milano, Monza', unions:'Confial Trasporti', sector:'Trasporto Pubblico Locale', timing:'Atm Milano e Net Trezzo dalle 8.45 alle 15.00 e dalle 18.00 a fine servizio, Net Monza dalle 9.00 alle 11.50 e dalle 14.50 a fine servizio', status:'CONFERMATO', source:source(), ...override });
const expected = [{ start:'08:45', end:'15:00', end_kind:'clock' },{ start:'18:00', end:null, end_kind:'end_of_service' }];
const detailHtml = (timing = notice().timing) => `<main><article class="detail-container"><h1>Sciopero Atm Milano, Net del 09-10-2026</h1>${Object.entries({"Data Dell'evento":'09-10-2026','Ambito Territoriale':'Milano, Monza','Sigle Sindacali':'Confial Trasporti','Settore Coinvolto':'Trasporto Pubblico Locale','Orari E Fasce':timing,'Stato Attuale':'CONFERMATO'}).map(([k,v])=>`<div class="detail-row"><div class="detail-label">${k}</div><div class="detail-value">${v}</div></div>`).join('')}</article></main>`;

test('scopes ATM hours away from Monza and preserves end-of-service without inventing midnight', () => {
  assert.deepEqual(parseExternalWindows(notice().timing, record()), expected);
});
test('whole-hour phrasing and separate metro/bus clauses have the correct scope', () => {
  assert.deepEqual(parseExternalWindows('Atm Milano metropolitana: dalle 8 alle 15; autobus: dalle 9 alle 13',record()), [{start:'08:00',end:'15:00',end_kind:'clock'}]);
  assert.deepEqual(parseExternalWindows('Atm Milano dalle 8:45 alle 15 e dalle 18 a fine servizio',record()), expected);
});
test('AL COBAS staff clause never imports the separate Trezzo evening window', () => {
  assert.deepEqual(parseExternalWindows('Gruppo Atm Personale Viaggiante Di Superficie, Metropolitana, Agenti Di Stazione, Serv. Poma 8.45-15.00 Net - Urbano Monza: 9.00-11.50 e 14.50-fine Servizio, Extraurbano Trezzo 8.45-15.00 e 18.00-fine Servizio', record()), expected.slice(0,1));
});
test('guarantees, previous strikes, impossible clocks, and unanchored overnight times remain unresolved', () => {
  for (const text of ['Servizi garantiti dalle 8.45 alle 15.00', 'Negli ultimi scioperi dalle 8.45 alle 15.00', '8.80-15.00', '25.00-26.00', '21.00-6.00']) assert.deepEqual(parseExternalWindows(text,record()), []);
});
test('calendar rows do not mix dates and unions of neighboring announcements', () => {
  const html = '<main><table><tr><td>9 Ottobre 2026 ATM Milano</td><td>Confial Trasporti</td><td>8:45–15:00 e 18:00–fine servizio</td></tr><tr><td>10 Ottobre 2026 ATM Milano</td><td>AL-COBAS</td><td>9:00–11:00</td></tr></table></main>';
  const parsed = parseExternalNotices(html,source().url,['2026-10-09']);
  assert.equal(parsed.length,1);assert.equal(parsed[0].unions,'Confial Trasporti');assert.deepEqual(parseExternalWindows(parsed[0].timing,record()),expected);
});
test('structured date and union are required, and cancellation wins over reports', () => {
  assert.equal(matchesNotice(notice(),record()),true);
  for (const n of [notice({date:'2027-10-09'}),notice({unions:'AL-COBAS'}),notice({territory:'Roma',provider:'Atac Roma',timing:'Atac 8:45-15:00'}),notice({status:'REVOCATO'})]) assert.equal(matchesNotice(n,record()),false);
  assert.equal(matchesNotice(notice(),record({status:'CANCELLED'})),false);
  assert.equal(matchesNotice(notice({unions:'AL COBAS'}),record({raw_payload:{...record().raw_payload,unions:'COBAS'}})),false);
});
test('matching external notice fills operational hours, preserves MIT identity and leaves guarantees empty', () => {
  const updated = applyTimingEvidence(record(),[notice()]);
  assert.equal(updated.source_key,'same-mit-identity');assert.equal(updated.source_url,record().source_url);assert.equal(updated.status,'CONFIRMED');assert.equal(updated.timing_evidence.confidence,'reported');assert.deepEqual(updated.timing_evidence.windows,expected);assert.deepEqual(updated.guarantee_windows,[]);assert.equal(updated.display_time,'08:45 - 15:00, 18:00 - 运营结束');assert.deepEqual(updated.strike_windows,[{start:'08:45',end:'15:00'}]);
});
test('same-authority disagreements are retained for review and never adopted by majority', () => {
  const changed = notice({timing:'Atm Milano 9.00-15.00',source:source('https://www.virgilio.it/notizie/test')});
  const updated = applyTimingEvidence(record(),[notice(),notice(),changed]);
  assert.equal(updated.status,'UNCERTAIN');assert.equal(updated.timing_evidence.confidence,'conflict');assert.equal(updated.strike_windows.length,0);assert.equal(updated.timing_evidence.conflicts.length,2);
});
test('explicit MIT clocks win; an unqualified 24-hour duration can receive operational detail', () => {
  const explicit=record({status:'CONFIRMED',strike_windows:[{start:'09:00',end:'15:00'}]});
  assert.deepEqual(applyTimingEvidence(explicit,[notice()]).strike_windows,explicit.strike_windows);
  const whole=record({status:'CONFIRMED',strike_windows:[{start:'00:00',end:'24:00'}],raw_payload:{...record().raw_payload,modalita:'24 ORE'}});
  assert.deepEqual(applyTimingEvidence(whole,[notice()]).timing_evidence.windows,expected);
});
test('operator announcement outranks media, but the media disagreement remains visible in evidence', () => {
  const official=notice({source:{...source('https://www.atm.it/it/AtmNews/notice.aspx'),authority:'official'},timing:'Atm Milano 9.00-15.00'});
  const updated=applyTimingEvidence(record(),[notice(),official]);
  assert.equal(updated.display_time,'09:00 - 15:00');assert.equal(updated.timing_evidence.confidence,'official');assert.equal(updated.timing_evidence.conflicts.length,1);
});
test('journey aggregation preserves symbolic endpoints and underlying distinct notices', () => {
  const a=applyTimingEvidence(record(),[notice()]);
  const b=applyTimingEvidence(record({source_key:'other'}),[notice()]);
  const c=applyTimingEvidence(record({source_key:'third'}),[notice({timing:'Atm Milano 8.45-15.00'})]);
  const rows=aggregateStrikes([a,b,c]).filter(r=>r.category === "SUBWAY");assert.equal(rows.length,1);assert.equal(rows[0].strike_events.length,3);assert.equal(rows[0].display_time,a.display_time);assert.deepEqual(rows[0].timing_evidence.windows,expected);
});
test('discovery rejects private URLs, credentials, nonstandard ports and redirects outside approved hosts', () => {
  for(const url of ['http://sciopero.net/', 'https://127.0.0.1/', 'https://localhost/', 'https://sciopero.net.evil.example/', 'https://user:pass@sciopero.net/', 'https://sciopero.net:8443/']) assert.equal(allowedSourceUrl(url),false);
  assert.equal(allowedSourceUrl(source().url),true);
});
test('scheduled discovery finds a new article from the current index, then notices a changed time on the next run', async () => {
  const original=global.fetch;let timing=notice().timing;
  global.fetch=async url=>new Response(String(url).includes('/123-new-')?detailHtml(timing):String(url).includes('sciopero.net/settore/')?'<div class="strike-item">09-10-2026 ATM Milano<a href="/123-new-article/">Dettagli</a></div>':'<main><h1>Current notices</h1></main>',{headers:{'content-type':'text/html'}});
  try {
    const a=await enrichStrikeTiming([record()],[],new Date('2026-10-04T12:00:00Z'));
    assert.equal(a.enriched,1);assert.equal(a.records[0].display_time,'08:45 - 15:00, 18:00 - 运营结束');
    timing='Atm Milano 9.15-13.30';
    const b=await enrichStrikeTiming([record()],[],new Date('2026-10-05T12:00:00Z'));
    assert.equal(b.records[0].source_key,a.records[0].source_key);assert.equal(b.records[0].display_time,'09:15 - 13:30');
  } finally {global.fetch=original;}
});
test('source outage clears previous supplemental evidence instead of keeping obsolete hours', async () => {
  const original=global.fetch;global.fetch=async()=>new Response('outage',{status:503});
  try {const warnings=[];const r=await enrichStrikeTiming([record({timing_evidence:{windows:expected}})],warnings,new Date('2026-10-04T12:00:00Z'));assert.ok(warnings.length);assert.deepEqual(r.records[0].timing_evidence.windows,[]);assert.deepEqual(r.records[0].timing_evidence.sources,[]);assert.equal(r.records[0].status,'UNCERTAIN');}finally{global.fetch=original;}
});
