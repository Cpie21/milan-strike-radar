// Who is striking, in Chinese, by rule. The registry's own wording reaches
// the page when the sync's synonyms do not know it ("SCIOPERO GENERALE
// SETTORI PUBBLICI E PRIVATI人员"); these are the phrases it uses, said the
// way the site says them elsewhere. No model and no paid translation: an
// unknown part stays as it was.

type Label = string | ((m: RegExpMatchArray) => string);
const RULES: Array<[RegExp, Label, Label]> = [
  // general and multi-sector strikes: everyone, not one company
  [/^SCIOPERO\s+GENERALE\s+(?:SETTORI|CATEGORIE)\s+PUBBLIC[IH]E?\s+E\s+PRIVAT[IE](\s+ANCHE\s+IN\s+APPALTO(?:\s+E\s+STRUMENTALI)?)?(?:\s+REGIONE\s+(\w+))?$/i,
    m => `${m[2] ? REGION[m[2].toUpperCase()] ?? '' : ''}总罢工 · 公共和私营部门${m[1] ? '（含外包）' : ''}`,
    m => `${m[2] ? `${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()} ` : ''}general strike · public and private sectors${m[1] ? ' (incl. contractors)' : ''}`],
  [/^SCIOPERO\s+PLURISETTORIALE\s+CATEGORIE\s+PUBBLICHE\s+E\s+PRIVATE$/i, '多行业罢工 · 公共和私营部门', 'Multi-sector strike · public and private'],
  [/^IMPRESE\s+CHE\s+SVOLGONO\s+ATTIVITA'?\s+FERROVIARIA$/i, '铁路运营企业人员', 'Rail operators’ staff'],
  // airports
  [/^(?:SOCC?\.?\s+)?TOSCANA\s+AEROPORTI$/i, '托斯卡纳机场人员', 'Toscana Aeroporti staff'],
  [/^GH\s+TOSCANA\b.*PISA\s+E\s+FIRENZE$/i, '比萨、佛罗伦萨机场地勤人员', 'Pisa and Florence airport ground staff'],
  [/^AVIATION\s+SERVICES\s+AEROPORTI\s+ROMA\b/i, '罗马机场地勤人员（菲乌米奇诺、钱皮诺）', 'Rome airports ground staff (Fiumicino, Ciampino)'],
  [/^SICURITALIA\b.*MARCO\s+POLO\s+VENEZIA$/i, '威尼斯马可·波罗机场安检人员', 'Venice Marco Polo airport security'],
  // local transport
  [/^ANM\s+NAPOLI$/i, '那不勒斯 ANM 公交地铁人员', 'ANM Naples bus and metro staff'],
  [/^AIR\s+CAMPANIA\s+NAPOLI$/i, '那不勒斯 Air Campania 大巴人员', 'Air Campania Naples coach staff'],
  [/^VIAGGIANTE\s+DTF\s+EAV\s+NAPOLI$/i, '那不勒斯 EAV 列车乘务人员', 'EAV Naples train crews'],
  [/^ACTV$/i, '威尼斯 ACTV 公交水上巴士人员', 'ACTV Venice bus and waterbus staff'],
  [/^AVM$/i, '威尼斯 AVM 交通人员', 'AVM Venice transport staff'],
  [/^ATVO\s+VENEZIA$/i, '威尼斯 ATVO 大巴人员', 'ATVO Venice coach staff'],
  [/^GEST\s+SERVIZIO\s+TRANVIA\s+FIRENZE$/i, '佛罗伦萨有轨电车 GEST 人员', 'GEST Florence tram staff'],
  [/^BUS\s+INTERNATIONAL\s+SERVICE\s+ROMA$/i, '罗马 Bus International Service 大巴人员', 'Bus International Service Rome staff'],
  // stations and contractors
  [/^REGGIO\s+EMILIA\s+STORICA\s+ED\s+AV\s+MEDIOPADANA$/i, '雷焦艾米利亚车站人员', 'Reggio Emilia station staff'],
  [/^RIMINI$/i, '里米尼车站人员', 'Rimini station staff'],
  [/^LA\s+LUCENTE\b/i, '博洛尼亚保洁外包人员', 'Bologna contract cleaners'],
  [/^APPALTO\s+PULIZIE\s+PRESSO\s+BOLOGNA$/i, '博洛尼亚保洁外包人员', 'Bologna contract cleaners'],
];

const REGION: Record<string, string> = { TOSCANA: '托斯卡纳', LOMBARDIA: '伦巴第', PIEMONTE: '皮埃蒙特', VENETO: '威尼托', LAZIO: '拉齐奥', CAMPANIA: '坎帕尼亚', EMILIA: '艾米利亚' };

function part(text: string, lang: 'zh' | 'en') {
  const raw = text.trim();
  // the sync adds "人员" to whatever it could not name
  const bare = raw.replace(/\s*人员$/, '').trim();
  if (!/[A-Za-z]{3}/.test(bare)) return raw;
  for (const [re, zh, en] of RULES) {
    const m = bare.match(re);
    const to = lang === 'zh' ? zh : en;
    if (m) return typeof to === 'string' ? to : to(m);
  }
  return lang === 'zh' ? raw : bare;
}

export function providerZh(provider: string) {
  if (!provider) return provider;
  return [...new Set(provider.split(/\s*\/\s*/).map(p => part(p, 'zh')))].join(' / ');
}

// The same in English, for the parts the rules know; null when they know none.
export function providerEnRule(provider: string) {
  const parts = (provider || '').split(/\s*\/\s*/);
  if (!parts.some(p => RULES.some(([re]) => re.test(p.replace(/\s*人员$/, '').trim())))) return null;
  return [...new Set(parts.map(p => part(p, 'en')))].join(' / ');
}
