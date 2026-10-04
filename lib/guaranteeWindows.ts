
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

export function getGuaranteeWindows({ category, isFullDay }: GuaranteeInput): GuaranteeWindow[] {

  if (category === 'AIRPORT') {
    if (!isFullDay) return [];
    return [
      { start: '07:00', end: '10:00' },
      { start: '18:00', end: '21:00' },
    ];
  }

  // A city does not identify an operator or a dated strike notice.
  // Operator guarantees are read from that announcement by enrichment.
  return [];
}
