// Canonical identifiers for MIT's structured administrative fields. These are
// declarations, not a city/service coverage registry and not inferred from an
// employer's name. A province identifier never claims only its capital is hit.
export type NormalizedOfficialGeography = {
  administrativeRegion: { name: string; tag: string } | null;
  province: { name: string; tag: string } | null;
};

function administrativeName(raw?: string): string | null {
  const value = (raw || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!value || value.length > 100 || !/^[\p{L}\p{M}\s.'’/–—-]+$/u.test(value)) return null;
  if (/^(?:tutt[eaio](?:\s+italia)?|italia|nazionale|national|unknown|other|n\/?d|n\.?d\.?|non (?:indicat[oa]|specificat[oa]|disponibile)|da (?:definire|confermare)|sconosciut[oa]|不明|未知)$/i.test(value) || /\b(?:nazional[ei]|unknown|sconosciut[oa]|da (?:definire|confermare)|non (?:indicat[oa]|specificat[oa]))\b/i.test(value)) return null;
  return value;
}
export function administrativeTag(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/['’]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}
export function normalizeOfficialGeography(region?: string, province?: string): NormalizedOfficialGeography {
  const r = administrativeName(region), p = administrativeName(province);
  return {
    administrativeRegion: r && administrativeTag(r) ? { name: r, tag: `REGION_${administrativeTag(r)}` } : null,
    province: p && administrativeTag(p) ? { name: p, tag: administrativeTag(p) } : null,
  };
}
