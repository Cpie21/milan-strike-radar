// Verified department meanings, not a dated notice or evidence of every line.
export const EAV_DEPARTMENT_SOURCE = 'https://www.eavsrl.it/avvisi-di-sciopero/dati-adesioni-scioperi/';
export function eavDepartmentModes(provider: string): ('TRAIN'|'BUS')[] {
  if (!/\bEAV\b/i.test(provider)) return [];
  const modes: ('TRAIN'|'BUS')[] = [];
  if (/\bDTF\b|direzione trasporto ferroviario/i.test(provider)) modes.push('TRAIN');
  if (/\bDTA\b|direzione trasporto automobilistico/i.test(provider)) modes.push('BUS');
  return modes;
}
