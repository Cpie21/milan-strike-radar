import type { StrikeRecord } from './strikeSync';
import { identifyOperatorIds } from './operatorAdapters';
import { catalogSourceFor, loadNetworkCatalog } from './routeCatalogSources';
import { emptyMembership, membershipFact, projectRouteMembership, type NetworkCatalog } from './routeMembership';

// The existing source registry groups ATB and TEB. Preserve employer identity
// within that group: a TEB-only event cannot borrow all ATB bus routes.
export function catalogueForEmployer(catalog:NetworkCatalog,r:StrikeRecord):NetworkCatalog|undefined {
  if(catalog.operator!=='ATB_TEB_BERGAMO')return catalog;
  const text=[r.raw_payload?.provider||r.provider,r.timing_evidence?.fields?.lineScope?.excerpt].join(' '),atb=/\bATB\b/i.test(text),teb=/\bTEB\b/i.test(text);
  if(!atb&&!teb)return;
  return {...catalog,routes:catalog.routes.filter(x=>atb&&teb?true:teb?x.name==='T1':x.name!=='T1')};
}

export async function enrichRouteMembership(records:StrikeRecord[],warnings:string[],read:(id:string)=>Promise<NetworkCatalog>=loadNetworkCatalog,now=new Date()) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const wanted=records.filter(r=>r.date>=today&&!['STALE','CANCELLED'].includes(r.status)&&r.category!=='AIRPORT'&&r.timing_evidence?.fields);
  const operator=(r:StrikeRecord)=>{const declared=r.timing_evidence?.fields?.lineScope?.value.operatorIds;const ids=declared?.length?declared:identifyOperatorIds(r);return ids.length===1?ids[0]:null;};
  const ids=[...new Set(wanted.flatMap(r=>{const op=operator(r),s=op?catalogSourceFor(op,r.region):undefined;return s?[s.id]:[];}))];
  const catalogs=new Map<string,NetworkCatalog>();const deadline=Date.now()+45000;
  // Bounded batches; one failing publisher cannot prevent other cities syncing.
  for(let i=0;i<ids.length;i+=3)await Promise.all(ids.slice(i,i+3).map(async id=>{
    if(Date.now()>deadline){warnings.push('Route membership deferred: '+id);return;}
    try{catalogs.set(id,await read(id));}catch{warnings.push('Official route membership unavailable: '+id);}
  }));
  for(const r of wanted) {
    const f=r.timing_evidence!.fields!,op=operator(r),source=op?catalogSourceFor(op,r.region):undefined,catalog=source?catalogs.get(source.id):undefined;
    const employerCatalog=catalog?catalogueForEmployer(catalog,r):undefined;
    const v=op&&employerCatalog?projectRouteMembership(employerCatalog,r.date,r.category,r.region,op,f.lineScope?.value.networkNames || [],now):emptyMembership(op || '',r.date,r.category,r.region,source?'UNAVAILABLE':'NOT_CONFIGURED');
    // Every sync replaces old evidence, even when a source fails or is stale.
    f.routeMembership=membershipFact(v);
  }
  return {records,catalogs:catalogs.size,projected:wanted.filter(r=>r.timing_evidence?.fields?.routeMembership?.value.status==='CURRENT_CATALOG').length};
}
