export function parseDate(dateStr: string) {
  return new Date(dateStr);
}

// Maps backend strike categories to Chinese labels
export const categoryMap: Record<string, string> = {
  'FERROVIARIO': '火车',
  'TRASPORTO PUBBLICO LOCALE': '公交',
  'AEREO': '机场',
  'MARITTIMO': '轮船',
};

// Maps backend status to English status for frontend logic
export const statusMap: Record<string, 'active' | 'cancelled'> = {
  'CONFIRMED': 'active',
  'CANCELLED': 'cancelled',
  'REVOKED': 'cancelled',
  'SUSPENDED': 'cancelled',
  'REQUIRES_DETAIL': 'active',
  'UNCERTAIN': 'active',
};

const AFFECTED_LINE_BLACKLIST = [
  '语言环境',
  'ambiente linguistico',
  'linguistico',
  'nazionale',
  'regionale',
  'provinciale',
  'territoriale',
  'locale',
  'note',
];

export function sanitizeAffectedLines(lines: string[]) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map(l => (l || '').trim())
    .filter(Boolean)
    .filter(l => !AFFECTED_LINE_BLACKLIST.some(b => l.toLowerCase().includes(b)));
}

const REGION_AIRPORT_KEYWORDS: Record<string, string[]> = {
  MILANO: ['马尔彭萨', 'malpensa', 'mxp', '利纳特', 'linate', 'lin', '贝加莫', 'bergamo', 'orio', 'bgy'],
  ROMA: ['菲乌米奇诺', 'fiumicino', 'fco', '钱皮诺', 'ciampino', 'cia'],
  TORINO: ['卡塞莱', 'caselle', '都灵', 'torino', 'trn'],
};

const REGION_AIRPORT_FALLBACK: Record<string, string[]> = {
  MILANO: ['马尔彭萨 T1', '马尔彭萨 T2', '利纳特机场'],
  ROMA: ['罗马菲乌米奇诺机场', '罗马钱皮诺机场'],
  TORINO: ['都灵卡塞莱机场'],
};

export function filterStrikesForRegion(rawStrikes: any[], regionTag: string) {
  if (!Array.isArray(rawStrikes)) return [];
  const regionKey = (regionTag || 'MILANO').toUpperCase();
  const keywords = REGION_AIRPORT_KEYWORDS[regionKey] || [];
  const fallback = REGION_AIRPORT_FALLBACK[regionKey];

  return rawStrikes
    .map((strike) => {
      if (!strike) return null;
      if (strike.category !== 'AIRPORT') return strike;

      const lines = sanitizeAffectedLines(strike.affected_lines || []);
      if (keywords.length === 0) return { ...strike, affected_lines: lines };

      const providerText = (strike.provider || '').toLowerCase();
      const regionRaw = String(strike.region || '').toLowerCase();
      const isNational = regionRaw.includes('national') || regionRaw.includes('nazionale') || regionRaw.includes('国家');

      const filtered = lines.filter((l: string) => keywords.some(k => l.toLowerCase().includes(k)));
      if (filtered.length > 0) {
        return { ...strike, affected_lines: filtered };
      }

      const providerMatches = keywords.some(k => providerText.includes(k));
      if (providerMatches || isNational) {
        return { ...strike, affected_lines: fallback || lines };
      }

      // Local strike but no region match: drop to avoid leaking other-city airports
      return null;
    })
    .filter(Boolean);
}

/**
 * Union overlaps helper
 */
function mergeTimeWindows(windows: any[]) {
  if (windows.length <= 1) return windows;
  windows.sort((a, b) => a.start.localeCompare(b.start));
  const merged = [windows[0]];
  for (let i = 1; i < windows.length; i++) {
    const last = merged[merged.length - 1];
    const current = windows[i];
    if (current.start <= last.end) {
      last.end = current.end > last.end ? current.end : last.end;
    } else {
      merged.push(current);
    }
  }
  return merged;
}

/**
 * Data Aggregation (Phase) per user PRD
 * Groups identically dated strikes inside the same category
 */
export function aggregateStrikes(rawStrikes: any[]) {
  const map = new Map<string, any>();

  rawStrikes.forEach(strike => {
    // Group by Date + Category + Time (for Airport)
    let key = `${strike.date}|${strike.category}`;
    if (strike.category === 'AIRPORT') {
      key += `|${strike.display_time}`;
    }

    if (!map.has(key)) {
      map.set(key, JSON.parse(JSON.stringify(strike)));
    } else {
      const existing = map.get(key);

      // Merge Provider with slashes instead of commas/顿号
      const providers = existing.provider.split(' / ').concat(existing.provider.split('、'));
      const strikeProvs = strike.provider.split(' / ').concat(strike.provider.split('、'));

      strikeProvs.forEach((p: string) => {
        if (!providers.includes(p)) {
          existing.provider += ' / ' + p;
          providers.push(p);
        }
      });

      // Merge Strike Windows
      const allWindows = [...(existing.strike_windows || []), ...(strike.strike_windows || [])];
      if (strike.duration_hours === '24小时' || existing.duration_hours === '24小时') {
        existing.duration_hours = '24小时';
        existing.display_time = '全天 24小时';
        existing.strike_windows = [{ start: '00:00', end: '24:00' }];
      } else {
        existing.strike_windows = mergeTimeWindows(allWindows);
        existing.display_time = existing.strike_windows.map((w: any) => `${w.start} - ${w.end}`).join(', ');
      }

      // Merge Status
      if (strike.status === 'CONFIRMED') existing.status = 'CONFIRMED';

      // Merge Affected Lines
      const linesSet = new Set([...(existing.affected_lines || []), ...(strike.affected_lines || [])]);
      existing.affected_lines = sanitizeAffectedLines(Array.from(linesSet)).filter(l => l !== '全部线路' && l !== '全部车次');
      if (existing.affected_lines.length === 0) {
        existing.affected_lines = existing.category === 'AIRPORT' ? ['全部机场'] : ['全部线路'];
      }
    }
  });

  // Post processing for Airport logic
  return Array.from(map.values()).map(existing => {
    if (existing.category === 'AIRPORT') {
      const combinedProv = existing.provider.toUpperCase();
      if (combinedProv.includes('ALHA') || combinedProv.includes('DNATA') || combinedProv.includes('MALPENSA') || combinedProv.includes('LINATE')) {
        // Force overwrite affected lines with specific terminal breakdowns per user request
        existing.affected_lines = ["马尔彭萨 T1", "马尔彭萨 T2", "利纳特机场"];
      }

      // Strip airport names from provider and push them into affected_lines
      let cleanedProvider = existing.provider;
      const airportRefs = new Set<string>();

      const extractAirportRefs = (input: string) => {
        let cleaned = input;
        const refs: string[] = [];

        // Chinese airport names like "布雷西亚蒙蒂基亚里机场"
        const cnMatches = cleaned.match(/[\u4e00-\u9fa5]{2,}机场/g);
        if (cnMatches) {
          cnMatches.forEach(m => {
            const t = m.trim();
            if (t && t !== '机场') refs.push(t);
            cleaned = cleaned.replace(m, '');
          });
        }

        // Italian/English airport names like "AEROPORTO DI BRESCIA"
        const itMatches = [...cleaned.matchAll(/AEROPORTO(?:\s+DI|\s+D')?\s*([A-ZÀ-ÖØ-öø-ÿ\s\-]{2,})/gi)];
        itMatches.forEach(m => {
          const name = (m[1] || '').trim();
          if (name) refs.push(name);
        });
        const enMatches = [...cleaned.matchAll(/AIRPORT\s*([A-ZÀ-ÖØ-öø-ÿ\s\-]{2,})/gi)];
        enMatches.forEach(m => {
          const name = (m[1] || '').trim();
          if (name) refs.push(name);
        });

        cleaned = cleaned.replace(/AEROPORTO|AEROPORTI|AIRPORT/gi, '').replace(/\s{2,}/g, ' ').trim();
        return { cleaned, refs };
      };
      // Canonical mapping to deduplicate and translate acronyms
      const parts = cleanedProvider.split(/[\/、]/).map((p: string) => p.trim()).filter(Boolean);
      const canonicalSet = new Set<string>();
      const unmappedSet = new Set<string>();
      const entityRoleMap = new Map<string, Set<string>>();

      parts.forEach((p: string) => {
        const { cleaned, refs } = extractAirportRefs(p);
        refs.forEach(r => airportRefs.add(r));
        if (!cleaned) return;

        const upper = cleaned.toUpperCase();
        const codeAllowlist = new Set(['ENAV', 'SEA', 'ALHA', 'DNATA', 'ITA', 'GDA', 'TRENORD', 'ATM']);
        if (/\d/.test(upper) && /^[A-Z0-9]{2,6}$/.test(upper) && !codeAllowlist.has(upper)) {
          return;
        }
        let mapped = false;

        // Determine role
        let role = "";
        if (upper.includes('地勤') || upper.includes('接待') || upper.includes('TERRA') || upper.includes('HANDLING') || upper.includes('管理') || upper.includes('地面')) {
          role = "地勤";
        } else if (upper.includes('飞行') || upper.includes('导航') || upper.includes('乘务') || upper.includes('PILOT') || upper.includes('CREW') || upper.includes('纳维甘特')) {
          role = "机组与飞行员";
        } else if (upper.includes('安检') || upper.includes('SECURITY')) {
          role = "安检";
        } else if (upper.includes('行李') || upper.includes('BAGGAGE')) {
          role = "行李搬运";
        } else if (upper.includes('管制') || upper.includes('空管') || upper.includes('ENAV')) {
          role = "空管";
        }

        // Determine Entity
        let entity = "";
        let enBase = "";
        if (upper.includes('EASYJET') || upper.includes('易捷')) {
          entity = '易捷航空'; enBase = 'easyJet';
        }
        else if (upper.includes('ITA') || upper.includes('EITA') || upper.includes('意大利航空')) {
          entity = '意大利航空'; enBase = 'ITA';
        }
        else if (upper.includes('RYANAIR') || upper.includes('瑞安')) {
          entity = '瑞安航空'; enBase = 'Ryanair';
        }
        else if (upper.includes('WIZZ') || upper.includes('维兹')) {
          entity = '维兹航空'; enBase = 'Wizz Air';
        }
        else if (upper.includes('DNATA')) {
          entity = '德纳达'; enBase = 'dnata'; role = role || "地服";
        }
        else if (upper.includes('ALHA') || upper.includes('阿尔哈')) {
          entity = '阿尔哈'; enBase = 'ALHA'; role = role || "地服仓储";
        }
        else if (upper.includes('SEA')) {
          entity = '米兰机场运营'; enBase = 'SEA'; role = role || "管理";
        }
        else if (upper.includes('ENAV')) {
          entity = '意大利空管局'; enBase = 'ENAV'; role = "空管";
        }

        if (entity) {
          // Add to map
          if (!entityRoleMap.has(entity)) {
            entityRoleMap.set(entity, new Set<string>());
          }
          if (role) {
            entityRoleMap.get(entity)!.add(role);
          }
          mapped = true;
        }

        if (!mapped) {
          // If no specific company, maybe just the role?
          if (role && !upper.includes('工会') && !upper.includes('CUB') && !upper.includes('CGIL') && !upper.includes('USB') && !upper.includes('UGL')) {
            canonicalSet.add(`机场${role}人员`);
            mapped = true;
          } else {
            // Remove meaningless job titles to see if anything substantial is left
            let cl = cleaned.replace(/接待人员|陆路|导航人员|地勤飞行人员|地勤|飞行人员|人员|工|管理|DI TERRA|E飞行|纳维甘特|航空有限公司|航空公司/ig, '').trim();
            if (cl.length > 2 || (cl.match(/^[a-zA-Z]{2,}$/) && cl.length >= 2)) {
              unmappedSet.add(cleaned); // Keep the cleaned value if it couldn't be mapped properly
            }
          }
        }
      });

      // Compress mapped entities into canonicalSet
      entityRoleMap.forEach((roles, ent) => {
        if (roles.size > 0) {
          const roleStr = Array.from(roles).join('及');
          canonicalSet.add(`${ent}${roleStr}`);
        } else {
          canonicalSet.add(ent);
        }
      });

      let finalProviders = Array.from(canonicalSet);
      if (finalProviders.length === 0) {
        finalProviders = Array.from(unmappedSet);
      } else {
        // If we found canonical names, only add unmapped names if they are significantly different
        Array.from(unmappedSet).forEach(u => {
          if (u.length > 3 && !finalProviders.some(f => f.includes(u.substring(0, 2)))) {
            finalProviders.push(u);
          }
        });
      }

      cleanedProvider = finalProviders.join(' / ');

      if (cleanedProvider === '') {
        cleanedProvider = '航司与机场人员';
      }

      existing.provider = cleanedProvider;

      if (airportRefs.size > 0) {
        const linesSet = new Set(existing.affected_lines || []);
        airportRefs.forEach(r => linesSet.add(r));
        existing.affected_lines = sanitizeAffectedLines(Array.from(linesSet));
      }
    }

    return existing;
  });
}
