// The owner forbids Gemini model calls. Preserve the existing translation
// contract so readers fall back to the original text without any network,
// model, budget reservation or old model-cache access. Do not substitute
// another paid model for translation.
export type Translation = { zh: string; en: string };

// Facts that must survive: clock times (normalised) and line codes.
const clocks = (t: string) => [...t.matchAll(/(\d{1,2})[:.](\d{2})/g)].map(m => `${m[1].padStart(2, '0')}:${m[2]}`);
const lineCodes = (t: string) => [...t.toUpperCase().matchAll(/\b(M[1-5]|S\d{1,2}|RE?\d{1,2})\b/g)].map(m => m[1]);
export function keepsFacts(source: string, out: string) {
  const oc = clocks(out), ol = lineCodes(out);
  return clocks(source).every(c => oc.includes(c)) && lineCodes(source).every(l => ol.includes(l));
}


export async function translateAll(_texts: string[]): Promise<Record<string, Translation>> {
  void _texts;
  return {};
}
