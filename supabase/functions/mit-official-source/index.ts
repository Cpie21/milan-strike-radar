// Private, read-only transport for the same two public MIT endpoints.
// No database client, model, arbitrary target, credential forwarding or cache.
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(req:Request)=>Promise<Response>):unknown};
type Dependencies={serviceKey:string;fetcher:typeof fetch;now:()=>Date};
async function boundedText(input:Request|Response,max:number) {
  const reader=input.body?.getReader();if(!reader)throw new Error('Empty body');
  const parts:Uint8Array[]=[];let length=0;
  for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw new Error('Body limit');}parts.push(value);}
  const buffer=new Uint8Array(length);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.length;}return new TextDecoder().decode(buffer);
}
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function handleMitSource(req:Request,deps:Dependencies):Promise<Response> {
  if(!deps.serviceKey || req.headers.get('authorization')!==`Bearer ${deps.serviceKey}`)return reply({error:'Unauthorized'},401);
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  let payload:{kind?:string;date?:string;nonce?:string};
  try{payload=JSON.parse(await boundedText(req,1024));}catch{return reply({error:'Invalid request'},400);}
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(deps.now());
  if(!payload || !['upcoming','history'].includes(payload.kind || '') || payload.date!==today || (payload.nonce!==undefined && (typeof payload.nonce!=='string' || !/^[a-f0-9-]{36}$/.test(payload.nonce))))return reply({error:'Invalid source or date'},400);
  const history=payload.kind==='history',method=history?'POST':'GET';
  const url='https://scioperi.mit.gov.it/mit2/public/scioperi'+(history?'/ricerca':'');
  const date=new Date(today+'T12:00:00Z'),start=new Date(date.getTime()-7*86400000),end=new Date(date.getTime()+90*86400000);
  const it=(d:Date)=>d.toISOString().slice(0,10).split('-').reverse().join('/');
  const form=history?new URLSearchParams({dataInizio:it(start),dataFine:it(end),settore:'0',rilevanza:'0',stato:'0',categoria:'',sindacato:'',submit:'Ricerca'}):undefined;
  try {
    const response=await deps.fetcher(url,{method,...(form?{body:form}:{}),redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'ItalyStrike/1.0',Accept:'text/html'}});
    if(!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')){await response.body?.cancel();throw new Error('Official response unavailable');}
    const html=await boundedText(response,2_000_000),bytes=new TextEncoder().encode(html);
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    return reply({version:1,kind:payload.kind,date:today,nonce:payload.nonce,url,method,form:form?Object.fromEntries(form):null,fetchedAt:deps.now().toISOString(),sha256,html});
  } catch(error) {
    const failure=error instanceof Error?error.name:'Error';
    console.error('MIT source transport failed',payload.kind,failure);
    return reply({error:'Official source unavailable',failure},502);
  }
}
if(typeof Deno!=='undefined')Deno.serve(req=>handleMitSource(req,{serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',fetcher:fetch,now:()=>new Date()}));
