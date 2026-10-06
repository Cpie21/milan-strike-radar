import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadSC } from '@remotion/google-fonts/NotoSansSC';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';

const mono = loadMono('normal', { weights: ['400', '500'] });
const sc = loadSC('normal', { weights: ['400', '500', '700'], ignoreTooManyRequestsWarning: true });
const inter = loadInter('normal', { weights: ['500', '600'] });
export const MONO = `${mono.fontFamily}, ${sc.fontFamily}, monospace`;
export const SANS = `${inter.fontFamily}, ${sc.fontFamily}, sans-serif`;
// The device's status bar: the system face, as iOS draws it.
export const SYSTEM = `-apple-system, "SF Pro Text", ${inter.fontFamily}, sans-serif`;
