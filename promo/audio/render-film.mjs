// node audio/render-film.mjs → public/audio/film-zh.wav, film-en.wav
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const CH = process.env.CHROME || '/Users/tristan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
// mirrors src/v2/Film.tsx
const SHOTS = [['open', 44], ['ask', 58], ['process', 60], ['answer', 78], ['day', 84], ['cities', 64], ['spray', 64], ['end', 66]];
const frames = SHOTS.reduce((n, [, l]) => n + l, 0);
const starts = {}; SHOTS.reduce((t, [n, l]) => { starts[n] = t; return t + l; }, 0);
const typingFor = lang => {
  const q = lang === 'zh' ? '周五早上 9 点坐 M1 会受影响吗？' : 'Will the M1 be affected on Friday at 9am?';
  const rate = lang === 'zh' ? 1 : 1.75; // recording frames per film frame
  return [...q].map((_, i) => (14 + 2 * i - 10) / rate).filter(f => f >= 0 && f < 52);
};
const proc = spawn(CH, ['--headless=new', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=9349', '--user-data-dir=/tmp/promo-audio2', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let t; for (let i = 0; i < 40 && !t; i++) { await sleep(250); try { t = (await (await fetch('http://127.0.0.1:9349/json')).json()).find(x => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const p = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.navigate', { url: 'file://' + path.join(here, 'film.html') }); await sleep(1500);
for (const lang of ['zh', 'en']) {
  const r = await send('Runtime.evaluate', { expression: `renderFilm(${JSON.stringify({ frames, starts, typing: typingFor(lang), lang })})`, awaitPromise: true, returnByValue: true });
  if (!r.result?.result?.value) { console.log(JSON.stringify(r).slice(0, 500)); process.exit(1); }
  writeFileSync(path.join(here, `../public/audio/film-${lang}.wav`), Buffer.from(r.result.result.value, 'base64'));
  console.log('wrote', lang, (frames / 30).toFixed(2), 's');
}
ws.close(); proc.kill(); process.exit(0);
