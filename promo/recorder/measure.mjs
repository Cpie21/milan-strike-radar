import { readFileSync, writeFileSync } from 'node:fs';
import { open } from './rec.mjs';
const B = 'http://localhost:3001';
const out = {};
for (const lang of ['zh', 'en']) {
  const ask = JSON.parse(readFileSync(`ask-${lang}.json`, 'utf8'));
  const b = await open(9355);
  await b.go(`${B}/`, 1500);
  await b.ev(`localStorage.clear(); localStorage.setItem('italy_strike_language', ${JSON.stringify(lang)}); sessionStorage.setItem('lab_ask_cache', ${JSON.stringify(JSON.stringify({ [ask.key]: ask.entry }))}); 1`);
  const r = sel => `(()=>{const e=${sel}; if(!e) return null; const b=e.getBoundingClientRect(); return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)]})()`;
  await b.go(`${B}/?date=2026-10-09`);
  const m = {};
  m.field = await b.ev(r(`document.querySelector('form')`));
  m.rail9 = await b.ev(r(`document.querySelector('[data-date="2026-10-09"]')`));
  m.hero = await b.ev(r(`[...document.querySelectorAll('span')].find(s=>s.textContent==='08:45')?.parentElement?.parentElement`));
  await b.ev(`document.querySelector('form input, form textarea').focus(); 1`);
  await b.send('Input.insertText', { text: ask.q }); // not used for capture; just to open the sheet
  await b.ev(`document.querySelector('form').requestSubmit(); 1`);
  for (let i = 0; i < 60; i++) await b.tick(33);
  m.verdict = await b.ev(r(`[...document.querySelectorAll('[data-vaul-drawer] p')].find(p=>/很可能|Likely/.test(p.textContent))?.parentElement`));
  m.sheet = await b.ev(r(`document.querySelector('[data-vaul-drawer]')`));
  out[lang] = m;
  b.close();
}
writeFileSync('../src/rects.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
process.exit(0);
