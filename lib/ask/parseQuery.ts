import { CITIES } from '../cities';
import { addDaysIso, romeTodayIso, weekdayOfIso } from '../romeDate';

// Deterministic extraction. Dates, clock times, cities and line codes are
// facts the code can read exactly; a decision model treats dates as text and
// must never be the one that computes them.

export type Mode = 'TRAIN' | 'SUBWAY' | 'BUS' | 'AIRPORT';
export type DateScope =
  | { kind: 'day'; date: string; text: string }
  | { kind: 'range'; from: string; to: string; text: string };

export type ParsedQuery = {
  text: string;
  today: string;
  scope: DateScope | null;
  time: string | null; // HH:MM, Rome local
  cities: string[]; // city tags in order of mention
  modes: Mode[]; // keyword hits only; the model may add semantic ones
  lines: string[];
};

const WEEKDAYS: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const EN_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const MODE_KEYWORDS: Record<Mode, RegExp> = {
  TRAIN: /火车|高铁|动车|铁路|列车|城际|trenord|trenitalia|italo|frecciarossa|freccia|treno|treni|\btrain|regionale|malpensa express|\b(?:s\d{1,2}|re?\d{1,2})\b/i,
  SUBWAY: /地铁|metro|subway|metropolitana|\bm[1-5]\b/i,
  BUS: /公交|巴士|公车|大巴|电车|有轨|\bbus\b|autobus|tram|filobus/i,
  AIRPORT: /机场|飞(?!快)|航班|登机|flight|airport|aeroporto|\bvolo\b|easyjet|ryanair|ita airways|wizz/i,
};

function nextWeekday(today: string, weekday: number, weekOffset = 0) {
  if (weekOffset === 0) {
    const delta = (weekday - weekdayOfIso(today) + 7) % 7;
    return addDaysIso(today, delta);
  }
  // "下周X": the given weekday inside next Monday–Sunday week.
  const mondayNext = addDaysIso(today, ((8 - weekdayOfIso(today)) % 7) || 7);
  return addDaysIso(mondayNext, (weekday + 6) % 7);
}

function monthDay(today: string, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = Number(today.slice(0, 4));
  let iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (iso < addDaysIso(today, -7)) iso = `${++year}${iso.slice(4)}`;
  return iso;
}

// On a Sunday "this week" means the coming one, not a single remaining day.
export function weekEnd(today: string) {
  return addDaysIso(today, (7 - weekdayOfIso(today)) % 7 || 7);
}

export function parseScope(text: string, today = romeTodayIso()): DateScope | null {
  const t = text.toLowerCase();
  // A real calendar date only: 31/02 or 2026-13-40 is no date at all.
  const real = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  const day = (date: string | null, match: string): DateScope | null => (date && real(date) ? { kind: 'day', date, text: match } : null);

  let m: RegExpMatchArray | null;
  if ((m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return day(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, m[0]);
  if ((m = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/))) return day(monthDay(today, +m[1], +m[2]), m[0]);
  // Only "/" here: "8.30" is far more often a clock time than 30 August.
  if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\b/))) {
    const [a, b] = [+m[1], +m[2]];
    // 10/16 is month/day, 16/10 is day/month; when both fit, take the nearest future one.
    const options = [a > 12 ? null : monthDay(today, a, b), b > 12 ? null : monthDay(today, b, a)].filter(Boolean) as string[];
    if (options.length) return day(options.sort()[0], m[0]);
  }
  if ((m = t.match(/大后天/))) return day(addDaysIso(today, 3), m[0]);
  if ((m = t.match(/后天|day after tomorrow/))) return day(addDaysIso(today, 2), m[0]);
  if ((m = t.match(/明天|明日|明早|明晚|tomorrow|domani/))) return day(addDaysIso(today, 1), m[0]);
  if ((m = t.match(/今天|今日|今早|今晚|today|tonight|oggi|stasera/))) return day(today, m[0]);
  if ((m = t.match(/(下|这|本)?(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/))) {
    return day(nextWeekday(today, WEEKDAYS[m[2]], m[1] === '下' ? 1 : 0), m[0]);
  }
  if ((m = t.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
    return day(nextWeekday(today, EN_WEEKDAYS.indexOf(m[2]), m[1] ? 1 : 0), m[0]);
  }
  if ((m = t.match(/(\d{1,2})\s*[号日]/))) {
    const d = +m[1];
    const month = Number(today.slice(5, 7));
    const thisMonth = monthDay(today, month, d);
    return day(thisMonth && thisMonth >= today ? thisMonth : monthDay(today, month === 12 ? 1 : month + 1, d), m[0]);
  }
  if ((m = t.match(/下(?:个)?(?:周|星期|礼拜)|next week|settimana prossima/))) {
    const from = nextWeekday(today, 1, 1);
    return { kind: 'range', from, to: addDaysIso(from, 6), text: m[0] };
  }
  if ((m = t.match(/(?:这|本)(?:个)?(?:周|星期|礼拜)|this week|questa settimana|周末|weekend/))) {
    return { kind: 'range', from: today, to: weekEnd(today), text: m[0] };
  }
  if ((m = t.match(/下(?:个)?月|next month/))) {
    const [y, mo] = today.split('-').map(Number);
    const from = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
    const end = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0)).toISOString().slice(0, 10);
    return { kind: 'range', from, to: end, text: m[0] };
  }
  if ((m = t.match(/(?:这|本)(?:个)?月|this month/))) {
    const [y, mo] = today.split('-').map(Number);
    return { kind: 'range', from: today, to: new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10), text: m[0] };
  }
  if ((m = t.match(/最近|近期|近来|接下来|未来|这几天|这两天|upcoming|soon|coming days|prossimi giorni/))) {
    return { kind: 'range', from: today, to: addDaysIso(today, 14), text: m[0] };
  }
  return null;
}

export function parseTime(text: string): string | null {
  const t = text.toLowerCase().replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g, ' ');
  let m: RegExpMatchArray | null;
  const fmt = (h: number, min = 0) => (h >= 0 && h < 24 && min >= 0 && min < 60 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : null);
  if ((m = t.match(/(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})\s*[点時时](?:\s*(半)|\s*(\d{1,2})\s*分?)?/))) {
    let h = +m[2];
    if (/下午|傍晚|晚上|夜里/.test(m[1] || '') && h < 12) h += 12;
    if (m[1] === '中午' && h < 6) h += 12;
    return fmt(h, m[3] ? 30 : m[4] ? +m[4] : 0);
  }
  if ((m = t.match(/\b(\d{1,2})(?:[:：.](\d{2}))?\s*(am|pm)\b/))) {
    let h = +m[1] % 12;
    if (m[3] === 'pm') h += 12;
    return fmt(h, m[2] ? +m[2] : 0);
  }
  if ((m = t.match(/(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})[:：.](\d{2})(?!\d)/))) {
    let h = +m[2];
    if (/下午|傍晚|晚上|夜里/.test(m[1] || '') && h < 12) h += 12;
    return fmt(h, +m[3]);
  }
  return null;
}

export function parseCities(text: string) {
  const lower = text.toLowerCase();
  const hits: { tag: string; index: number }[] = [];
  for (const city of CITIES) {
    const names = [city.zh, city.en.toLowerCase(), city.slug, ...city.aliases, ...city.airports, ...city.airportAliases.filter(a => a.length > 3)];
    const index = Math.min(...names.map(name => lower.indexOf(name.toLowerCase())).filter(i => i >= 0));
    if (Number.isFinite(index)) hits.push({ tag: city.tag, index });
  }
  return hits.sort((a, b) => a.index - b.index).map(hit => hit.tag);
}

// Italian places people ask about that this site does not cover. Named
// explicitly, they get "not covered" rather than the page city's answer.
const UNSUPPORTED_PLACES = /\b(foggia|udine|pescara|parma|modena|lecce|salerno|trento|bolzano|ancona|livorno|siena|rimini|reggio(?: emilia| calabria)?|piacenza|vicenza|treviso|ravenna|ferrara|latina|sassari|taranto|brindisi|como|varese|monza|novara|alessandria|asti|cuneo|aosta|potenza|matera|campobasso|l'aquila|arezzo|lucca|prato|pistoia)\b|福贾|乌迪内|佩斯卡拉|帕尔马|摩德纳|莱切|萨勒诺|特伦托|博尔扎诺|安科纳|里窝那|锡耶纳|里米尼|蒙扎|科莫/i;
export function unsupportedPlace(text: string): string | null {
  const m = text.match(UNSUPPORTED_PLACES);
  return m ? m[0] : null;
}

export function parseQuery(text: string, today = romeTodayIso()): ParsedQuery {
  const lines = [...new Set((text.match(/\b(?:m[1-5]|s\d{1,2}|re?\d{1,2})\b/gi) || []).map(line => line.toUpperCase()))];
  return {
    text,
    today,
    scope: parseScope(text, today),
    time: parseTime(text),
    cities: parseCities(text),
    modes: (Object.keys(MODE_KEYWORDS) as Mode[]).filter(mode => MODE_KEYWORDS[mode].test(text)),
    lines,
  };
}
