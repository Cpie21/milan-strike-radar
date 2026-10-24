import { Img, staticFile } from 'remotion';
import { SCREEN } from './Device';

// One frame of a recording of the real site (recorder/shots.mjs), filling the screen.
export function Rec({ lang, shot, n, count, k }: { lang: string; shot: string; n: number; count: number; k: number }) {
  const i = Math.max(0, Math.min(count - 1, Math.round(n)));
  return <Img src={staticFile(`rec/${lang}/${shot}/${String(i).padStart(4, '0')}.jpg`)} style={{ position: 'absolute', inset: 0, width: SCREEN.w * k, height: SCREEN.h * k }} />;
}
