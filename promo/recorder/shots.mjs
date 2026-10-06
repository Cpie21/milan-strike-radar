// The real interactions the video is cut from, recorded per language.
// node shots.mjs zh|en [shot…]
import { readFileSync } from 'node:fs';
import { open, record } from './rec.mjs';

const lang = process.argv[2] || 'zh';
const only = process.argv.slice(3);
const B = process.env.SITE || 'http://localhost:3001';
const OUT = new URL(`../public/rec/${lang}`, import.meta.url).pathname;
const ask = JSON.parse(readFileSync(new URL(`ask-${lang}.json`, import.meta.url), 'utf8'));

const b = await open(lang === 'zh' ? 9351 : 9352);
// nothing leaves for production data while recording: analytics off, and
// graffiti/feedback writes answered locally
await b.send('Network.enable');
await b.send('Network.setBlockedURLs', { urls: ['*posthog*', '*i.posthog.com*', '*vercel-insights*'] });
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const f=window.fetch;window.fetch=(u,o)=>{const url=String(u&&u.url||u);if(o&&o.method&&o.method!=='GET'&&/\\/api\\/(doodles|ask\\/feedback)/.test(url))return Promise.resolve(new Response(JSON.stringify({available:false,ok:true}),{status:200,headers:{'Content-Type':'application/json'}}));return f(u,o);};})()` });
const setup = async () => {
  await b.go(`${B}/`, 1500);
  await b.ev(`localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('italy_strike_language', ${JSON.stringify(lang)});
    localStorage.setItem('italy_strike_city', '/');
    sessionStorage.setItem('lab_ask_cache', ${JSON.stringify(JSON.stringify({ [ask.key]: ask.entry }))}); 1`);
};
const want = name => !only.length || only.includes(name);
const typeInto = async (text, f, start, per = 2) => {
  const i = f - start;
  if (i === 0) await b.ev(`document.querySelector('form input, form textarea').focus(); 1`);
  if (i >= 0 && i % per === 0 && i / per < [...text].length) await b.send('Input.insertText', { text: [...text][i / per] });
};
const chars = [...ask.q].length;

// 1. the question, typed into the field docked at the bottom, then answered
if (want('ask')) {
  await setup();
  await b.go(`${B}/?date=2026-10-09`);
  const typed = 14 + chars * 2;
  await record(b, `${OUT}/ask`, typed + 12 + 90, async f => {
    await typeInto(ask.q, f, 14);
    if (f === typed + 12) await b.ev(`document.querySelector('form').requestSubmit(); 1`);
    // read the answer: the sheet scrolls gently to the line's bar
    if (f > typed + 12 + 45) await b.ev(`(()=>{const s=document.querySelector('[data-sheet-page]')?.closest('[data-vaul-no-drag]'); if(s) s.scrollTop += 4; return 1})()`);
  });
}

// 2. the day: from a calm today to the strike on the 9th
if (want('day')) {
  await setup();
  // start from today, whatever day it is when recording
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  await b.go(`${B}/?date=${today}`);
  await record(b, `${OUT}/day`, 110, async f => {
    if (f === 10) await b.ev(`document.querySelector('[data-date="2026-10-09"]').click(); 1`);
    if (f > 50) await b.ev(`window.scrollBy(0, ${Math.round(6 * Math.min(1, (f - 50) / 12) * Math.max(0, Math.min(1, (104 - f) / 12)))}); 1`);
  });
}

// 3. the cities: the list of twenty, scrolled
if (want('cities')) {
  await setup();
  await b.go(`${B}/?date=2026-10-09`);
  await record(b, `${OUT}/cities`, 90, async f => {
    if (f === 6) await b.ev(`[...document.querySelectorAll('header button')].pop().click(); 1`);
    if (f > 34) await b.ev(`(()=>{const s=[...document.querySelectorAll('[data-vaul-no-drag]')].pop(); if(s){ s.style.overflowY='auto'; s.scrollTop += ${8}; } return 1})()`);
  });
}

// 4. the wall: pick up the can and spray (writes blocked above)
if (want('spray')) {
  await setup();
  await b.ev(`localStorage.setItem('doodled_MILANO|2026-10-09|SUBWAY|', 'promo-recording'); 1`);
  await b.go(`${B}/?date=2026-10-09`);
  await b.ev(`(()=>{const c=document.querySelector('canvas[width="720"]'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 250); return 1})()`);
  for (let i = 0; i < 20; i++) await b.tick(50);
  let box = null;
  const path = (t) => { // a fast tag: a loop and a long underline
    const [x, y, w, h] = box;
    if (t < 1) return [x + w * (0.22 + 0.5 * t), y + h * (0.42 + 0.16 * Math.sin(t * 9))];
    return [x + w * (0.2 + 0.6 * (t - 1)), y + h * 0.7 + Math.sin((t - 1) * 5) * 6];
  };
  await record(b, `${OUT}/spray`, 96, async f => {
    if (f === 4) await b.ev(`[...document.querySelectorAll('button')].find(x=>/拿起喷罐|Pick up the can/.test(x.textContent))?.click(); 1`);
    if (f === 30) box = await b.ev(`(()=>{const r=document.querySelector('canvas[width="720"]').parentElement.getBoundingClientRect(); return [r.left,r.top,r.width,r.height]})()`);
    const strokes = [[34, 58, 0, 1], [64, 86, 1, 2]];
    for (const [a, z, t0, t1] of strokes) {
      if (!box || f < a || f > z) continue;
      const t = t0 + (t1 - t0) * (f - a) / (z - a);
      const [x, y] = path(t);
      const type = f === a ? 'mousePressed' : f === z ? 'mouseReleased' : 'mouseMoved';
      await b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
    }
  });
}

b.close(); process.exit(0);
