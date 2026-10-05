import { parseStrikeTiming, type TimingCategory } from './strikeTiming';
import type { EvidenceWindow } from './strikeEvidence';

/** MIT register wording, distinct from operator-enriched operational facts. */
export type OfficialStrikeRecord = {
  unions: string; workforce: string; sector: string; relevance: string;
  region: string; province: string; area: string; mode: string;
  proclaimed: string | null; url: string; windows: EvidenceWindow[];
};
const MIT_URL = 'https://scioperi.mit.gov.it/mit2/public/scioperi';
const text = (value: unknown) => typeof value === 'string' ? value.slice(0,4000) : '';
function proclamationDate(value: unknown) {
  const raw=text(value), match=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso=match ? `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}` : raw;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date=new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===iso ? iso : null;
}
export function officialStrikeRecord(payload: unknown, category?: string, date?: string): OfficialStrikeRecord | null {
  if(!payload || typeof payload!=='object' || Array.isArray(payload)) return null;
  const raw=payload as Record<string,unknown>;
  if(!text(raw.provider) || !text(raw.sector)) return null;
  const region=text(raw.rawRegion) || text(raw.region), province=text(raw.province), mode=text(raw.modalita);
  // This is a register link, not an unvalidated arbitrary raw-payload URL.
  let url=MIT_URL;
  try { const source=new URL(text(raw.sourceUrl)); if(source.protocol==='https:' && source.hostname==='scioperi.mit.gov.it' && !source.username && !source.password && !source.port) url=source.href; } catch { /* use the official index */ }
  const supported=['TRAIN','BUS','SUBWAY','AIRPORT'].includes(category || '');
  return {unions:text(raw.unions),workforce:text(raw.provider),sector:text(raw.sector),relevance:text(raw.rilevanza),region,province,
    area:[region,province].filter(Boolean).join(' · '),mode,proclaimed:proclamationDate(raw.proclamationDate),url,
    // Only original MIT clocks. Unknown/symbolic text remains in mode; never
    // copy operator-enriched event.windows into a quote attributed to MIT.
    windows:supported?parseStrikeTiming(mode,category as TimingCategory,date).windows.map(w=>({...w,end_kind:'clock' as const})):[]};
}

export function withOfficialRecord<T extends { raw_payload?: unknown; category?: string; date?: string }>(row: T) {
  const {raw_payload,...publicRow}=row;
  return {...publicRow,official_record:officialStrikeRecord(raw_payload,row.category,row.date)};
}
