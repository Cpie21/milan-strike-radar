// node audio/render-film3.mjs → public/audio/film3-zh.wav, film3-en.wav (mirrors src/v3/Film3.tsx)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const CH = process.env.CHROME || '/Users/tristan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SHOTS = [['chaos', 168], ['title', 96], ['ask', 150], ['working', 78], ['how', 222], ['answer', 120], ['day', 138], ['italy', 156], ['payoff', 120], ['logo', 84]];
const frames = SHOTS.reduce((n, [, l]) => n + l, 0);
const S = {}; SHOTS.reduce((t, [n, l]) => { S[n] = t; return t + l; }, 0);
const REC = { zh: { typed: 54, q: '周五早上 9 点坐 M1 会受影响吗？' }, en: { typed: 96, q: 'Will the M1 be affected on Friday at 9am?' } };
const typing = lang => [...REC[lang].q].map((_, i) => 30 + (2 * i) * 80 / (REC[lang].typed - 14)).filter(f => f < 110);
const proc = spawn(CH, ['--headless=new', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=9357', '--user-data-dir=/tmp/promo-audio3', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let t; for (let i = 0; i < 40 && !t; i++) { await sleep(250); try { t = (await (await fetch('http://127.0.0.1:9357/json')).json()).find(x => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const p = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.navigate', { url: 'file://' + path.join(here, 'film3.html') }); for (let i = 0; i < 40; i++) { await sleep(250); const ok = await send('Runtime.evaluate', { expression: 'typeof renderFilm3', returnByValue: true }); if (ok.result?.result?.value === 'function') break; }
for (const lang of ['zh', 'en']) {
  const r = await send('Runtime.evaluate', { expression: `renderFilm3(${JSON.stringify({ frames, S, typing: typing(lang), lang })})`, awaitPromise: true, returnByValue: true });
  if (!r.result?.result?.value) { console.log(JSON.stringify(r).slice(0, 500)); process.exit(1); }
  writeFileSync(path.join(here, `../public/audio/film3-${lang}.wav`), Buffer.from(r.result.result.value, 'base64'));
  console.log('wrote', lang, (frames / 30).toFixed(2), 's');
}
ws.close(); proc.kill(); process.exit(0);
