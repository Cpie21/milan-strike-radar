import type { ScopeEvidence } from './strikeScope';
// Semantic endpoints must survive all the way to cards, calendars and widgets.
// 'Fine servizio' is not midnight and varies between lines.
export type EvidenceWindow = {
  start: string | null;
  end: string | null;
  end_kind: 'clock' | 'end_of_service';
};
export type TimingSource = {
  url: string;
  name: string;
  authority: 'official' | 'reported';
  checked_at: string;
  excerpt: string;
  content_hash: string;
};
export type TimingEvidence = {
  fields?: ScopeEvidence;
  windows: EvidenceWindow[];
  confidence: 'official' | 'reported' | 'corroborated' | 'conflict';
  sources: TimingSource[];
  unions: string;
  conflicts: { url: string; windows: EvidenceWindow[] }[];
};

export function evidenceTimeLabel(window: EvidenceWindow, language: 'zh' | 'en' = 'zh') {
  return `${window.start === null ? (language === 'en' ? 'start of service' : '运营开始') : window.start} - ${window.end_kind === 'end_of_service' ? (language === 'en' ? 'end of service' : '运营结束') : window.end}`;
}
