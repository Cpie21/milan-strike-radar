// One registry shared by ingestion, pages, APIs, subscriptions and widgets.
export const CITIES = [
  { tag: 'MILANO', slug: 'milano', zh: '米兰', en: 'Milan', region: 'lombardia', aliases: ['milan'], airports: ['马尔彭萨', '利纳特'], airportAliases: ['malpensa', 'mxp', 'linate', 'lin'] },
  { tag: 'ROMA', slug: 'roma', zh: '罗马', en: 'Rome', region: 'lazio', aliases: ['rome'], airports: ['菲乌米奇诺', '钱皮诺'], airportAliases: ['fiumicino', 'fco', 'ciampino', 'cia'] },
  { tag: 'TORINO', slug: 'torino', zh: '都灵', en: 'Turin', region: 'piemonte', aliases: ['turin'], airports: ['卡塞莱'], airportAliases: ['caselle', 'trn'] },
  { tag: 'NAPOLI', slug: 'napoli', zh: '那不勒斯', en: 'Naples', region: 'campania', aliases: ['naples'], airports: ['那不勒斯'], airportAliases: ['capodichino', 'nap'] },
  { tag: 'FIRENZE', slug: 'firenze', zh: '佛罗伦萨', en: 'Florence', region: 'toscana', aliases: ['florence'], airports: ['佛罗伦萨'], airportAliases: ['peretola', 'flr'] },
  { tag: 'BOLOGNA', slug: 'bologna', zh: '博洛尼亚', en: 'Bologna', region: 'emilia-romagna', aliases: [], airports: ['博洛尼亚'], airportAliases: ['guglielmo marconi', 'blq'] },
  { tag: 'VENEZIA', slug: 'venezia', zh: '威尼斯', en: 'Venice', region: 'veneto', aliases: ['venice'], airports: ['威尼斯'], airportAliases: ['marco polo', 'vce'] },
  { tag: 'GENOVA', slug: 'genova', zh: '热那亚', en: 'Genoa', region: 'liguria', aliases: ['genoa'], airports: ['热那亚'], airportAliases: ['cristoforo colombo', 'goa'] },
  { tag: 'PALERMO', slug: 'palermo', zh: '巴勒莫', en: 'Palermo', region: 'sicilia', aliases: [], airports: ['巴勒莫'], airportAliases: ['punta raisi', 'falcone borsellino', 'pmo'] },
  { tag: 'CATANIA', slug: 'catania', zh: '卡塔尼亚', en: 'Catania', region: 'sicilia', aliases: [], airports: ['卡塔尼亚'], airportAliases: ['fontanarossa', 'cta'] },
  { tag: 'BARI', slug: 'bari', zh: '巴里', en: 'Bari', region: 'puglia', aliases: [], airports: ['巴里'], airportAliases: ['karol wojtyla', 'bri'] },
  { tag: 'VERONA', slug: 'verona', zh: '维罗纳', en: 'Verona', region: 'veneto', aliases: [], airports: ['维罗纳'], airportAliases: ['villafranca', 'valerio catullo', 'vrn'] },
  { tag: 'PADOVA', slug: 'padova', zh: '帕多瓦', en: 'Padua', region: 'veneto', aliases: ['padua'], airports: [], airportAliases: [] },
  { tag: 'TRIESTE', slug: 'trieste', zh: '的里雅斯特', en: 'Trieste', region: 'friuli-venezia giulia', aliases: [], airports: ['的里雅斯特'], airportAliases: ['ronchi', 'trs'] },
  { tag: 'CAGLIARI', slug: 'cagliari', zh: '卡利亚里', en: 'Cagliari', region: 'sardegna', aliases: [], airports: ['卡利亚里'], airportAliases: ['elmas', 'cag'] },
  { tag: 'BERGAMO', slug: 'bergamo', zh: '贝加莫', en: 'Bergamo', region: 'lombardia', aliases: [], airports: ['贝加莫'], airportAliases: ['orio', 'bgy'] },
  { tag: 'BRESCIA', slug: 'brescia', zh: '布雷西亚', en: 'Brescia', region: 'lombardia', aliases: [], airports: [], airportAliases: [] },
  { tag: 'PISA', slug: 'pisa', zh: '比萨', en: 'Pisa', region: 'toscana', aliases: [], airports: ['比萨'], airportAliases: ['galileo galilei', 'psa'] },
  { tag: 'MESSINA', slug: 'messina', zh: '墨西拿', en: 'Messina', region: 'sicilia', aliases: [], airports: [], airportAliases: [] },
  { tag: 'PERUGIA', slug: 'perugia', zh: '佩鲁贾', en: 'Perugia', region: 'umbria', aliases: [], airports: ['佩鲁贾'], airportAliases: ['san francesco', 'peg'] },
] as const;

export function resolveCity(input?: string | null) {
  const value = (input || '').trim().toLowerCase();
  return CITIES.find(city => [city.tag.toLowerCase(), city.slug, city.zh, city.en.toLowerCase(), ...city.aliases].some(alias => alias === value));
}

export function cityPath(tag: string) {
  const city = resolveCity(tag);
  return !city || city.tag === 'MILANO' ? '/' : `/${city.slug}`;
}

export const CITY_OPTIONS = CITIES.map(city => ({ tag: city.tag, path: cityPath(city.tag) }));
