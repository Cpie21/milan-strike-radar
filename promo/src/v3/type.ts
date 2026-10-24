import { loadFont as loadSerifSC } from '@remotion/google-fonts/NotoSerifSC';
import { loadFont as loadNews } from '@remotion/google-fonts/Newsreader';
export { MONO, SANS } from '../v2/fonts';

// Three voices, as in the reference: sans for people and the interface,
// mono for the machine at work, serif for the film speaking to you.
const serifSC = loadSerifSC('normal', { weights: ['400', '700'], ignoreTooManyRequestsWarning: true });
const news = loadNews('normal', { weights: ['400', '600'] });
export const SERIF = { zh: `${serifSC.fontFamily}, serif`, en: `${news.fontFamily}, ${serifSC.fontFamily}, serif` };
export type Lang = 'zh' | 'en';
export const INK = '#ECE8DF', DIM = 'rgba(236,232,223,0.5)', AMBER = '#FFB14A';
export const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
