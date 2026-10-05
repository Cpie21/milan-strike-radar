import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import type { LineScope } from './lineScope';

const HOSTS=new Set(['dati.comune.milano.it','romamobilita.it','www.atm.it','www.atac.roma.it','www.gtt.to.it','www.trenitalia.com','arriva.it']);
export async function transitBytes(url:string,maxBytes:number,deadline:number,headers:Record<string,string>={},method='GET') {
  const u=new URL(url);
  if(u.protocol!=='https:' || !HOSTS.has(u.hostname) || u.username || u.password || u.port) throw new Error('Unapproved transit source');
  const remaining=deadline-Date.now();
  if(remaining<100) throw new Error('Transit source deadline exceeded');
  let response:Response|undefined,current=url;
  for(let step=0;step<4;step++) {
    response=await fetch(current,{method,headers,redirect:'manual',signal:AbortSignal.timeout(Math.min(maxBytes>16_000_000?20000:8000,Math.max(100,deadline-Date.now()))),cache:'no-store'});
    if(response.status<300||response.status>=400)break;
    const location=response.headers.get('location');
    await response.body?.cancel();
    if(!location || step===3)throw new Error('Transit redirect limit');
    const next=new URL(location,current);
    if(next.protocol!=='https:' || next.hostname!==u.hostname || next.username||next.password||next.port)throw new Error('Unsafe transit redirect');
    current=next.href;
  }
  if(!response)throw new Error('Missing transit response');
  if(!response.ok) { await response.body?.cancel(); throw new Error('Transit source HTTP '+response.status); }
  if(method==='HEAD') return {bytes:Buffer.alloc(0),response};
  if(Number(response.headers.get('content-length')||0)>maxBytes) {await response.body?.cancel();throw new Error('Transit document too large');}
  const reader=response.body?.getReader();if(!reader) throw new Error('Missing transit document');
  const parts:Uint8Array[]=[];let size=0;
  while(true) {const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>maxBytes || Date.now()>deadline){await reader.cancel();throw new Error('Transit document limit exceeded');}parts.push(r.value);}
  return {bytes:Buffer.concat(parts),response};
}

export const GTFS_FEEDS={
  GTFS_MILANO:{url:'https://dati.comune.milano.it/gtfs.zip',operator:'ATM_MILANO',agency:/\bATM\b|trasporti milanesi/i},
  GTFS_ROMA:{url:'https://romamobilita.it/sites/default/files/rome_static_gtfs.zip',operator:'ATAC_ROMA',agency:/\bATAC\b/i},
} as const;
export type FeedId=keyof typeof GTFS_FEEDS;
export type RouteCatalog={feedId:FeedId;source:string;contentHash:string;checkedAt:string;validFrom:string|null;validTo:string|null;routes:{id:string;name:string;type:number;operator:string}[]};

export function parseCsv(text:string):Record<string,string>[] {
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(!field || quoted)quoted=!quoted;else throw new Error('Invalid CSV quote');}
    else if(!quoted&&(c===','||c==='\n')){row.push(field.replace(/\r$/,''));field='';if(c==='\n'){rows.push(row);row=[];}}
    else field+=c;
  }
  if(quoted)throw new Error('Unterminated CSV quote');
  if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  const header=rows.shift()?.map(h=>h.replace(/^\uFEFF/,''))||[];
  if(new Set(header).size!==header.length)throw new Error('Duplicate CSV headers');
  return rows.filter(r=>r.some(Boolean)).map(r=>{if(r.length!==header.length)throw new Error('Invalid CSV column count');return Object.fromEntries(header.map((h,i)=>[h,r[i]]));});
}
const dateIso=(d:string|undefined)=>d&&/^\d{8}$/.test(d)?d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6):null;
export function catalogFromFiles(feedId:FeedId,files:Record<string,string>,checkedAt=new Date().toISOString()):RouteCatalog {
  const feed=GTFS_FEEDS[feedId],agencies=parseCsv(files['agency.txt']||'');
  const allowed=new Set(agencies.filter(a=>feed.agency.test(a.agency_name)).map(a=>a.agency_id||''));
  if(!allowed.size)throw new Error('GTFS operator identity not found');
  const routes=parseCsv(files['routes.txt']||'').filter(r=>allowed.has(r.agency_id||'') || !r.agency_id&&agencies.length===1).map(r=>({id:r.route_id,name:r.route_short_name,type:Number(r.route_type),operator:feed.operator}));
  if(!routes.length || routes.some(r=>!r.id || !Number.isInteger(r.type)))throw new Error('Invalid GTFS routes');
  if(new Set(routes.map(r=>r.id)).size!==routes.length)throw new Error('Duplicate GTFS route ID');
  const calendar=parseCsv(files['calendar.txt']||''),exceptions=parseCsv(files['calendar_dates.txt']||''),info=parseCsv(files['feed_info.txt']||'')[0];
  const starts=calendar.map(r=>dateIso(r.start_date)).concat(exceptions.filter(r=>r.exception_type==='1').map(r=>dateIso(r.date))).filter((s):s is string=>Boolean(s)).sort();
  const ends=calendar.map(r=>dateIso(r.end_date)).concat(exceptions.filter(r=>r.exception_type==='1').map(r=>dateIso(r.date))).filter((s):s is string=>Boolean(s)).sort();
  const validFrom=dateIso(info?.feed_start_date)||starts[0]||null,validTo=dateIso(info?.feed_end_date)||ends.at(-1)||null;
  return {feedId,source:feed.url,contentHash:createHash('sha256').update(JSON.stringify(files)).digest('hex'),checkedAt,validFrom,validTo,routes};
}

// Fetch only the small directory and CSV members, not stops/trips/stop_times.
// A server ignoring Range or changing version mid-read is rejected.
export async function loadRouteCatalog(feedId:FeedId,deadline=Date.now()+20000):Promise<RouteCatalog> {
  const url=GTFS_FEEDS[feedId].url;
  const {response:head}=await transitBytes(url,0,deadline,{},'HEAD');
  let size=Number(head.headers.get('content-length'));
  const etag=head.headers.get('etag');
  let full:Buffer|undefined;
  if(!Number.isSafeInteger(size)||size<22||!etag) {
    // Some official publishers do not implement Range/version metadata. One
    // bounded archive is internally consistent; never mix unversioned ranges.
    full=(await transitBytes(url,64_000_000,deadline)).bytes;
    size=full.length;
  }
  if(size<22||size>200_000_000)throw new Error('Invalid GTFS archive size');
  async function range(start:number,end:number) {
    if(start<0||end<start||end>=size)throw new Error('GTFS member outside archive');
    if(full)return full.subarray(start,end+1);
    const r=await transitBytes(url,Math.min(end-start+1,2_000_000),deadline,{Range:'bytes='+start+'-'+end,'If-Range':etag!});
    if(r.response.status!==206 || r.response.headers.get('content-range')!=='bytes '+start+'-'+end+'/'+size || r.response.headers.get('etag')!==etag || r.bytes.length!==end-start+1)throw new Error('GTFS range/version mismatch');
    return r.bytes;
  }
  const tail=await range(Math.max(0,size-65557),size-1);
  let pos=-1;
  for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50 && i+22+tail.readUInt16LE(i+20)===tail.length){pos=i;break;}
  if(pos<0 || tail.readUInt16LE(pos+4)!==0 || tail.readUInt16LE(pos+6)!==0)throw new Error('Unsupported GTFS ZIP');
  const directorySize=tail.readUInt32LE(pos+12),offset=tail.readUInt32LE(pos+16);
  if(!directorySize||directorySize>1_000_000||offset+directorySize>size)throw new Error('Invalid GTFS directory');
  const directory=await range(offset,offset+directorySize-1);
  const wanted=new Set(['routes.txt','agency.txt','calendar.txt','calendar_dates.txt','feed_info.txt']);
  const files:Record<string,string>={};
  for(let i=0;i<directory.length;) {
    if(i+46>directory.length||directory.readUInt32LE(i)!==0x02014b50)throw new Error('Invalid ZIP member');
    const method=directory.readUInt16LE(i+10),packed=directory.readUInt32LE(i+20),unpacked=directory.readUInt32LE(i+24),nameSize=directory.readUInt16LE(i+28),extra=directory.readUInt16LE(i+30),comment=directory.readUInt16LE(i+32),local=directory.readUInt32LE(i+42);
    const name=directory.subarray(i+46,i+46+nameSize).toString('utf8');i+=46+nameSize+extra+comment;
    if(!wanted.has(name))continue;
    if(files[name]!==undefined||packed>2_000_000||unpacked>4_000_000||!packed||![0,8].includes(method))throw new Error('Unsupported GTFS CSV member');
    const h=await range(local,local+29);
    if(h.readUInt32LE(0)!==0x04034b50)throw new Error('Invalid ZIP local member');
    const start=local+30+h.readUInt16LE(26)+h.readUInt16LE(28);
    const content=await range(start,start+packed-1);
    const raw=method===8?inflateRawSync(content,{maxOutputLength:4_000_000}):content;
    if(raw.length!==unpacked)throw new Error('Invalid GTFS CSV length');
    files[name]=raw.toString('utf8');
  }
  return catalogFromFiles(feedId,files);
}

export function validateLineRoutes(scope:LineScope,catalog:RouteCatalog,date:string,category:string):LineScope {
  const value={...scope,affectedRouteIds:[],excludedRouteIds:[],gtfsFeedId:catalog.feedId};
  if(!catalog.validFrom || !catalog.validTo || date<catalog.validFrom || date>catalog.validTo) return {...value,routeValidation:'OUT_OF_VALIDITY'};
  if(scope.operatorIds.length!==1||scope.operatorIds[0]!==GTFS_FEEDS[catalog.feedId].operator)return {...value,routeValidation:'UNAVAILABLE'};
  if(!['SPECIFIC_LINES','ALL_EXCEPT'].includes(scope.kind))return {...value,routeValidation:'NOT_REQUESTED'};
  const types=category==='SUBWAY'?[1]:category==='BUS'?[0,3,11]:category==='TRAIN'?[2]:[];
  const candidates=catalog.routes.filter(r=>types.includes(r.type));
  const affected:string[]=[],excluded:string[]=[];let missing=false,ambiguous=false;
  for(const [names,out] of [[scope.affectedLineNames,affected],[scope.excludedLineNames,excluded]] as const)for(const name of names) {
    const matches=candidates.filter(r=>r.name.toUpperCase()===name.toUpperCase() ||
      // Milan publishes metro short names as 1..5, IDs as M1..M5. Require
      // both identities and metro mode, never confuse these with tram 1..5.
      catalog.feedId==='GTFS_MILANO'&&category==='SUBWAY'&&/^M[1-5]$/i.test(name)&&r.id===name.toUpperCase()&&'M'+r.name===name.toUpperCase());
    if(matches.length===1)out.push(matches[0].id);else if(!matches.length)missing=true;else ambiguous=true;
  }
  // IDs are local to gtfsFeedId. No fuzzy matching, zero stripping, or invented IDs.
  return {...value,affectedRouteIds:affected,excludedRouteIds:excluded,routeValidation:ambiguous?'AMBIGUOUS':missing?'PARTIAL':'VERIFIED'};
}
