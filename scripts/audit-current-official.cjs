// Independent official-list -> database and database -> official-list audit.
// Snapshot contains strike business rows only. No writes and no model calls.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone TypeScript audit harness. */
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cheerio=require('cheerio'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {excludedPassengerModes}=require('../lib/transportDeclaration.ts');
const normalize=s=>(s||'').replace(/\s+/g,' ').trim();
(async()=>{
  const snapshot=process.env.STRIKE_AUDIT_SNAPSHOT;assert.ok(snapshot,'Set STRIKE_AUDIT_SNAPSHOT to a read-only export of current strike rows');
  const records=JSON.parse(fs.readFileSync(snapshot,'utf8'));assert.ok(Array.isArray(records));
  let html;
  if(process.env.STRIKE_AUDIT_HTML)html=fs.readFileSync(process.env.STRIKE_AUDIT_HTML,'utf8');
  else {const response=await fetch('https://scioperi.mit.gov.it/mit2/public/scioperi',{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);html=await response.text();}
  const $=cheerio.load(html),table=$('table').filter((_,t)=>/Inizio/.test($(t).text())&&/Categoria/.test($(t).text())&&/Provincia/.test($(t).text())).first();assert.ok(table.length,'Official table unavailable');
  const headers=table.find('tr').filter((_,r)=>$(r).find('th').length>0).first().find('th').map((_,t)=>normalize($(t).text()).replace(/\*/g,'').toLowerCase()).get();
  for(const h of ['inizio','fine','categoria','settore','modalità','regione','provincia'])assert.ok(headers.includes(h),'Header missing: '+h);
  const official=new Map();
  table.find('tr').each((_,tr)=>{
    const values=$(tr).find('td').map((_,td)=>$(td).text().trim()).get();if(!/^\d{2}\/\d{2}\/\d{4}$/.test(values[headers.indexOf('inizio')]||''))return;
    const get=h=>values[headers.indexOf(h)]||'';
    const row={date:get('inizio'),endDate:get('fine'),provider:get('categoria'),sector:get('settore'),modalita:get('modalità'),note:get('note'),rawRegion:get('regione'),province:get('provincia'),unions:get('sindacati'),proclamationDate:get('data proclamazione')};
    const key=crypto.createHash('sha256').update(JSON.stringify([row.date,row.provider,row.unions,row.proclamationDate,row.rawRegion,row.province])).digest('hex');official.set(key,row);
  });
  assert.ok(official.size,'Refusing empty/malformed official inventory');
  const issues=[],outside=[],excluded=[],matched=[];
  const active=records.filter(r=>!['STALE','CANCELLED'].includes(r.status));
  for(const [key,row] of official){
    const passenger=/trasporto pubblico|ferroviario|aereo|generale|plurisettoriale/i.test(row.sector);
    const freightOnly=/trasporto merci/i.test(row.sector)&&!/generale|plurisettoriale/i.test(row.sector);
    if(!passenger||freightOnly){outside.push({key,sector:row.sector,provider:row.provider});continue;}
    if(excludedPassengerModes(row.note).size===4){excluded.push(key);continue;}
    const found=active.filter(r=>r.source_key===key);
    if(!found.length){issues.push({kind:'MISSING_ANNOUNCEMENT',key,date:row.date,provider:row.provider});continue;}
    matched.push(key);
    for(const r of found){
      if(['UNKNOWN','OTHER'].includes(r.region))issues.push({kind:'UNPROJECTED_GEOGRAPHY',key,id:r.id,category:r.category,date:r.date});
      if(r.category==='TRAIN'&&/trasporto pubblico/i.test(row.sector)&&/autolinee|automobilistic|operatori di esercizio/i.test(row.provider)&&!/ferroviari[oa]|\bDTF\b/i.test(row.provider))issues.push({kind:'BUS_DIVISION_MISCLASSIFIED_AS_TRAIN',key,id:r.id});
      const articulated=/FERROVIARIO|\bAEREO\b|\bTPL\b/i.test(row.modalita);
      let clockText=row.modalita;
      if(articulated)clockText=r.category==='TRAIN'?row.modalita.match(/FERROVIARIO([\s\S]*?)(?=\bTPL\b|\bAEREO\b|APPALTI FERROVIARI|AUTOSTRADE|MARITTIMO|TAXI|$)/i)?.[1]||'':r.category==='AIRPORT'?row.modalita.match(/\bAEREO\b([\s\S]*?)(?=FERROVIARIO|\bTPL\b|AUTOSTRADE|MARITTIMO|TAXI|$)/i)?.[1]||'':row.modalita.match(/\bTPL\b([\s\S]*?)(?=FERROVIARIO|\bAEREO\b|AUTOSTRADE|MARITTIMO|TAXI|$)/i)?.[1]||'';
      const explicitClocks=/\b\d{1,2}[.:]\d{2}(?:\s+DEL\s+\d{1,2}\/\d{1,2})?\s*(?:ALLE|-)\s*\d{1,2}[.:]\d{2}/i.test(clockText);
      if(explicitClocks&&(articulated||!/generale|plurisettoriale/i.test(row.sector))&&!r.strike_windows?.length&&!r.evidence_windows?.length)issues.push({kind:'PUBLISHED_CLOCKS_MISSING',key,id:r.id,category:r.category,date:r.date});
      for(const field of Object.keys(row))if(normalize(r.raw_payload?.[field])!==normalize(row[field]))issues.push({kind:'PRIMARY_FIELD_MISMATCH',key,id:r.id,field,official:row[field],stored:r.raw_payload?.[field]});
    }
  }
  const orphaned=active.filter(r=>r.source_key&&!official.has(r.source_key)).map(r=>({key:r.source_key,id:r.id,date:r.date}));
  const result={checkedAt:new Date().toISOString(),officialAnnouncements:official.size,matchedPassengerAnnouncements:matched.length,explicitlyExcludedAnnouncements:excluded.length,outsideProduct:outside,activeDatabaseRows:active.length,issues,notInUpcomingList:orphaned};
  console.log(JSON.stringify(result,null,2));if(issues.length||orphaned.length)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
