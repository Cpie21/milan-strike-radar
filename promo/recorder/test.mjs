import { open, record } from './rec.mjs';
const b = await open();
await b.go('http://localhost:3001/?date=2026-10-09');
await b.ev(`localStorage.setItem('italy_strike_language','zh'); 1`);
await b.go('http://localhost:3001/?date=2026-10-09');
await record(b, '../public/rec/test', 24, async f => { if (f === 3) await b.ev(`document.querySelector('[data-date="2026-10-10"]').click(); 1`); });
b.close(); process.exit(0);
