import { canonicalizeRegionValue } from './strikeNormalization';

export type GuaranteeWindow = {
  start: string;
  end: string;
};

type GuaranteeInput = {
  category: 'TRAIN' | 'SUBWAY' | 'BUS' | 'AIRPORT';
  dateIso: string;
  region?: string;
  isFullDay?: boolean;
};

export function getGuaranteeWindows({ category, region, isFullDay }: GuaranteeInput): GuaranteeWindow[] {
  const normalizedRegion = canonicalizeRegionValue(region || '');

  if (category === 'AIRPORT') {
    if (!isFullDay) return [];
    return [
      { start: '07:00', end: '10:00' },
      { start: '18:00', end: '21:00' },
    ];
  }

  // Railway guarantees depend on operator, service type, holiday and the
  // published train list. MIT timing alone cannot certify a guaranteed train.
  if (category === 'TRAIN') return [];

  if (category === 'BUS' || category === 'SUBWAY') {
    if (normalizedRegion === 'TORINO') {
      return [
        { start: '06:00', end: '09:00' },
        { start: '12:00', end: '15:00' },
      ];
    }

    if (normalizedRegion === 'ROMA') {
      return [
        { start: '00:00', end: '08:29' },
        { start: '17:00', end: '19:59' },
      ];
    }

    if (normalizedRegion !== 'MILANO') return [];
    return [
      { start: '00:00', end: '08:45' },
      { start: '15:00', end: '18:00' },
    ];
  }

  return [];
}
