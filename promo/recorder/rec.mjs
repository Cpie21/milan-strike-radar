// Records the real site frame by frame on a virtual clock (timeweb): every
// animation (framer-motion springs, sheets, the LED face) advances exactly
// 1/30 s between screenshots, so the footage is the product itself, at
// iPhone 17 Pro size (402×874 pt) and 4× pixels.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
// timeweb (open source, the time engine behind timesnap/timecut) replaces the
// page's clock: rAF, timers, performance.now, Date, CSS/Web animations.
const TIMEWEB = readFileSync(createRequire(import.meta.url).resolve('timeweb/dist/timeweb.js'), 'utf8');
const CH = process.env.CHROME || '/Users/tristan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
export const W = 402, H = 874, DPR = 4, INSET = 62;

export async function open(port = 9350) {
  const proc = spawn(CH, ['--headless=new', '--hide-scrollbars', '--force-color-profile=srgb', `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/promo-rec-${port}`, 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let t; for (let i = 0; i < 60 && !t; i++) { await sleep(250); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); } catch {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const waiters = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method) for (const w of [...waiters]) if (w.method === m.method) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m.params); }
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const once = method => new Promise(resolve => waiters.push({ method, resolve }));
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: TIMEWEB });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: INSET, bottom: 34, left: 0, right: 0 } });
  // the virtual clock: each step runs one animation frame and due timers
  let now = 0;
  const tick = async (ms) => { now += ms; await ev(`timeweb.goTo(${now}); 1`); };
  // load, then let the page live through `settle` ms of its own time
  const go = async (url, settle = 4000) => {
    now = 0; await send('Page.navigate', { url }); await sleep(2500);
    for (let t = 0; t < settle; t += 50) { await tick(50); if (t % 1000 === 0) await sleep(150); }
    await ev(`document.querySelectorAll('nextjs-portal').forEach(n=>n.remove()); 1`);
  };
  const shoot = async (file, quality = 92) => { const s = await send('Page.captureScreenshot', { format: 'jpeg', quality }); writeFileSync(file, Buffer.from(s.result.data, 'base64')); };
  const close = () => { ws.close(); proc.kill(); };
  return { send, ev, go, tick, shoot, close, sleep };
}

// A shot: `script` gets (frame) and may act before each frame is taken.
export async function record(b, dir, frames, script) {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  for (let f = 0; f < frames; f++) {
    await script(f);
    await b.tick(1000 / 30);
    await b.shoot(`${dir}/${String(f).padStart(4, '0')}.jpg`);
  }
}
