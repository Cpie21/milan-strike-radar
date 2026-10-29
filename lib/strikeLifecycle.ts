import type { RawStrikeRow, StrikeRecord } from './strikeSync';
import type { TimingSource } from './strikeEvidence';

export type LifecycleAction = 'POSTPONED' | 'WITHDRAWN' | 'SUSPENDED';
export type LifecycleChange = { action: LifecycleAction; newDate: string | null; statement: string };
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Inflected verbs AND nouns occur in the official calendar (e.g.
// "DIFFERIMENTO" in Note while the broad general strike remains In Programma).
export function lifecycleAction(text: string): LifecycleAction | null {
  const value = normalize(text);
  const tokens = /\b(differit[oaie]|differiment[oi]|rinviat[oaie]|rinvio|rimandat[oaie]|revocat[oaie]|revoca|annullat[oaie]|annullamento|sospes[oaie]|sospensione)\b/g;
  for (const match of value.matchAll(tokens)) {
    const before = value.slice(Math.max(0, match.index! - 65), match.index);
    // A request, a possibility, or an explicit refusal is not a decision.
    if (/\b(?:non|nessun[ao]?|senza)\b[^.;]{0,40}$/.test(before) || /\b(?:richiest[ao]|invit[oa]|chiede|invita|propost[ao]|potrebbe|eventuale)\b[^.;]{0,40}$/.test(before)) continue;
    return /differ|rinvi|rimand/.test(match[0]) ? 'POSTPONED' : /sosp/.test(match[0]) ? 'SUSPENDED' : 'WITHDRAWN';
  }
  return null;
}

export function lifecycleModes(text: string): StrikeRecord['category'][] {
  const value = normalize(text), modes: StrikeRecord['category'][] = [];
  if (/settori (?:dei )?trasporti|tutti i settori|intero sciopero/.test(value)) return ['TRAIN', 'BUS', 'SUBWAY', 'AIRPORT'];
  if (/ferroviar|\btreni\b|railway/.test(value)) modes.push('TRAIN');
  if (/aereo|aeroport|aviazion/.test(value)) modes.push('AIRPORT');
  if (/trasporto pubblico(?: locale)?|\btpl\b/.test(value)) modes.push('BUS', 'SUBWAY');
  if (/autobus|automobilistic|\bbus\b|\btram\b|superficie/.test(value)) modes.push('BUS');
  if (/metropolitan|\bmetro\b/.test(value)) modes.push('SUBWAY');
  return [...new Set(modes)];
}

export function primaryLifecycle(row: RawStrikeRow, category: StrikeRecord['category']): LifecycleChange | null {
  // A terminal state in the source's dedicated status field applies to the
  // declaration. Notes, in contrast, can defer only one of several modes.
  const statusAction = lifecycleAction(row.sourceStatus || '');
  if (statusAction) return { action: statusAction, newDate: replacementDate(row.sourceStatus! + ' ' + row.note, row.date), statement: [row.sourceStatus, row.note].filter(Boolean).join(': ') };
  for (const clause of [row.note, row.modalita].filter(Boolean).join(';').split(/[;\n]|\.(?=\s+[A-Z])/)) {
    const action = lifecycleAction(clause);
    if (!action) continue;
    // Do not apply a withdrawal of a different dated strike mentioned in a note.
    const mentioned = /sciopero\s+(?:previsto\s+)?(?:del|per il)\s+(\d{1,2})[/.](\d{1,2})/i.exec(clause);
    if (mentioned && (Number(row.date.split('/')[0]) !== Number(mentioned[1]) || Number(row.date.split('/')[1]) !== Number(mentioned[2]))) continue;
    const modes = lifecycleModes(clause);
    if (modes.length && !modes.includes(category)) continue;
    // "Escluso aereo" in a broad transport decision keeps aviation untouched.
    const exclusion = /esclus[oi]\s+([^;.]+)/i.exec(clause);
    if (exclusion && lifecycleModes(exclusion[1]).includes(category)) continue;
    return { action, newDate: replacementDate(clause, row.date), statement: clause.trim() };
  }
  return null;
}

function replacementDate(text: string, original: string): string | null {
  const months = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  const match = /\b(?:al|a|per il)\s+(\d{1,2})(?:[/.](\d{1,2})[/.](\d{4})|\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(\d{4}))?)/.exec(normalize(text));
  if (!match) return null;
  const year = match[3] || match[5] || original.split('/')[2], month = match[2] || String(months.indexOf(match[4]) + 1);
  const date = `${year}-${month.padStart(2,'0')}-${match[1].padStart(2,'0')}`;
  return !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date ? date : null;
}

export function applyLifecycle(record: StrikeRecord, change: LifecycleChange, source: TimingSource, authority: 'MIT' | 'OPERATOR_OFFICIAL'): StrikeRecord {
  const fields = record.timing_evidence?.fields;
  return {
    ...record, status: 'CANCELLED', strike_windows: [], guarantee_windows: [],
    display_time: lifecycleLabel(change, 'zh'), duration_hours: '',
    timing_evidence: {
      windows: [], confidence: 'official', conflicts: [], unions: record.raw_payload?.unions || '',
      sources: [source],
      ...(fields ? { fields: { ...fields, lifecycle: { value: change, confidence: 'HIGH' as const, source: authority, method: 'OFFICIAL' as const, url: source.url, excerpt: source.excerpt }, timing: { ...fields.timing, value: [] }, guaranteeSource: 'UNKNOWN' as const, guaranteedServiceWindow: { ...fields.guaranteedServiceWindow, value: [] }, guaranteeEvidenceWindows: undefined, guaranteeDuringStrike: undefined } } : {}),
    },
  };
}

export function lifecycleLabel(change: LifecycleChange, lang: 'zh' | 'en') {
  return change.action === 'POSTPONED' ? (lang === 'zh' ? `已延期 · ${change.newDate || '新日期待公布'}` : `Postponed · ${change.newDate || 'new date pending'}`) : change.action === 'SUSPENDED' ? (lang === 'zh' ? '已暂停' : 'Suspended') : (lang === 'zh' ? '已撤销' : 'Withdrawn');
}

type PriorRecord = Pick<StrikeRecord, 'source_key' | 'date' | 'region' | 'category' | 'provider' | 'status' | 'display_time' | 'duration_hours' | 'strike_windows' | 'guarantee_windows' | 'affected_lines' | 'data_source' | 'timing_evidence' | 'raw_payload'>;
// Operator discovery excludes cancelled declarations. Keep its previously
// published city projections as cancellations, so calendar subscribers receive
// an update under the original identity instead of an event silently vanishing.
export function propagatePrimaryLifecycle(records: StrikeRecord[], prior: PriorRecord[]): StrikeRecord[] {
  const identity = (r: PriorRecord) => JSON.stringify([r.source_key, r.date, r.region, r.category]);
  const present = new Set(records.map(identity)), result = [...records];
  for (const old of prior) {
    if (!old.source_key || present.has(identity(old)) || !['CONFIRMED','UNCERTAIN','REQUIRES_DETAIL','CANCELLED'].includes(old.status)) continue;
    const current = records.find(r => r.source_key === old.source_key && r.date === old.date && r.region === 'NATIONAL' && r.status === 'CANCELLED' && r.raw_payload && primaryLifecycle(r.raw_payload, old.category) && r.timing_evidence?.fields?.lifecycle?.source === 'MIT');
    const change = current?.raw_payload && primaryLifecycle(current.raw_payload, old.category), source = current?.timing_evidence?.sources[0];
    if (!current || !change || !source) continue;
    result.push(applyLifecycle({ ...current, ...old, raw_payload: current.raw_payload, source_url: current.source_url, last_seen_at: current.last_seen_at }, change, source, 'MIT'));
    present.add(identity(old));
  }
  return result;
}
