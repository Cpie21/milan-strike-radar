import { request } from 'node:https';
import { SOURCE_USER_AGENT } from './sourceRequest';

export function mitConnectionFailure(error:unknown) {
  const e=error as {name?:string;cause?:{code?:string}};
  return e?.name==='TimeoutError' || ['UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','ETIMEDOUT','ECONNRESET'].includes(e?.cause?.code || '');
}

// One alternate connection inside the existing retry bound. Same official
// host, normal DNS, IPv4 and normal certificate validation; no proxy or bypass.
export async function fetchMitIpv4(input:string,options:RequestInit,signal:AbortSignal):Promise<Response> {
  const url=new URL(input),method=options.method || 'GET';
  if(url.protocol!=='https:' || url.hostname!=='scioperi.mit.gov.it' || url.port || url.username || url.password || url.search || url.hash || !['/mit2/public/scioperi','/mit2/public/scioperi/ricerca'].includes(url.pathname) || !['GET','POST'].includes(method))throw new Error('Unapproved primary source request');
  if(options.body && !(options.body instanceof URLSearchParams))throw new Error('Unsupported primary form body');
  const body=options.body?.toString();
  return new Promise((resolve,reject)=>{
    const req=request(url,{method,signal,family:4,agent:false,rejectUnauthorized:true,headers:{'User-Agent':SOURCE_USER_AGENT,Accept:'text/html',...(body?{'Content-Type':'application/x-www-form-urlencoded','Content-Length':String(Buffer.byteLength(body))}:{})}},response=>{
      const parts:Buffer[]=[];let size=0;
      response.on('data',(part:Buffer)=>{size+=part.length;if(size>2_000_000){req.destroy(new Error('Primary source body exceeds size limit'));return;}parts.push(part);});
      response.on('error',reject);
      response.on('aborted',()=>reject(new Error('Primary source response interrupted')));
      response.on('end',()=>{const status=response.statusCode || 502;resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(parts),{status,headers:{'Content-Type':String(response.headers['content-type'] || '')}}));});
    });
    req.on('error',reject);req.end(body);
  });
}
