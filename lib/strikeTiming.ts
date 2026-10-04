export type TimeWindow = { start: string; end: string };
export type TimingCategory = 'TRAIN' | 'SUBWAY' | 'BUS' | 'AIRPORT';

// Sector labels are boundaries. A general 24-hour announcement must not
// override its railway exception, or leak railway times into bus/air records.
export function scopeTiming(text: string, category?: TimingCategory) {
  if (!category) return text;
  const labels = /(?:SETTORE\s+)?(?:APPALTI\s+FERROVIARI|TRASPORTO\s+MERCI\s+SU\s+ROTAIA|TRASPORTO\s+PUBBLICO\s+LOCALE|FERROVIARIO|TPL|AUTOFERROTRANVIARIO|MARITTIMO|AUTOSTRADE|AEREO)\b\s*:?/gi;
  const matches = [...text.matchAll(labels)];
  if (!matches.length) return text;
  const relevant = matches.filter(match => {
    const label = match[0].toUpperCase();
    if (category === 'TRAIN') return /FERROVIARIO/.test(label) && !/APPALTI|MERCI/.test(label);
    if (category === 'AIRPORT') return /AEREO/.test(label);
    return /TPL|PUBBLICO|AUTOFERRO/.test(label);
  });
  return relevant.map(match => {
    const index = matches.indexOf(match);
    return text.slice(match.index! + match[0].length, matches[index + 1]?.index ?? text.length);
  }).join(' / ');
}

function minutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function timingFromWindows(windows: TimeWindow[], fallback = '时段待公布') {
  if (!windows.length) return { windows, hours: fallback, display: '具体时段待公布', dateSpecific: false };
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  const merged: TimeWindow[] = [];
  for (const window of sorted) {
    const previous = merged.at(-1);
    if (previous && minutes(window.start) <= minutes(previous.end) && minutes(window.end) >= minutes(window.start)) {
      if (minutes(window.end) > minutes(previous.end)) previous.end = window.end;
    } else merged.push({ ...window });
  }
  const total = merged.reduce((sum, window) => {
    const start = minutes(window.start), end = minutes(window.end);
    return sum + (end > start ? end - start : 1440 + end - start);
  }, 0) / 60;
  const fullDay = merged.length === 1 && merged[0].start === '00:00' && merged[0].end === '24:00';
  return {
    windows: merged,
    hours: `${Number.isInteger(total) ? total : total.toFixed(1)}小时`,
    display: fullDay ? '全天 24小时' : merged.map(window => `${window.start} - ${window.end}`).join(', '),
    dateSpecific: false,
  };
}

export function parseStrikeTiming(text: string, category?: TimingCategory, dateIso?: string) {
  const scoped = scopeTiming(text, category).toUpperCase();
  const fallbackHours = scoped.match(/\b(\d+)\s*ORE\b/)?.[1];
  const windows: TimeWindow[] = [];
  const explicitDates = new Set<string>();
  const year = Number(dateIso?.slice(0, 4)) || new Date().getFullYear();
  const iso = (day: string, month: string, givenYear?: string) => `${givenYear || year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const range = /(?:DALLE\s+(?:ORE\s+)?)?(\d{1,2})[.:](\d{2})(?:\s+DEL\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?)?\s*(?:ALLE\s+(?:ORE\s+)?|[-–])\s*(\d{1,2})[.:](\d{2})(?:\s+DEL\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?)?/g;
  let dateSpecific = false;
  for (const match of scoped.matchAll(range)) {
    let start = `${match[1].padStart(2, '0')}:${match[2]}`;
    let end = `${match[6].padStart(2, '0')}:${match[7]}`;
    if (minutes(start) >= 1440 || minutes(end) > 1440 || Number(match[2]) > 59 || Number(match[7]) > 59) continue;
    if (end === '23:59') end = '24:00';
    if (match[3] && match[4] && match[8] && match[9]) {
      const from = iso(match[3], match[4], match[5]);
      let to = iso(match[8], match[9], match[10]);
      if (to < from && !match[10]) to = `${year + 1}${to.slice(4)}`;
      const cursor = new Date(`${from}T12:00:00Z`);
      for (let i = 0; i < 32 && cursor.toISOString().slice(0, 10) <= to; i++, cursor.setUTCDate(cursor.getUTCDate() + 1)) explicitDates.add(cursor.toISOString().slice(0, 10));
      dateSpecific = true;
      if (dateIso && (dateIso < from || dateIso > to)) continue;
      if (dateIso && from !== to) {
        if (dateIso !== from) start = '00:00';
        if (dateIso !== to) end = '24:00';
      }
    }
    windows.push({ start, end });
  }
  for (const match of scoped.matchAll(/DALLE\s+(?:ORE\s+)?(\d{1,2})[.:](\d{2})\s+A\s+FINE\s+SERVIZIO/g)) {
    if (Number(match[1]) < 24 && Number(match[2]) < 60) windows.push({ start: `${match[1].padStart(2, '0')}:${match[2]}`, end: '24:00' });
  }
  // Only an unqualified full day is a midnight-to-midnight window.
  if (!windows.length && !dateSpecific && /\b24\s*ORE\b/.test(scoped) && !/FINO\s+A|VARIE|MODALIT|TURNO/.test(scoped)) windows.push({ start: '00:00', end: '24:00' });
  return {
    ...timingFromWindows(windows, fallbackHours ? `${fallbackHours}小时（时段待公布）` : '时段待公布'),
    dateSpecific,
    explicitDates: [...explicitDates].sort(),
  };
}
