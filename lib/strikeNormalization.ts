const AFFECTED_LINE_BLACKLIST = [
  '语言环境',
  'ambiente linguistico',
  'linguistico',
  'handling',
  'nazionale',
  'regionale',
  'provinciale',
  'territoriale',
  'locale',
  'note',
];

export const REGION_LABELS: Record<string, string> = {
  MILANO: '米兰',
  ROMA: '罗马',
  TORINO: '都灵',
  NATIONAL: '全国',
  OTHER: '其他地区',
};

const TARGET_LOCATION_RULES = {
  MILANO: {
    regions: ['lombardia'],
    provinces: ['milano'],
    airportProvinces: ['varese', 'bergamo'],
  },
  ROMA: {
    regions: ['lazio'],
    provinces: ['roma'],
    airportProvinces: [],
  },
  TORINO: {
    regions: ['piemonte'],
    provinces: ['torino'],
    airportProvinces: [],
  },
} as const;

const REGION_ALIASES: Record<string, string[]> = {
  MILANO: ['MILANO', 'MILAN', '米兰', 'MALPENSA', 'MXP', 'LINATE', 'LIN', 'BERGAMO', 'ORIO', 'BGY', '马尔彭萨', '利纳特', '贝加莫'],
  ROMA: ['ROMA', 'ROME', '罗马', 'FIUMICINO', 'FCO', 'CIAMPINO', 'CIA', '菲乌米奇诺', '钱皮诺'],
  TORINO: ['TORINO', 'TURIN', '都灵', 'CASELLE', 'TRN', '卡塞莱'],
};

type AirportDef = {
  tag: 'MILANO' | 'ROMA' | 'TORINO';
  name: string;
  aliases: string[];
};

const AIRPORTS: AirportDef[] = [
  { tag: 'MILANO', name: '马尔彭萨', aliases: ['MALPENSA', 'MXP', '马尔彭萨'] },
  { tag: 'MILANO', name: '利纳特', aliases: ['LINATE', 'LIN', '利纳特'] },
  { tag: 'MILANO', name: '贝加莫', aliases: ['BERGAMO', 'ORIO', 'BGY', '贝加莫'] },
  { tag: 'ROMA', name: '菲乌米奇诺', aliases: ['FIUMICINO', 'FCO', '菲乌米奇诺'] },
  { tag: 'ROMA', name: '钱皮诺', aliases: ['CIAMPINO', 'CIA', '钱皮诺'] },
  { tag: 'TORINO', name: '卡塞莱', aliases: ['CASELLE', 'TRN', '卡塞莱'] },
];

const PROVIDER_SYNONYMS: Array<{ match: RegExp; label: string }> = [
  { match: /TECHNO\s*SKY|科技天空/i, label: '科技天空技术人员' },
  { match: /EASYJET|易捷/i, label: '易捷航空人员' },
  { match: /TEP(?:\s+DI)?\s+PARMA/i, label: 'TEP Parma 人员' },
  { match: /CIALONE(?:\s+TOUR)?/i, label: 'CIALONE 人员' },
  { match: /ARRIVA\s+ITALIA\s+DI\s+TORINO|ARRIVA\s+TORINO/i, label: 'Arriva Torino 人员' },
  { match: /SUN\s+DI\s+NOVARA|SUN\s+NOVARA/i, label: 'SUN Novara 人员' },
  { match: /AIRPORT\s+HANDLING|机场地勤/i, label: '机场地勤人员' },
  { match: /\bITA(?:\s+AIRWAYS)?\b|ALITALIA|意大利航空/i, label: '意大利航空人员' },
  { match: /\bATAC\b/i, label: 'ATAC人员' },
  { match: /\bGTT\b/i, label: 'GTT人员' },
  { match: /ENAV\s+ACC\s+ROMA|罗马空管中心/i, label: '罗马空管中心人员' },
  { match: /ENAV\s+ACC(?:\s+DI)?\s+MILANO|米兰空管中心/i, label: '米兰空管中心人员' },
  { match: /ENAV\s+ACC(?:\s+DI)?\s+TORINO|都灵空管中心/i, label: '都灵空管中心人员' },
  { match: /ENAV|意大利空管局|空管局空管|空中交通管制/i, label: '意大利空管人员' },
  { match: /\bSEA\b|米兰机场运营/i, label: '米兰机场运营人员' },
  { match: /\bALHA\b|阿尔哈/i, label: '阿尔哈地服人员' },
  { match: /\bDNATA\b|德纳达/i, label: '德纳达地服人员' },
  { match: /\bGDA\b/i, label: 'GDA地服人员' },
  { match: /\bMH24\b/i, label: 'MH24机场人员' },
  { match: /\bATM\b|米兰交通局/i, label: '米兰交通局人员' },
  { match: /\bRFI\b|RETE\s+FERROVIARIA\s+ITALIANA/i, label: 'RFI基础设施维护人员' },
  { match: /\bTRENORD\b|伦巴第大区铁路/i, label: '伦巴第大区铁路人员' },
  { match: /\bTRENITALIA\b|意大利国家铁路/i, label: '意大利国家铁路人员' },
  { match: /\bITALO\b|伊塔洛高铁/i, label: '伊塔洛高铁人员' },
];

const COMPANY_SUFFIX_RE = /\b(SOC\.?|SOCIETA'?|SPA|S\.P\.A\.|SRL|S\.R\.L\.|SCARL|S\.C\.A\.R\.L\.|LIMITED|LTD|AIRLINES|TOUR|HANDLING|AEROPORTO|AIRPORT)\b/gi;
const EXTRA_SPACES_RE = /\s+/g;
const ROLE_SUFFIX_RE = /(人员|机组与飞行员|地勤人员|空管人员|技术人员|地服人员|运营人员)$/;
const NATIONAL_LOCATION_MARKERS = ['italia', 'tutte', 'nazionale'];

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsAlias(text: string, alias: string) {
  const upper = text.toUpperCase();
  const aliasUpper = alias.toUpperCase();

  if (/^[A-Z0-9]{2,3}$/.test(aliasUpper)) {
    const re = new RegExp(`(?:^|[^A-Z0-9])${escapeRegExp(aliasUpper)}(?:$|[^A-Z0-9])`);
    return re.test(upper);
  }

  return upper.includes(aliasUpper);
}

function includesAny(text: string, items: string[]): boolean {
  return items.some((item) => containsAlias(text, item));
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function detectTerminals(text: string): string[] {
  const matches = [...text.toUpperCase().matchAll(/(?:^|\s)(?:T|TERMINAL)\s*([12])(?:\s|$)/g)];
  return unique(matches.map((m) => `T${m[1]}`));
}

function detectAirports(text: string): AirportDef[] {
  return AIRPORTS.filter((airport) => includesAny(text, airport.aliases));
}

export function sanitizeAffectedLines(lines: string[]) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => (line || '').trim())
    .filter(Boolean)
    .filter((line) => !AFFECTED_LINE_BLACKLIST.some((blocked) => line.toLowerCase().includes(blocked)));
}

function inferAirportScope(contextText: string, regionTag?: string): string | null {
  const upper = contextText.toUpperCase();
  if (upper.includes('ENAV ACC ROMA') || upper.includes('ACC ROMA')) return '罗马相关机场';
  if (upper.includes('ENAV ACC DI MILANO') || upper.includes('ENAV ACC MILANO') || upper.includes('ACC DI MILANO')) return '米兰相关机场';
  if (upper.includes('ENAV ACC DI TORINO') || upper.includes('ENAV ACC TORINO') || upper.includes('ACC DI TORINO')) return '都灵相关机场';
  if (upper.includes('ITALIA') || upper.includes('TUTTE') || upper.includes('NAZIONALE') || regionTag === 'NATIONAL') return '全国相关机场';
  if (regionTag && REGION_LABELS[regionTag]) return `${REGION_LABELS[regionTag]}相关机场`;
  return null;
}

export function inferRegionTagFromText(text: string) {
  const upper = (text || '').toUpperCase();
  if (!upper) return '';
  for (const [tag, aliases] of Object.entries(REGION_ALIASES)) {
    if (aliases.some((alias) => containsAlias(upper, alias))) return tag;
  }
  if (upper.includes('NAZIONALE') || upper.includes('TUTTA ITALIA') || upper.includes('ITALIA')) {
    return 'NATIONAL';
  }
  if (upper.includes('AEROPORTO') || upper.includes('AIRPORT') || upper.includes('ACC ')) {
    return 'OTHER';
  }
  return '';
}

export function classifyRegionTag(input: {
  regionText?: string;
  provinceText?: string;
  sectorText?: string;
  providerText?: string;
  noteText?: string;
}) {
  const regionText = (input.regionText || '').trim().toLowerCase();
  const provinceText = (input.provinceText || '').trim().toLowerCase();
  const sectorText = (input.sectorText || '').trim().toLowerCase();
  const inferred = inferRegionTagFromText(`${input.providerText || ''} ${input.noteText || ''}`);
  const hasExplicitNational =
    NATIONAL_LOCATION_MARKERS.some((marker) => regionText.includes(marker)) ||
    NATIONAL_LOCATION_MARKERS.some((marker) => provinceText.includes(marker));

  for (const [tag, rules] of Object.entries(TARGET_LOCATION_RULES)) {
    if (rules.provinces.some((province) => provinceText.includes(province))) {
      return tag;
    }
    if (rules.regions.some((region) => regionText.includes(region)) && inferred === tag) {
      return tag;
    }
    if (
      sectorText.includes('aereo') &&
      rules.airportProvinces.some((province) => provinceText.includes(province))
    ) {
      return tag;
    }
  }

  if (hasExplicitNational) {
    if (inferred && inferred !== 'OTHER' && inferred !== 'NATIONAL') return inferred;
    return 'NATIONAL';
  }

  if (regionText || provinceText) {
    return 'OTHER';
  }

  return inferred;
}

export function normalizeAirportAffectedLines(
  lines: string[],
  options?: { contextText?: string; regionTag?: string }
) {
  const cleanedLines = sanitizeAffectedLines(lines);
  const collectNormalized = (sources: string[]) => {
    const normalized: string[] = [];
    const terminalBases = new Set<string>();
    const wholeAirportBases = new Set<string>();

    sources.forEach((source) => {
      const airports = detectAirports(source);
      if (airports.length === 0) return;

      const terminals = detectTerminals(source);
      if (terminals.length > 0) {
        airports.forEach((airport) => {
          terminals.forEach((terminal) => {
            terminalBases.add(airport.name);
            normalized.push(`${airport.name} ${terminal}`);
          });
        });
        return;
      }

      airports.forEach((airport) => {
        wholeAirportBases.add(airport.name);
        normalized.push(`${airport.name}机场`);
      });
    });

    const dedup = new Map<string, string>();
    normalized.forEach((item) => {
      if (item.endsWith('机场')) {
        const base = item.replace('机场', '');
        if (wholeAirportBases.has(base)) {
          dedup.set(base.toLowerCase(), item);
          return;
        }
      } else {
        const base = item.replace(/\s+T[12]$/, '');
        if (wholeAirportBases.has(base)) return;
        if (terminalBases.has(base) && wholeAirportBases.has(base)) return;
      }
      const key = item.replace(EXTRA_SPACES_RE, '').toLowerCase();
      dedup.set(key, item);
    });

    const items = Array.from(dedup.values());
    AIRPORTS.forEach((airport) => {
      const hasT1 = items.includes(`${airport.name} T1`);
      const hasT2 = items.includes(`${airport.name} T2`);
      if (hasT1 && hasT2) {
        const collapsed = items.filter((item) => item !== `${airport.name} T1` && item !== `${airport.name} T2`);
        collapsed.push(`${airport.name}机场`);
        items.length = 0;
        items.push(...unique(collapsed));
      }
    });

    return items;
  };

  const contextText = options?.contextText || '';
  const contextNormalized = collectNormalized(contextText ? [contextText] : []);
  if (contextNormalized.length > 0) return contextNormalized;

  const scope = inferAirportScope(contextText, options?.regionTag);
  if (scope) return [scope];

  const lineNormalized = collectNormalized(cleanedLines);
  if (lineNormalized.length > 0) return lineNormalized;

  return cleanedLines.filter((line) => !/[A-Za-z]/.test(line));
}

function localizeRoleLabel(label: string, rawUpper: string, rawText: string) {
  if (label === '易捷航空人员') {
    if (
      rawUpper.includes('NAVIGANTE') ||
      rawUpper.includes('PILOT') ||
      rawUpper.includes('CREW') ||
      rawText.includes('机组') ||
      rawText.includes('飞行员')
    ) return '易捷航空机组与飞行员';
    if (rawUpper.includes('TERRA') || rawUpper.includes('GROUND') || rawText.includes('地勤')) return '易捷航空地勤人员';
  }
  if (label === '意大利航空人员') {
    if (
      rawUpper.includes('NAVIGANTE') ||
      rawUpper.includes('PILOT') ||
      rawUpper.includes('CREW') ||
      rawText.includes('机组') ||
      rawText.includes('飞行员')
    ) return '意大利航空机组与飞行员';
    if (rawUpper.includes('TERRA') || rawUpper.includes('GROUND') || rawText.includes('地勤')) return '意大利航空地勤人员';
  }
  if (label === '意大利空管人员') {
    if (includesAny(rawUpper, ['MALPENSA', 'MXP', '马尔彭萨'])) return '马尔彭萨机场空管人员';
    if (includesAny(rawUpper, ['LINATE', 'LIN', '利纳特'])) return '利纳特机场空管人员';
    if (includesAny(rawUpper, ['BERGAMO', 'ORIO', 'BGY', '贝加莫'])) return '贝加莫机场空管人员';
    if (includesAny(rawUpper, ['FIUMICINO', 'FCO', '菲乌米奇诺'])) return '菲乌米奇诺机场空管人员';
    if (includesAny(rawUpper, ['CIAMPINO', 'CIA', '钱皮诺'])) return '钱皮诺机场空管人员';
  }
  return label;
}

export function normalizeProviderPart(part: string, translatedText?: string) {
  const raw = `${part || ''} ${translatedText || ''}`.trim();
  const rawUpper = raw.toUpperCase();
  if (!raw) return '';

  for (const synonym of PROVIDER_SYNONYMS) {
    if (synonym.match.test(raw)) {
      return localizeRoleLabel(synonym.label, rawUpper, raw);
    }
  }

  let cleaned = translatedText || part;
  cleaned = cleaned.replace(COMPANY_SUFFIX_RE, ' ');
  cleaned = cleaned.replace(/[A-Za-z]+(?:\s+[A-Za-z]+)*/g, ' ');
  cleaned = cleaned.replace(/[0-9]{2,}/g, ' ');
  cleaned = cleaned.replace(EXTRA_SPACES_RE, ' ').trim();
  if (!cleaned) return '相关人员';
  if (!ROLE_SUFFIX_RE.test(cleaned)) cleaned = `${cleaned}人员`;
  return cleaned;
}

export function normalizeProviderList(text: string, translatedText?: string) {
  const source = text || translatedText || '';
  const parts = source
    .split(/[\/、,;|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const translatedParts = (translatedText || '')
    .split(/[\/、,;|]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    const fallback = normalizeProviderPart('', translatedText);
    return fallback ? [fallback] : [];
  }

  const normalized = parts
    .map((part, index) => normalizeProviderPart(part, translatedParts[index] || translatedText))
    .filter(Boolean);

  return unique(normalized);
}

export function canonicalizeRegionValue(region: string) {
  const value = (region || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'milano' || value === 'milan' || value === '米兰') return 'MILANO';
  if (value === 'roma' || value === 'rome' || value === '罗马') return 'ROMA';
  if (value === 'torino' || value === 'turin' || value === '都灵') return 'TORINO';
  if (value === 'national' || value === '国家的' || value === 'nazionale') return 'NATIONAL';
  if (value === 'other' || value === '其他地区') return 'OTHER';
  return region;
}
