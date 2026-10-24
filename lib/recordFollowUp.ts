import { noticeRootsForRecord } from './operatorAdapters';
import type { StrikeRecord } from './strikeSync';

// Stored even when an optional enrichment stage fails or exceeds its budget.
// A plan is not a claim that an official notice exists or was verified today.
export function attachFollowUpPlans(records:StrikeRecord[],now=new Date()):StrikeRecord[] {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const horizon=new Date(Date.parse(today+'T12:00:00Z')+90*86400000).toISOString().slice(0,10);
  return records.map(r=>{
    const fields=r.timing_evidence?.fields;
    if(!fields)return r;
    return {...r,timing_evidence:{...r.timing_evidence!,fields:{...fields,followUp:{
      checkedAt:now.toISOString(),frequency:'DAILY',
      primary:r.date>=today?'SCHEDULED':'HISTORICAL',
      notice:r.date<today?'HISTORICAL':r.status==='CANCELLED'?'PRIMARY_STATUS_ONLY':r.date>horizon?'WAITING_FOR_HORIZON':noticeRootsForRecord(r).length?'SCHEDULED':'PRIMARY_ONLY',
      noticeEligibleFrom:new Date(Date.parse(r.date+'T12:00:00Z')-90*86400000).toISOString().slice(0,10),
    }}}};
  });
}
