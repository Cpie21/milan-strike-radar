/* A reviewed external truth matrix for the 2026-10-06 audit; NOT the runtime parser.
   Inputs are independently extracted MIT table cells and a read-only DB snapshot.
   To audit a later date, review new official facts and update expectations first. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const [cellsFile,snapshotFile,output]=process.argv.slice(2);if(!output)throw Error('Usage: node scripts/audit-official-snapshot.cjs official-cells.json snapshot.json report.json');
const raw=JSON.parse(fs.readFileSync(cellsFile)),snapshot=JSON.parse(fs.readFileSync(snapshotFile));
const active=snapshot.production.filter(r=>!['STALE','CANCELLED'].includes(r.status));
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
const expected=(r)=>{
 const p=r[5],date=r[1],projection=(cities,modes,windows,subtype)=>cities.flatMap(city=>modes.map(mode=>({city,mode,windows,subtype})));
 if(/FS SECURITY/.test(p))return projection(['CATANIA','MESSINA','PALERMO'],['TRAIN'],[['00:00','24:00']],'RAIL_SECURITY');
 if(/GRUPPO ATM DI MILANO/.test(p))return projection(['MILANO'],['BUS','SUBWAY'],[['08:45','15:00'],['18:00',null]]);
 if(/GEST SERVIZIO/.test(p))return projection(['FIRENZE'],['BUS'],[['00:00','24:00']]);
 if(/AMTAB/.test(p))return projection(['BARI'],['BUS'],[['08:30','12:29']]);
 if(/REGIONE TOSCANA/.test(p)&&r[4]==='Generale')return [...projection(['FIRENZE','PISA'],['TRAIN'],[['09:01','17:00']],'RAIL_GENERAL'),...projection(['FIRENZE','PISA'],['BUS'],[])];
 if(/ATAF DI FOGGIA/.test(p))return projection(['UNKNOWN'],['BUS'],[['00:00','24:00']]);
 if(/EASYJET/.test(p))return projection(['NATIONAL'],['AIRPORT'],[['00:00','23:59']],'AIRLINE_CREW');
 if(/DTF SOC. EAV/.test(p))return projection(['NAPOLI'],['TRAIN'],[['19:40','23:40']],'RAIL_CREW');
 if(/ARRIVA ITALIA.*BERGAMO/.test(p))return projection(['BERGAMO'],['BUS'],[[null,'05:59'],['08:31','12:29'],['16:01',null]]);
 if(/TOSCANA AEROPORTI/.test(p))return projection(['FIRENZE','PISA'],['AIRPORT'],[['00:00','24:00']],'MIXED_AIRPORT_SERVICES');
 if(/POSTE AIR CARGO/.test(p))return projection(['NATIONAL'],['AIRPORT'],[['00:00','24:00']],'CARGO');
 if(/ARRIVA UDINE/.test(p))return projection(['UNKNOWN'],['BUS'],[['15:00','24:00']]);
 if(/AIR CAMPANIA/.test(p))return projection(['NAPOLI'],['BUS'],[['08:00','16:00']]);
 if(/CUSTOMER OPERATIONS/.test(p))return projection(['BOLOGNA'],['TRAIN'],[['00:00','23:59']],'RAIL_CUSTOMER_SERVICE');
 if(/ENAV APT BARI/.test(p))return projection(['BARI'],['AIRPORT'],[['13:00','17:00']]);
 if(p==='PERSONALE SOC. ENAV')return projection(['NATIONAL'],['AIRPORT'],[['13:00','17:00']],'NATIONAL_AVIATION');
 if(/ENAV AEROPORTO DI MILANO MALPENSA/.test(p))return projection(['MILANO'],['AIRPORT'],[['00:01','24:00']]);
 if(/SICURITALIA IVRI/.test(p))return projection(['VENEZIA'],['AIRPORT'],[['00:00','23:59']]);
 if(/SCIOPERO GENERALE CATEGORIE/.test(p)&&date==='04/12/2026')return [{city:'NATIONAL',mode:'TRAIN',date:'2026-12-03',windows:[['21:00','24:00']]},...projection(['NATIONAL'],['TRAIN'],[['00:00','21:00']]),...projection(['NATIONAL'],['BUS','AIRPORT'],[])];
 if(/ANM DI NAPOLI/.test(p))return projection(['NAPOLI'],['BUS','SUBWAY'],[['11:00','15:00']]);
 if(r[4]==='Plurisettoriale'&&/ESCLUSI SETTORI TRASPORTO/.test(r[8]))return [];
 if(['Trasporto merci','Marittimo','Circolazione e sicurezza stradale'].includes(r[4]))return null;
 throw Error('Unreviewed official announcement: '+p);
};
const visited=new Set(),matrix=[];
for(const row of raw){
 const projection=expected(row),date=row[1].split('/').reverse().join('-');
 const records=active.filter(r=>norm(r.raw_payload?.provider)===norm(row[5])&&norm(r.raw_payload?.unions)===norm(row[3])&&r.raw_payload?.date===row[1]);
 if(projection===null){assert.equal(records.length,0);matrix.push({date,provider:row[5],disposition:'OUTSIDE_PRODUCT_MODES'});continue;}
 assert.equal(records.length,projection.length,'projection count: '+row[5]);
 for(const e of projection){const matches=records.filter(r=>r.date===(e.date||date)&&r.region===e.city&&r.category===e.mode);assert.equal(matches.length,1,'duplicate/missing '+JSON.stringify(e));const r=matches[0],f=r.timing_evidence.fields;
 visited.add(r.id);
 for(const [key,col] of [['provider',5],['sector',4],['modalita',6],['rilevanza',7],['note',8],['proclamationDate',9],['rawRegion',10],['province',11],['endDate',2]])assert.equal(norm(r.raw_payload[key]),norm(row[col]),key+' changed');
 assert.deepEqual((r.timing_evidence.windows||[]).map(w=>[w.start,w.end]),e.windows,'timing '+row[5]);if(e.subtype)assert.equal(f.scopeType.value,e.subtype);
 if(e.city==='UNKNOWN')assert.equal(f.locationStatus,'UNSUPPORTED_CITY');
 assert.notEqual(r.source_key,'LEGACY_UNVERIFIED');assert.ok(f.lineScope);if(f.lineScope.value.kind==='UNKNOWN')assert.ok(!r.affected_lines.includes('全部线路'));
 matrix.push({date:r.date,provider:row[5],union:row[3],city:r.region,mode:r.category,subtype:f.scopeType.value,windows:e.windows,lineScope:f.lineScope.value.kind,guaranteeSource:f.guaranteeSource,disposition:'MATCHED'});
 }
 if(!projection.length)matrix.push({date,provider:row[5],disposition:'TRANSPORT_EXPLICITLY_EXCLUDED'});
}
assert.equal(visited.size,active.length,'all production records must trace to an independent official row');
const cron=snapshot.runs.filter(r=>/T05:10:3/.test(r.started_at));assert.ok(cron.length>=3);assert.ok(cron.every(r=>r.status==='success'));
const report={checkedAt:snapshot.checkedAt,officialAnnouncements:raw.length,activeRecords:active.length,activeAnnouncements:new Set(active.map(r=>r.source_key)).size,reverseTraces:visited.size,unknownTiming:active.filter(r=>!r.timing_evidence?.windows.length).length,unsupportedCity:active.filter(r=>r.timing_evidence?.fields?.locationStatus==='UNSUPPORTED_CITY').length,scheduledRuns:cron.map(({started_at,completed_at,status})=>({started_at,completed_at,status})),matrix};
fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({officialAnnouncements:report.officialAnnouncements,activeRecords:report.activeRecords,reverseTraces:report.reverseTraces,unknownTiming:report.unknownTiming}));
