import type { Mode } from './model';

// When a notice says "until end of service", a clock time is easier to act
// on than the phrase. Only times with a published source are listed; every
// other case keeps the phrase. Times past midnight are the next day.

export type ServiceEnd = { end: string; note: [string, string]; source: { name: string; url: string } };

const ENDS: Record<string, Partial<Record<Mode, ServiceEnd>>> = {
  MILANO: {
    SUBWAY: {
      end: '00:30',
      note: ['ATM 地铁末班约 00:30，各线略有不同', 'ATM metro runs to about 00:30; varies by line'],
      // ATM: "La blu è in servizio tutti i giorni dalla prima mattina fino alle 00:30 circa" (M4); M1–M3 run to a similar time.
      source: { name: 'ATM', url: 'https://www.atm.it/it/AtmNews/AtmInforma/Pagine/M4informazionisulserviziopasseggeribis.aspx' },
    },
  },
};

export const serviceEnd = (region: string, mode: Mode): ServiceEnd | null => ENDS[region]?.[mode] ?? null;
