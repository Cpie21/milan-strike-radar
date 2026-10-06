import * as cheerio from 'cheerio';
import { extractText } from 'unpdf';
import { transitBytes } from './officialTransitData';
import { operatorGuaranteeProfiles, type Profile } from './operatorGuaranteeProfiles';

export async function fetchProfileDocument(url:string,deadline=Date.now()+15000) {
  const {bytes,response}=await transitBytes(url,12_000_000,deadline);
  if(/application\/pdf/i.test(response.headers.get('content-type')||'') || bytes.subarray(0,4).toString()==='%PDF') {
    return (await extractText(new Uint8Array(bytes),{mergePages:true})).text;
  }
  return bytes.toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ');
}
export const PROFILE_INDEXES:Record<string,string>={
  ATM_MILANO:'https://www.atm.it/IT/ILGRUPPO/CHISIAMO/Pagine/CartaMobilita.aspx',
  ATAC_ROMA:'https://www.atac.roma.it/customer-experience/carta-dei-servizi',
  ARRIVA_BERGAMO:'https://bergamo.arriva.it/documenti-e-moduli/',
};
export function discoverProfileDocument(operator:string,html:string,index:string) {
  if(PROFILE_INDEXES[operator]!==index)throw new Error('Unapproved guarantee index');
  const $=cheerio.load(html),links:string[]=[];
  $('a[href]').each((_,a)=>{
    const text=$(a).text().replace(/\s+/g,' ').trim(),href=$(a).attr('href')!;
    let u:URL;try{u=new URL(href,index);}catch{return;}
    if(u.protocol!=='https:'||u.username||u.password||u.port||!u.pathname.toLowerCase().endsWith('.pdf'))return;
    const name=decodeURIComponent(u.pathname);
    if(operator==='ATM_MILANO'&&u.hostname==='www.atm.it'&&/^Scaricate$/i.test(text)&&/Carta.*Mobilit.*ATM/i.test(name))links.push(u.href);
    if(operator==='ATAC_ROMA'&&u.hostname==='www.atac.roma.it'&&/Carta.*servizi del trasporto pubblico \d{4}$/i.test(text)&&!/complementari/i.test(text))links.push(u.href);
    if(operator==='ARRIVA_BERGAMO'&&u.hostname==='arriva.it'&&/^Carta della mobilità di Bergamo$/i.test(text)&&/BERGAMO.*Carta/i.test(name))links.push(u.href);
  });
  const unique=[...new Set(links)];
  if(unique.length!==1)throw new Error('Ambiguous or missing current guarantee document');
  return unique[0];
}
export async function fetchCurrentProfileDocument(url:string) {
  const profile=operatorGuaranteeProfiles.find(p=>p.source===url),index=profile&&PROFILE_INDEXES[profile.operator];
  const deadline=Date.now()+20000;
  if(index){const {bytes}=await transitBytes(index,1_000_000,deadline);url=discoverProfileDocument(profile!.operator,bytes.toString('utf8'),index);}
  return {text:await fetchProfileDocument(url,deadline),source:url,fetchedAt:new Date().toISOString()};
}
export function ruleStillMatches(profile:Profile,text:string) {
  const normalized=text.replace(/[\u0000-\u0008]/g,'').replace(/\s+/g,' ').replace(/[,:]/g,'.');
  const sections=[...normalized.matchAll(/(?:in caso di sciopero|in occasione di scioperi|nelle giornate di sciopero|fasce di garanzi[ae]|servizio urbano e suburbano)[\s\S]{0,1500}/gi)].map(m=>m[0]);
  // A complete clock may be followed by a range separator and the next hour.
  // Only the bare-hour alternative must reject a different minute suffix.
  const clock=(s:string)=>'\\b0?'+Number(s.slice(0,2))+(s.slice(3)==='00'?'(?:\\s*[.\\-]\\s*00(?!\\d)|(?!\\s*[.\\-]\\s*\\d))':'\\s*[.\\-]\\s*'+s.slice(3)+'(?!\\d)')+'\\b';
  return sections.some(section=>[...profile.weekday,...(profile.holiday||[])].every(w=>w.end!==null&&new RegExp((w.start===null?'':clock(w.start)+'[\\s\\S]{0,80}')+clock(w.end)).test(section)) &&
    (profile.operator!=='TRENITALIA_REGIONALE'||/feriali/i.test(section)&&/festivi/i.test(section)&&/numero di treno/i.test(section)));
}
export async function refreshGuaranteeProfiles(now:Date,warnings:string[],loader:(url:string)=>Promise<string|{text:string;fetchedAt:string;source?:string}>=fetchCurrentProfileDocument):Promise<Profile[]> {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const values=await Promise.all(operatorGuaranteeProfiles.map(async p=>{
    try {
      const doc=await loader(p.source);
      const text=typeof doc==='string'?doc:doc.text;
      const checkedAt=typeof doc==='string'?today:doc.fetchedAt.slice(0,10);
      const validTo=new Date(new Date(checkedAt+'T12:00:00Z').getTime()+30*86400000).toISOString().slice(0,10);
      if(!ruleStillMatches(p,text)){warnings.push('Operator guarantee rule changed or unverified: '+p.operator);return null;}
      if(today>validTo)return null;
      return {...p,source:typeof doc==='string'?p.source:doc.source||p.source,validFrom:checkedAt,validTo,checkedAt};
    } catch {
      warnings.push('Operator guarantee source unavailable: '+p.operator);
      return today>=p.validFrom&&today<=p.validTo?p:null;
    }
  }));
  return values.filter((p):p is Profile=>Boolean(p));
}
