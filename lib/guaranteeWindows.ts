import { canonicalizeRegionValue } from './strikeNormalization.ts';

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

export function getGuaranteeWindows({ category, dateIso, region, isFullDay }: GuaranteeInput): GuaranteeWindow[] {
  const normalizedRegion = canonicalizeRegionValue(region || '');
  const date = new Date(dateIso);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  if (category === 'AIRPORT') {
    if (!isFullDay) return [];
    return [
      { start: '07:00', end: '10:00' },
      { start: '18:00', end: '21:00' },
    ];
  }

  if (category === 'TRAIN') {
    if (isWeekend) return [];
    return [
      { start: '06:00', end: '09:00' },
      { start: '18:00', end: '21:00' },
    ];
  }

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

    return [
      { start: '00:00', end: '08:45' },
      { start: '15:00', end: '18:00' },
    ];
  }

  return [];
}
