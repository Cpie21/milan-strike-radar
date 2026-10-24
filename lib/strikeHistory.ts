import type { StrikeRecord } from './strikeSync';
import { intersectGuaranteeEvidence } from './operatorGuaranteeProfiles';

type HistoricalRecord = Pick<StrikeRecord, 'source_key' | 'date' | 'region' | 'category' | 'provider' | 'status' | 'display_time' | 'duration_hours' | 'strike_windows' | 'guarantee_windows' | 'affected_lines' | 'data_source' | 'timing_evidence' | 'raw_payload'>;

const identity = (r: HistoricalRecord) => JSON.stringify([r.source_key, r.date, r.region, r.category]);
// "In Programma" becoming "Effettuato" is a lifecycle change, not a timing
// revision. Cancellation still wins below; changes to any substantive primary
// declaration invalidate the saved operational snapshot.
const declaration = (r: HistoricalRecord) => {
  const raw = r.raw_payload;
  return raw ? JSON.stringify([raw.date, raw.endDate, raw.provider, raw.sector, raw.modalita, raw.note || '', raw.rilevanza, raw.rawRegion, raw.province, raw.unions, raw.proclamationDate]) : null;
};

export function preserveHistoricalEvidence(records: StrikeRecord[], prior: HistoricalRecord[], today: string): StrikeRecord[] {
  const previous = new Map(prior.filter(r => r.source_key).map(r => [identity(r), r]));
  return records.map(record => {
    if (record.date >= today || record.status === 'CANCELLED' || !record.source_key) return record;
    const old = previous.get(identity(record));
    if (!old || !['CONFIRMED', 'UNCERTAIN', 'REQUIRES_DETAIL'].includes(old.status) || !declaration(record) || declaration(record) !== declaration(old)) return record;
    // Current matching facts/conflicts take precedence. A failed/deferred lookup
    // or an article leaving its news index must not erase yesterday's evidence.
    if (record.timing_evidence?.confidence === 'conflict') return record;
    const saved = old.timing_evidence;
    const hasSavedEvidence = saved && (saved.sources.length || saved.fields?.guaranteeSource !== 'UNKNOWN' && saved.fields?.guaranteeEvidenceWindows?.url || saved.fields?.routeMembership?.url || saved.fields?.serviceSchedule?.url);
    if (!saved || !hasSavedEvidence) return record;
    const fresh = record.timing_evidence;
    const freshFields = fresh?.fields, oldFields = saved.fields;
    const adoptedTiming = Boolean(fresh?.windows.length && freshFields?.timing.url && fresh.sources.some(s => s.url === freshFields.timing.url)
      && (freshFields.timing.source === 'OPERATOR_OFFICIAL' || freshFields.timing.source === 'REPORTED' && oldFields?.timing.source !== 'OPERATOR_OFFICIAL'));
    const fields = oldFields ? { ...oldFields, ...freshFields, timing: adoptedTiming ? freshFields!.timing : oldFields.timing } : freshFields;
    const newGuarantees = Boolean(freshFields && (freshFields.guaranteeSource !== 'UNKNOWN' || freshFields.guaranteedServiceWindow.confidence === 'CONFLICT'));
    const newLines = Boolean(freshFields && (freshFields.lineScope && freshFields.lineScope.value.kind !== 'UNKNOWN' || freshFields.affectedLines.source !== 'UNKNOWN'));
    if (fields && oldFields) {
      if (!newGuarantees) {
        for (const key of ['guaranteeSource','guaranteeType','guaranteedServiceWindow','guaranteeEvidenceWindows','guaranteeDuringStrike','guaranteePolicy','guaranteedTrains'] as const) Object.assign(fields, { [key]: oldFields[key] });
      }
      if (!newLines) {
        for (const key of ['affectedLines','lineScope','routeCatalog','routeMembership','serviceSchedule'] as const) Object.assign(fields, { [key]: oldFields[key] });
      } else {
        const scopeKey = (scope: typeof fields.lineScope) => scope ? JSON.stringify([scope.value.kind,scope.value.operatorIds,scope.value.networkNames,scope.value.affectedLineNames,scope.value.excludedLineNames]) : null;
        if (scopeKey(freshFields?.lineScope) === scopeKey(oldFields.lineScope)) {
          for (const key of ['routeCatalog','routeMembership','serviceSchedule'] as const) if (!freshFields?.[key]) Object.assign(fields, { [key]: oldFields[key] });
        }
      }
      if (adoptedTiming && fields.guaranteeDuringStrike && fields.guaranteeEvidenceWindows) fields.guaranteeDuringStrike = { ...fields.guaranteeDuringStrike, value: intersectGuaranteeEvidence([fields.guaranteeEvidenceWindows.value, fresh!.windows]) };
    }
    return {
      ...record,
      status: adoptedTiming ? record.status : old.status,
      display_time: adoptedTiming ? record.display_time : old.display_time,
      duration_hours: adoptedTiming ? record.duration_hours : old.duration_hours,
      strike_windows: adoptedTiming ? record.strike_windows : old.strike_windows,
      guarantee_windows: newGuarantees ? record.guarantee_windows : old.guarantee_windows,
      affected_lines: newLines ? record.affected_lines : old.affected_lines,
      data_source: old.data_source,
      timing_evidence: {
        ...(adoptedTiming ? fresh! : saved),
        sources: [...new Map([...saved.sources, ...(fresh?.sources || [])].map(s => [s.url, s])).values()],
        // Preserve original evidence timestamps; do not claim it was reverified.
        fields,
      },
    };
  });
}
