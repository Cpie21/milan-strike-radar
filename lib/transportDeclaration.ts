// Official declaration scope is separate from clocks and operator service
// confirmation. A general workday announcement is never a 00:00–24:00 promise.
export type PassengerMode = 'TRAIN' | 'BUS' | 'SUBWAY' | 'AIRPORT';
type Declaration = { provider: string; sector: string; modalita: string; note: string };
export const isGeneralDeclaration = (row: Pick<Declaration,'provider'|'sector'>) => /^generale$/i.test(row.sector.trim()) || /sciopero generale/i.test(row.provider);
export function excludedPassengerModes(text: string): Set<PassengerMode> {
  const excluded = new Set<PassengerMode>();
  // Some general notices exclude the whole transport sector in one phrase.
  // A qualifier such as "aereo" after "trasporti" must not mean every mode.
  if (/\besclus[oaie]\s+(?:(?:il|l['’])\s*)?(?:intero\s+)?settore\s+(?:dei\s+)?trasporti(?=\s*(?:$|[;.,*\-\r\n]))/i.test(text)) return new Set(['TRAIN','BUS','SUBWAY','AIRPORT']);
  for (const match of text.matchAll(/\besclus[oaie]\s+(?:(?:il|i|la|le)\s+)?settor[ei]\s+([^;\n]+)/gi)) {
    const clause = match[1].split(/\s+-\s+adesion|\.\s+(?=[A-Z])/i)[0];
    if (/aere[oa]|aviazione/i.test(clause)) excluded.add('AIRPORT');
    if (/ferroviar/i.test(clause)) excluded.add('TRAIN');
    if (/trasporto pubblico|\btpl\b|autoferro/i.test(clause)) { excluded.add('BUS'); excluded.add('SUBWAY'); }
  }
  return excluded;
}
export function generalModesPending(row: Declaration): PassengerMode[] {
  if (!isGeneralDeclaration(row) || !/sciopero generale|tutt[ie].*(?:settori|categorie)/i.test(row.provider)) return [];
  // An articulated sector list is authoritative; don't add missing sectors.
  if (/ferroviario|\baereo\b|\btpl\b|trasporto pubblico|marittimo|autostrade|taxi/i.test(row.modalita)) return [];
  const excluded = excludedPassengerModes(row.note);
  return (['TRAIN','BUS','SUBWAY','AIRPORT'] as const).filter(mode => !excluded.has(mode));
}

// A TPL company list restricts that clause only, not the separate national rail
// clause. Only registered service-area relationships become city projections.
const tplAreas = [
  { pattern:/\bGTT\b/i, name:'GTT', cities:['TORINO'] },
  { pattern:/\bEAV\b/i, name:'EAV', cities:['NAPOLI'] },
  { pattern:/\bFER\.?\s*(?:DEL\s+)?SUD\s*EST\b|FERROVIE\s+(?:DEL\s+)?SUD\s*EST/i, name:'FERROVIE SUD EST', cities:['BARI'] },
  { pattern:/\bFERROTRAMVIARIA\b/i, name:'FERROTRAMVIARIA', cities:['BARI'] },
];
export function restrictedTpl(note: string) {
  const clause = /\bper\s+(?:il\s+)?tpl\s+(?:socc?\.?|aziende)\s*:?\s*([^;\n]+)/i.exec(note)?.[1];
  if (!clause) return null;
  const matches = tplAreas.filter(area => area.pattern.test(clause));
  return { declaration:clause, cities:[...new Set(matches.flatMap(area=>area.cities))], operators:(city:string)=>matches.filter(area=>area.cities.includes(city)).map(area=>area.name) };
}
