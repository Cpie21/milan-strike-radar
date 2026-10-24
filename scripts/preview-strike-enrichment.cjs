// Live read-only rehearsal: no database writes, no secrets in output.
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { fetchAndFilter, fetchRecentRows, transformRows } = require('../lib/strikeSync.ts');
const { enrichStrikeTiming } = require('../lib/strikeEnrichment.ts');
(async () => {
  const rows = await Promise.all([fetchAndFilter(), fetchRecentRows()]);
  const records = await transformRows(rows.flat());
  const warnings = [];
  const result = await enrichStrikeTiming(records, warnings);
  console.log(JSON.stringify({ sourcesChecked: result.sourcesChecked, enriched: result.enriched, conflicts: result.conflicts, warnings, records: result.records.filter(r => r.timing_evidence).map(({ date, region, category, display_time, status, timing_evidence }) => ({ date, region, category, display_time, status, timing_evidence })) }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
