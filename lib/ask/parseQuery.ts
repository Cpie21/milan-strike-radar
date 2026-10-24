import { CITIES } from '../cities';
import { addDaysIso, isIsoDate, romeTodayIso, weekdayOfIso } from '../romeDate';

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
  dayPart: DayPart | null; // "早上", "下午"…: a rough time, said as an assumption
  abroad: Abroad | null; // a destination outside Italy
  daily: boolean; // school, work, commuting: everyday local travel
};

export type DayPart = { from: string; to: string; zh: string; en: string };
export type Abroad = { country: string; zh: string; en: string };

const WEEKDAYS: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const EN_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const EN_SHORT: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const IT_WEEKDAYS: Record<string, number> = { domenica: 0, luned: 1, marted: 2, mercoled: 3, gioved: 4, venerd: 5, sabato: 6 };
// English and Italian month names, full and short ("ago" is left out: "3 days ago").
const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
  gennaio: 1, gen: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, mag: 5, giugno: 6, giu: 6, luglio: 7, lug: 7,
  agosto: 8, settembre: 9, set: 9, ottobre: 10, ott: 10, novembre: 11, dicembre: 12, dic: 12,
};
const MONTH = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const CN_DIGITS: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
// 九 → 9, 十二 → 12, 二十 → 20, 三十一 → 31.
function cnNumber(text: string) {
  const i = text.indexOf('十');
  if (i < 0) return text.length === 1 ? CN_DIGITS[text] : NaN;
  const tens = i === 0 ? 1 : CN_DIGITS[text.slice(0, i)];
  const ones = i === text.length - 1 ? 0 : CN_DIGITS[text.slice(i + 1)];
  return tens * 10 + ones;
}
// "十月九号" reads as "10月9号"; weekdays (周日) and lines (九号线) are left alone.
function cnDates(text: string) {
  const N = '[〇零一二两三四五六七八九十]{1,3}';
  return text
    .replace(new RegExp(`(${N})(?=\\s*月)`, 'g'), n => String(cnNumber(n)))
    .replace(new RegExp(`(?<![周期拜])(${N})(?=\\s*[号日](?!线))`, 'g'), n => String(cnNumber(n)));
}

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
  // "下周X": the given weekday inside next Monday–Sunday week; "下下周X" the one after.
  const mondayNext = addDaysIso(today, ((8 - weekdayOfIso(today)) % 7) || 7);
  return addDaysIso(mondayNext, (weekOffset - 1) * 7 + (weekday + 6) % 7);
}

function monthDay(today: string, month: number, day: number, year0?: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = Number(today.slice(0, 4));
  if (year0) year = year0;
  let iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (year0) return iso;
  if (iso < addDaysIso(today, -7)) iso = `${++year}${iso.slice(4)}`;
  return iso;
}

// On a Sunday "this week" means the coming one, not a single remaining day.
export function weekEnd(today: string) {
  return addDaysIso(today, (7 - weekdayOfIso(today)) % 7 || 7);
}

export function parseScope(text: string, today = romeTodayIso()): DateScope | null {
  const t = cnDates(text.normalize('NFKC').toLowerCase());
  // A real calendar date only: 31/02 or 2026-13-40 is no date at all.
  const real = isIsoDate;
  const day = (date: string | null, match: string): DateScope | null => (date && real(date) ? { kind: 'day', date, text: match } : null);

  let m: RegExpMatchArray | null;
  if ((m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return day(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, m[0]);
  if ((m = t.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/))) return day(monthDay(today, +m[2], +m[3], m[1] ? +m[1] : undefined), m[0]);
  // "October 9", "Oct. 9th, 2026", "9 ottobre", "the 4th of December"
  if ((m = t.match(new RegExp(`\\b(${MONTH})\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`)))) return day(monthDay(today, MONTHS[m[1]], +m[2], m[3] ? +m[3] : undefined), m[0]);
  if ((m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${MONTH})\\b\\.?(?:,?\\s*(\\d{4}))?`)))) return day(monthDay(today, MONTHS[m[2]], +m[1], m[3] ? +m[3] : undefined), m[0]);
  // "10.9号": with 号/日 it is a date, not 10:09
  if ((m = t.match(/\b(\d{1,2})[.．](\d{1,2})\s*[号日](?!线)/))) return day(monthDay(today, +m[1], +m[2]), m[0]);
  // Only "/" here: "8.30" is far more often a clock time than 30 August.
  // Bare "10.9" / "10-9", the Chinese way of writing a date: only in Chinese,
  // with one digit after the separator (so never 8.30, a clock), and followed
  // by Chinese or the end, never by a count (2-3个人, 1.5小时, 2.5欧).
  if (/[\u4e00-\u9fff]/.test(t) && (m = t.match(/(?<![\d:.\-])(\d{1,2})[.\-](\d)(?![\d:.\-])(?=\s*(?:[\u4e00-\u9fff]|[?？,，。!！]|$))(?!\s*(?:点|时|号线|个|人|小时|分|倍|块|欧|元|天|周|次|趟|站|公里|倍))/))) {
    const [a, b] = [+m[1], +m[2]];
    const date = a <= 12 ? monthDay(today, a, b) : null;
    if (date) return day(date, m[0]);
  }
  if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\b/))) {
    const [a, b] = [+m[1], +m[2]];
    // 10/16 is month/day, 16/10 is day/month; when both fit, take the nearest future one.
    const options = [a > 12 ? null : monthDay(today, a, b), b > 12 ? null : monthDay(today, b, a)].filter(Boolean) as string[];
    if (options.length) return day(options.sort()[0], m[0]);
  }
  if ((m = t.match(/大后天/))) return day(addDaysIso(today, 3), m[0]);
  if ((m = t.match(/后天|day after tomorrow|dopodomani/))) return day(addDaysIso(today, 2), m[0]);
  if ((m = t.match(/明天|明日|明早|明晚|tomorrow|\btmrw?\b|\btmw\b|\b2moro\b|domani|domattina/))) return day(addDaysIso(today, 1), m[0]);
  if ((m = t.match(/今天|今日|今早|今晚|today|tonight|oggi|stasera/))) return day(today, m[0]);
  if ((m = t.match(/(下下|下|这|本)?(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/))) {
    return day(nextWeekday(today, WEEKDAYS[m[2]], m[1] === '下下' ? 2 : m[1] === '下' ? 1 : 0), m[0]);
  }
  if ((m = t.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
    return day(nextWeekday(today, EN_WEEKDAYS.indexOf(m[2]), m[1] ? 1 : 0), m[0]);
  }
  // "fri", "next sat"; mon/sat/sun only with next/this/on, as they are also words
  if ((m = t.match(/\b(?:(next)\s+|(?:this|on)\s+)(sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)\b|\b()(tues?|wed|thu(?:rs?)?|fri)\b/))) {
    return day(nextWeekday(today, EN_SHORT[m[2] || m[4]], m[1] ? 1 : 0), m[0]);
  }
  // "venerdì", "lunedi prossimo": the coming one (a week on if that is today)
  if ((m = t.match(/(?<![a-z])(domenica|luned|marted|mercoled|gioved|venerd|sabato)[iìí]?(?:\s+(prossim[oa]))?(?![a-z])/))) {
    const date = nextWeekday(today, IT_WEEKDAYS[m[1]]);
    return day(m[2] && date === today ? addDaysIso(today, 7) : date, m[0]);
  }
  // "the 9th": this month's, or next month's once it has passed
  if ((m = t.match(/(\d{1,2})\s*[号日](?!线)|\b(\d{1,2})(?:st|nd|rd|th)\b/))) {
    const d = +(m[1] || m[2]);
    const month = Number(today.slice(5, 7));
    const thisMonth = monthDay(today, month, d);
    return day(thisMonth && thisMonth >= today ? thisMonth : monthDay(today, month === 12 ? 1 : month + 1, d), m[0]);
  }
  if ((m = t.match(/(下下|下)(?:个)?(?:周|星期|礼拜)|week after next|next week|settimana prossima/))) {
    const from = nextWeekday(today, 1, m[1] === '下下' || m[0] === 'week after next' ? 2 : 1);
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

// A part of the day, when no clock time is given. Read as a span (any
// strike inside it counts) and always shown as an assumption.
const DAY_PARTS: [RegExp, DayPart][] = [
  [/凌晨|清晨|early morning/i, { from: '05:00', to: '08:00', zh: '清晨', en: 'early morning' }],
  [/早上|早晨|上午|明早|今早|早高峰|morning|mattina/i, { from: '06:00', to: '10:00', zh: '早上', en: 'morning' }],
  [/中午|午饭|\bnoon\b|lunchtime|pranzo/i, { from: '11:00', to: '14:00', zh: '中午', en: 'midday' }],
  [/下午|afternoon|pomeriggio/i, { from: '13:00', to: '18:00', zh: '下午', en: 'afternoon' }],
  [/傍晚|晚高峰|下班后/i, { from: '17:00', to: '20:00', zh: '傍晚', en: 'early evening' }],
  [/晚上|夜里|今晚|明晚|tonight|evening|\bsera\b|stasera/i, { from: '18:00', to: '24:00', zh: '晚上', en: 'evening' }],
];
export function parseDayPart(text: string): DayPart | null {
  return DAY_PARTS.find(([re]) => re.test(text))?.[1] ?? null;
}

// Destinations abroad. Italian strikes stop at the border, and the answer
// has to say so rather than imply the whole route was checked.
const ABROAD: [RegExp, Abroad][] = [
  [/瑞士|苏黎世|日内瓦|卢加诺|伯尔尼|巴塞尔|洛迦诺|基亚索|圣莫里茨|switzerland|swiss|svizzera|suisse|schweiz|z[uü]rich|zurigo|geneva|ginevra|gen[eè]ve|lugano|\bbern[ae]?\b|basel|basilea|locarno|chiasso|bellinzona|st\.? ?moritz|\bsbb\b|\btilo\b/i, { country: 'CH', zh: '瑞士', en: 'Switzerland' }],
  [/德国|慕尼黑|柏林|法兰克福|germany|germania|deutschland|munich|monaco di baviera|m[uü]nchen|berlin|frankfurt|deutsche bahn/i, { country: 'DE', zh: '德国', en: 'Germany' }],
  [/法国|巴黎|尼斯|里昂|马赛|france|francia|\bparis\b|parigi|nizza|\blyon\b|lione|marseille|marsiglia|sncf/i, { country: 'FR', zh: '法国', en: 'France' }],
  [/奥地利|维也纳|因斯布鲁克|萨尔茨堡|austria|[oö]sterreich|vienna|\bwien\b|innsbruck|salzburg|salisburgo|[oö]bb/i, { country: 'AT', zh: '奥地利', en: 'Austria' }],
  [/斯洛文尼亚|卢布尔雅那|slovenia|ljubljana|lubiana/i, { country: 'SI', zh: '斯洛文尼亚', en: 'Slovenia' }],
  [/摩纳哥|蒙特卡洛|\bmonaco\b|monte ?carlo/i, { country: 'MC', zh: '摩纳哥', en: 'Monaco' }],
];
export function parseAbroad(text: string): Abroad | null {
  return ABROAD.find(([re]) => re.test(text))?.[1] ?? null;
}

const DAILY = /上学|上课|放学|学校|大学|课程|考试|上班|下班|通勤|公司|实习|买菜|看病|\bschool\b|\bclass(?:es)?\b|universit|campus|\bwork\b|office|commut|lavoro|scuola|lezion/i;

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
  const metro = [...text.normalize('NFKC').matchAll(/(?<!\d)([1-5])\s*号线/g)].map(m => `M${m[1]}`); // 3号线 = M3
  const lines = [...new Set([...(text.match(/\b(?:m[1-5]|s\d{1,2}|re?\d{1,2})\b/gi) || []).map(line => line.toUpperCase()), ...metro])];
  return {
    text,
    today,
    scope: parseScope(text, today),
    time: parseTime(text),
    cities: parseCities(text),
    modes: (Object.keys(MODE_KEYWORDS) as Mode[]).filter(mode => MODE_KEYWORDS[mode].test(text)),
    lines,
    dayPart: parseTime(text) ? null : parseDayPart(text),
    abroad: parseAbroad(text),
    daily: DAILY.test(text),
  };
}
