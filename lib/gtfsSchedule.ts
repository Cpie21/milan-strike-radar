import * as cheerio from 'cheerio';
import { verifyGestAlias } from './gestAliasRefresh';
import { GEST_ALIAS_SOURCE } from './canonicalLineAlias';
import { createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createHash } from 'node:crypto';
import { transitBytes, resolveGtfsSource, GTFS_FEEDS, type FeedId } from './officialTransitData';
import { gtfsSeconds, validServiceDate, type ScheduleIndex, type RouteService } from './serviceSchedule';

// Version-consistent archive; inflate only timetable members, never shapes.
// Streaming avoids materialising Milan's >400 MB stop_times table as objects.
export async function scheduleFromArchive(feedId:FeedId,archive:Buffer,deadline=Date.now()+90000):Promise<ScheduleIndex> {
  if(archive.length>64_000_000)throw new Error('Schedule ZIP limit');
  let end=-1;
  for(let i=archive.length-22;i>=Math.max(0,archive.length-65557);i--)if(archive.readUInt32LE(i)===0x06054b50&&i+22+archive.readUInt16LE(i+20)===archive.length){end=i;break;}
  if(end<0||archive.readUInt16LE(end+4)||archive.readUInt16LE(end+6)||archive.readUInt16LE(end+8)!==archive.readUInt16LE(end+10))throw new Error('Unsupported schedule ZIP');
  const size=archive.readUInt32LE(end+12),offset=archive.readUInt32LE(end+16);
  if(!size||size>1_000_000||offset+size!==end)throw new Error('Invalid schedule directory');
  const entries=new Map<string,{method:number;packed:number;unpacked:number;start:number;crc:number}>();
  const wanted=new Set(['agency.txt','routes.txt','calendar.txt','calendar_dates.txt','feed_info.txt','trips.txt','stop_times.txt','frequencies.txt',...(feedId==='GTFS_GEST'?['stops.txt']:[])]);
  for(let i=offset;i<offset+size;) {
    if(i+46>offset+size||archive.readUInt32LE(i)!==0x02014b50)throw new Error('Invalid schedule member');
    const flags=archive.readUInt16LE(i+8),method=archive.readUInt16LE(i+10),crc=archive.readUInt32LE(i+16),packed=archive.readUInt32LE(i+20),unpacked=archive.readUInt32LE(i+24),ns=archive.readUInt16LE(i+28),extra=archive.readUInt16LE(i+30),comment=archive.readUInt16LE(i+32),local=archive.readUInt32LE(i+42);
    const name=archive.subarray(i+46,i+46+ns).toString();i+=46+ns+extra+comment;
    if(i>offset+size)throw new Error('Invalid schedule name');
    if(!wanted.has(name))continue;
    const cap=name==='stop_times.txt'?512_000_000:name==='trips.txt'?64_000_000:8_000_000;
    if(entries.has(name)||flags&1||![0,8].includes(method)||unpacked>cap||packed>64_000_000||local+30>offset||archive.readUInt32LE(local)!==0x04034b50||archive.readUInt16LE(local+8)!==method)throw new Error('Unsupported schedule member');
    const nameStart=local+30,start=nameStart+archive.readUInt16LE(local+26)+archive.readUInt16LE(local+28);
    if(archive.subarray(nameStart,nameStart+archive.readUInt16LE(local+26)).toString()!==name||start+packed>offset)throw new Error('Schedule member bounds');
    entries.set(name,{method,packed,unpacked,start,crc});
  }
  if(entries.size<4||!entries.has('agency.txt')||!entries.has('routes.txt')||!entries.has('trips.txt')||!entries.has('stop_times.txt')||!entries.has('calendar.txt')&&!entries.has('calendar_dates.txt'))throw new Error('Missing schedule files');
  const hash=createHash('sha256').update(archive).digest('hex');
  // CRC detects corrupt official archives instead of publishing partial results.
  const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  async function csv(name:string,onRow:(row:Record<string,string>)=>void) {
    const entry=entries.get(name);if(!entry)return;
    const content=archive.subarray(entry.start,entry.start+entry.packed);
    const stream=Readable.from((function*(){for(let i=0;i<content.length;i+=65536)yield content.subarray(i,i+65536);})());
    const input=entry.method===8?stream.pipe(createInflateRaw()):stream;
    const decoder=new StringDecoder('utf8');let rawSize=0,crc=0xffffffff,pending='',quoted=false,scan=0;
    let headers:string[]|null=null;
    function row(text:string) {
      if(!text.trim())return;
      const fields:string[]=[];let field='',q=false;
      for(let i=0;i<text.length;i++) {
        const c=text[i];
        if(c==='"'){if(q&&text[i+1]==='"'){field+='"';i++;}else if(!field||q)q=!q;else throw new Error('Invalid schedule CSV quote');}
        else if(c===','&&!q){fields.push(field);field='';}else field+=c;
      }
      if(q)throw new Error('Unterminated schedule CSV quote');fields.push(field.replace(/\r$/,''));
      if(!headers){headers=fields.map(f=>f.replace(/^\uFEFF/,''));if(new Set(headers).size!==headers.length)throw new Error('Duplicate schedule header');return;}
      if(fields.length!==headers.length)throw new Error('Invalid schedule CSV row');
      const result:Record<string,string>={};for(let i=0;i<headers.length;i++)result[headers[i]]=fields[i];onRow(result);
    }
    try {
      for await(const chunk of input) {
        if(Date.now()>deadline)throw new Error('Schedule processing deadline');
        const b=chunk as Buffer;rawSize+=b.length;if(rawSize>entry.unpacked)throw new Error('Schedule inflate limit');
        for(const v of b)crc=table[(crc^v)&255]^(crc>>>8);
        pending+=decoder.write(b);
        let consumed=0;
        for(;scan<pending.length;scan++) {
          if(pending[scan]==='"') {
            if(scan===pending.length-1)break;
            if(quoted&&pending[scan+1]==='"'){scan++;continue;}
            quoted=!quoted;
          } else if(pending[scan]==='\n'&&!quoted){row(pending.slice(consumed,scan));consumed=scan+1;}
        }
        pending=pending.slice(consumed);scan-=consumed;
        if(pending.length>1_000_000)throw new Error('Schedule CSV row limit');
      }
      pending+=decoder.end();if(pending.trim())row(pending);
      if(rawSize!==entry.unpacked||((crc^0xffffffff)>>>0)!==entry.crc)throw new Error('Schedule checksum mismatch');
    } finally {input.destroy();stream.destroy();}
  }
  const small:Record<string,string>[]=[];
  await csv('agency.txt',r=>small.push(r));
  const feed=GTFS_FEEDS[feedId],allowed=new Set(small.filter(r=>feed.agency.test(r.agency_name)&&r.agency_timezone==='Europe/Rome').map(r=>r.agency_id||''));
  if(!allowed.size)throw new Error('Schedule agency/timezone not verified');
  const routes:ScheduleIndex['routes']=[];
  await csv('routes.txt',r=>{if(allowed.has(r.agency_id||'')||!r.agency_id&&small.length===1)routes.push({id:r.route_id,name:r.route_short_name,longName:r.route_long_name,type:Number(r.route_type)});});
  if(!routes.length||routes.some(r=>!r.id||!Number.isInteger(r.type))||new Set(routes.map(r=>r.id)).size!==routes.length)throw new Error('Invalid schedule routes');
  const routeIds=new Set(routes.map(r=>r.id)),calendar:Record<string,string>[]=[],exceptions:Record<string,string>[]=[],info:Record<string,string>[]=[];
  await csv('calendar.txt',r=>calendar.push(r));await csv('calendar_dates.txt',r=>exceptions.push(r));await csv('feed_info.txt',r=>info.push(r));
  const iso=(d:string)=>d&&/^\d{8}$/.test(d)?d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6):'';
  if(calendar.some(c=>!c.service_id||!validServiceDate(iso(c.start_date))||!validServiceDate(iso(c.end_date))||c.start_date>c.end_date||['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].some(k=>!['0','1'].includes(c[k])))||exceptions.some(c=>!c.service_id||!validServiceDate(iso(c.date))||!['1','2'].includes(c.exception_type))||new Set(calendar.map(c=>c.service_id)).size!==calendar.length)throw new Error('Invalid schedule calendar');
  const uniqueExceptions=new Map<string,Record<string,string>>();
  for(const c of exceptions){const key=c.service_id+'|'+c.date,prior=uniqueExceptions.get(key);if(prior&&prior.exception_type!==c.exception_type)throw new Error('Conflicting schedule exception');uniqueExceptions.set(key,c);}
  exceptions.splice(0,exceptions.length,...uniqueExceptions.values());
  const knownServices=new Set([...calendar,...exceptions].map(c=>c.service_id));
  type Trip={routeId:string;serviceId:string;first:number;end:number;seq:number;endSeq:number;seen:boolean;bad:boolean;frequency:boolean};
  const stops=new Map<string,string>(),edges=new Map<string,{first:number;last:number;a:string;b:string}>();
  if(feedId==='GTFS_GEST')await csv('stops.txt',r=>stops.set(r.stop_id,r.stop_name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()));
  const aliasRoute=routes.find(r=>r.name==='T1.3'&&r.type===0);
  let identityBad=false;
  const trips=new Map<string,Trip>();
  await csv('trips.txt',r=>{if(!routeIds.has(r.route_id))return;if(!r.trip_id||trips.has(r.trip_id)||!knownServices.has(r.service_id)||trips.size>=800000)throw new Error('Invalid/oversize schedule trips');trips.set(r.trip_id,{routeId:r.route_id,serviceId:r.service_id,first:Infinity,end:-1,seq:Infinity,endSeq:-1,seen:false,bad:false,frequency:false});});
  await csv('frequencies.txt',r=>{const t=trips.get(r.trip_id);if(t)t.frequency=true;}); // Frequency service has no exact final trip: refuse a fake clock.
  await csv('stop_times.txt',r=>{
    const t=trips.get(r.trip_id);if(!t)return;
    const seq=Number(r.stop_sequence);if(!Number.isSafeInteger(seq)||seq<0){t.bad=true;return;}
    if(feedId==='GTFS_GEST'&&t.routeId===aliasRoute?.id){const name=stops.get(r.stop_id);if(!name)identityBad=true;else{const e=edges.get(r.trip_id)||{first:seq,last:seq,a:name,b:name};if(seq<e.first){e.first=seq;e.a=name;}if(seq>e.last){e.last=seq;e.b=name;}edges.set(r.trip_id,e);}}
    const arrival=gtfsSeconds(r.arrival_time),departure=gtfsSeconds(r.departure_time);
    // Missing interior interpolated times are permitted. Missing passenger terminal times are not.
    if(r.pickup_type!=='1'&&seq<t.seq){t.seq=seq;t.first=departure??Infinity;}
    if(r.drop_off_type!=='1'&&seq>t.endSeq){t.endSeq=seq;t.end=arrival??-1;}
    t.seen=true;
  });
  const groups=new Map<string,RouteService>();
  for(const t of trips.values()) {
    const key=t.routeId+'|'+t.serviceId,g=groups.get(key)||{routeId:t.routeId,serviceId:t.serviceId,trips:0,complete:true,first:Infinity,lastDeparture:-1,lastArrival:-1};
    g.trips++;g.complete&&=t.seen&&!t.bad&&!t.frequency&&Number.isFinite(t.first)&&t.end>=t.first;
    if(Number.isFinite(t.first)){g.first=Math.min(g.first,t.first);g.lastDeparture=Math.max(g.lastDeparture,t.first);}g.lastArrival=Math.max(g.lastArrival,t.end);groups.set(key,g);
  }
  const from=calendar.map(c=>iso(c.start_date)).concat(exceptions.filter(c=>c.exception_type==='1').map(c=>iso(c.date))).sort();
  const to=calendar.map(c=>iso(c.end_date)).concat(exceptions.filter(c=>c.exception_type==='1').map(c=>iso(c.date))).sort();
  const declaredFrom=iso(info[0]?.feed_start_date),declaredTo=iso(info[0]?.feed_end_date);
  return {...(feedId==='GTFS_GEST'?{identityEndpoints:identityBad||edges.size!==[...trips.values()].filter(t=>t.routeId===aliasRoute?.id).length?[]:[...new Set([...edges.values()].map(e=>e.a+'|'+e.b))]}:{}),feedId,operator:feed.operator,source:feed.url,checkedAt:new Date().toISOString(),contentHash:hash,timezone:'Europe/Rome',validFrom:declaredFrom||from[0]||null,validTo:declaredTo||to.at(-1)||null,...(feedId==='GTFS_MILANO'?{modeValidTo:{...(iso(info[0]?.surface_end_date)?{BUS:iso(info[0].surface_end_date)}:{}),...(iso(info[0]?.mm_end_date)?{SUBWAY:iso(info[0].mm_end_date)}:{})}}:{}),routes,calendar,exceptions,services:[...groups.values()].map(g=>({...g,first:Number.isFinite(g.first)?g.first:0}))};
}
export async function loadScheduleIndex(id:FeedId,deadline=Date.now()+45000) {
  const url=await resolveGtfsSource(id,deadline);
  const {bytes}=await transitBytes(url,64_000_000,deadline);
  const index={...await scheduleFromArchive(id,bytes,deadline),source:url};
  if(id==='GTFS_GEST'){
    index.aliasVerification={status:'UNAVAILABLE',source:GEST_ALIAS_SOURCE,catalogSource:url,checkedAt:index.checkedAt,validFrom:index.validFrom,validTo:index.validTo,endpoints:index.identityEndpoints||[]};
    try{const html=(await transitBytes(GEST_ALIAS_SOURCE,1_000_000,deadline)).bytes.toString('utf8');index.aliasVerification=verifyGestAlias({...index,feedId:id,routes:index.routes.map(r=>({...r,operator:index.operator}))},cheerio.load(html)('body').text(),index.identityEndpoints||[]);}catch{/* No extension without primary evidence. */}
  }
  return index;
}
