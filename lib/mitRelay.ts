import { createHash, randomUUID } from 'node:crypto';

const RELAY = 'https://italystrike-mit-source.cloudflare-mit-source.workers.dev/source';
const MIT = 'https://scioperi.mit.gov.it/mit2/public/scioperi';
export type MitAcquisition = { transport:'DIRECT'|'IPV4'|'ITALY_RELAY'; kind:'upcoming'|'history'; fetchedAt:string; sha256:string; records:number };

export function mitRelayConfigured() {
  return process.env.MIT_RELAY_URL === RELAY && (process.env.MIT_RELAY_TOKEN?.length || 0) >= 32;
}

// The relay is a transport, never a substitute publisher or a cached data source.
export async function fetchMitRelay(url:string, options:RequestInit, today:string) {
  if (!mitRelayConfigured()) throw new Error('MIT relay is not configured');
  const history = url === `${MIT}/ricerca`;
  if (url !== MIT && !history) throw new Error('Unapproved MIT relay source');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('Invalid MIT relay date');
  const kind = history ? 'history' : 'upcoming', method = history ? 'POST' : 'GET';
  const shift = (days:number) => new Date(new Date(today+'T12:00:00Z').getTime()+days*86400000).toISOString().slice(0,10).split('-').reverse().join('/');
  const form = history ? {dataInizio:shift(-7),dataFine:shift(90),settore:'0',rilevanza:'0',stato:'0',categoria:'',sindacato:'',submit:'Ricerca'} : null;
  if ((options.method || 'GET') !== method || (history ? !(options.body instanceof URLSearchParams) || options.body.size !== Object.keys(form!).length || Object.entries(form!).some(([key,value])=>options.body instanceof URLSearchParams && options.body.get(key)!==value) : options.body != null)) throw new Error('Unapproved MIT relay form');
  const nonce=randomUUID(), began=Date.now();
  const response=await fetch(RELAY,{method:'POST',headers:{authorization:`Bearer ${process.env.MIT_RELAY_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({kind,date:today,nonce}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
  if (!response.ok) { await response.body?.cancel(); throw new Error(`MIT relay returned HTTP ${response.status}`); }
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty MIT relay receipt');
  const parts:Uint8Array[]=[];let size=0;
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4_000_000){await reader.cancel();throw new Error('MIT relay receipt too large');}parts.push(part.value);}
  const data=JSON.parse(Buffer.concat(parts).toString('utf8'));
  const fetched=Date.parse(data.fetchedAt), now=Date.now();
  if(data.version!==1 || data.kind!==kind || data.date!==today || data.nonce!==nonce || data.url!==url || data.method!==method || JSON.stringify(data.form)!==JSON.stringify(form) || !Number.isFinite(fetched) || fetched<began-5000 || fetched>now+5000 || now-fetched>60000 || typeof data.html!=='string' || Buffer.byteLength(data.html)>2_000_000 || data.sha256!==createHash('sha256').update(data.html).digest('hex')) throw new Error('Invalid or stale MIT relay receipt');
  return {html:data.html as string,fetchedAt:data.fetchedAt as string,sha256:data.sha256 as string};
}
