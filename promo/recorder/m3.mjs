import { open } from './rec.mjs';
const b = await open(9359);
await b.go('http://localhost:3001/?date=2026-10-09');
console.log(JSON.stringify(await b.ev(`[...document.querySelectorAll('[role=img]')].map(e=>{const r=e.getBoundingClientRect();return [e.className.slice(0,40),Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]}).filter(x=>x[2]>600)`)));
b.close(); process.exit(0);
