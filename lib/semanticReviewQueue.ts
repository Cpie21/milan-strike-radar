import type { SupabaseClient } from '@supabase/supabase-js';
import { REVIEW_VERSION, type SemanticReview } from './strikeSemanticReview';

// Only service_role can read the backing cache. No public HTTP endpoint.
// A later successful review must clear an older flag for the same source.
export function pendingSemanticReviews(rows: {input_hash:string;checked_at:string;result:SemanticReview|null}[]) {
  const latest=new Map<string,SemanticReview>();
  for(const row of [...rows].sort((a,b)=>b.checked_at.localeCompare(a.checked_at))) {
    const review=row.result;
    if(!review || review.version!==REVIEW_VERSION)continue;
    const key=review.source_key || row.input_hash;
    if(!latest.has(key))latest.set(key,review);
  }
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return [...latest.values()].filter(r=>{
    const date=(r.end_date || r.date || '').replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,(_,d,m,y)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
    return (!date || date>=today) && ['NEEDS_REVIEW','FLAGGED'].includes(r.disposition);
  });
}
export async function readSemanticReviewQueue(db:SupabaseClient) {
  const rows=[];
  for(let offset=0;offset<10000;offset+=1000) {
    const {data,error}=await db.from('strike_semantic_reviews').select('input_hash,checked_at,result')
      .eq('state','success').eq('result->>version',REVIEW_VERSION).order('checked_at',{ascending:false}).range(offset,offset+999);
    if(error)throw new Error('Cannot read semantic review queue');
    rows.push(...(data || []));
    if(!data || data.length<1000)return pendingSemanticReviews(rows);
  }
  throw new Error('Review queue exceeds pagination bound');
}
