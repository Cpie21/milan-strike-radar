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
export function ruleStillMatches(profile:Profile,text:string) {
  const normalized=text.replace(/[\u0000-\u0008]/g,'').replace(/\s+/g,' ').replace(/[,:]/g,'.');
  const sections=[...normalized.matchAll(/(?:in caso di sciopero|nelle giornate di sciopero|fasce di garanzi[ae]|servizio urbano e suburbano)[\s\S]{0,1500}/gi)].map(m=>m[0]);
  const clock=(s:string)=>'\\b0?'+Number(s.slice(0,2))+(s.slice(3)==='00'?'(?:\\s*[.\\-]\\s*00)?(?!\\s*[.\\-]\\s*\\d)':'\\s*[.\\-]\\s*'+s.slice(3))+'\\b';
  return sections.some(section=>[...profile.weekday,...(profile.holiday||[])].every(w=>w.end!==null&&new RegExp((w.start===null?'':clock(w.start)+'[\\s\\S]{0,80}')+clock(w.end)).test(section)) &&
    (profile.operator!=='TRENITALIA_REGIONALE'||/feriali/i.test(section)&&/festivi/i.test(section)&&/numero di treno/i.test(section)));
}
export async function refreshGuaranteeProfiles(now:Date,warnings:string[],loader:(url:string)=>Promise<string|{text:string;fetchedAt:string}>=fetchProfileDocument):Promise<Profile[]> {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const values=await Promise.all(operatorGuaranteeProfiles.map(async p=>{
    try {
      const doc=await loader(p.source);
      const text=typeof doc==='string'?doc:doc.text;
      const checkedAt=typeof doc==='string'?today:doc.fetchedAt.slice(0,10);
      const validTo=new Date(new Date(checkedAt+'T12:00:00Z').getTime()+30*86400000).toISOString().slice(0,10);
      if(!ruleStillMatches(p,text)){warnings.push('Operator guarantee rule changed or unverified: '+p.operator);return null;}
      if(today>validTo)return null;
      return {...p,validFrom:checkedAt,validTo,checkedAt};
    } catch {
      warnings.push('Operator guarantee source unavailable: '+p.operator);
      return today>=p.validFrom&&today<=p.validTo?p:null;
    }
  }));
  return values.filter((p):p is Profile=>Boolean(p));
}
