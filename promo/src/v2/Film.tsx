import { AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Device, SCREEN } from './Device';
import { Rec } from './Rec';
import { camAt, fade, type Cam } from './camera';
import { Dots } from './Dots';
import { Process } from './Process';
import { SANS } from './fonts';
import type { Lang } from '../scenes/Hook';

// The cut, in the manner of Anthropic's product films: the real product
// filmed close, a camera that glides between what matters, the work shown
// as plain text on black, no slogans. Loops: the end runs into the start.
const REC = { zh: { ask: 154, submit: 64, typeRate: 1 }, en: { ask: 198, submit: 108, typeRate: 1.75 } };
type Shot = { name: string; len: number };
export const SHOTS: Shot[] = [
  { name: 'open', len: 44 }, { name: 'ask', len: 58 }, { name: 'process', len: 60 }, { name: 'answer', len: 78 },
  { name: 'day', len: 84 }, { name: 'cities', len: 64 }, { name: 'spray', len: 64 }, { name: 'end', len: 66 },
];
export const FILM_FRAMES = SHOTS.reduce((n, s) => n + s.len, 0);
const START = Object.fromEntries(SHOTS.reduce<[string, number][]>((acc, s, i) => [...acc, [s.name, i ? acc[i - 1][1] + SHOTS[i - 1].len : 0]], []));

// the device, filmed: camera keys in screen points
function Screen({ f, keys, children, touches = [] }: { f: number; keys: Cam[]; children: (k: number) => React.ReactNode; touches?: { x: number; y: number; at: number }[] }) {
  const c = camAt(keys, f);
  const ts = touches.map(t => ({ x: t.x, y: t.y, a: interpolate(f, [t.at - 3, t.at, t.at + 5, t.at + 10], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }));
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 80% at 50% 45%, #121316 0%, #000 70%)' }}>
      <div style={{ position: 'absolute', left: 540 - c.fx * c.k, top: 960 - c.fy * c.k }}>
        <Device k={c.k} touches={ts}>{children(c.k)}</Device>
      </div>
    </AbsoluteFill>
  );
}

export function Film({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const r = REC[lang];
  const shot = SHOTS.find(s => frame >= START[s.name] && frame < START[s.name] + s.len) ?? SHOTS[SHOTS.length - 1];
  const f = frame - START[shot.name];
  const FULL = 1.95, MID = { fx: SCREEN.w / 2, fy: SCREEN.h / 2 };
  let view: React.ReactNode = null;
  if (shot.name === 'open') view = <Dots t={f} lang={lang} out={fade(f, 34, 44)} />;
  if (shot.name === 'ask') view = (
    <Screen f={f} keys={[{ f: 0, fx: 201, fy: 812, k: 3.9 }, { f: 58, fx: 201, fy: 700, k: 2.5 }]} touches={[{ x: 362, y: 812, at: 52 }]}>
      {k => <Rec lang={lang} shot="ask" n={10 + f * r.typeRate} count={r.submit + 3} k={k} />}
    </Screen>
  );
  if (shot.name === 'process') view = <Process f={f} lang={lang} len={shot.len} />;
  if (shot.name === 'answer') view = (
    <Screen f={f} keys={[{ f: 0, ...MID, k: FULL }, { f: 26, ...MID, k: FULL }, { f: 70, fx: 201, fy: lang === 'zh' ? 400 : 330, k: 2.9 }]}>
      {k => <Rec lang={lang} shot="ask" n={r.submit + f} count={r.ask} k={k} />}
    </Screen>
  );
  if (shot.name === 'day') view = (
    <Screen f={f} keys={[{ f: 0, fx: 207, fy: 253, k: 3.6 }, { f: 14, fx: 207, fy: 262, k: 3.4 }, { f: 44, fx: 201, fy: 533, k: 2.7 }, { f: 84, fx: 201, fy: 520, k: 2.15 }]} touches={[{ x: 207, y: 253, at: 6 }]}>
      {k => <Rec lang={lang} shot="day" n={4 + f} count={110} k={k} />}
    </Screen>
  );
  if (shot.name === 'cities') view = (
    <Screen f={f} keys={[{ f: 0, ...MID, k: FULL }, { f: 34, fx: 201, fy: 620, k: 2.5 }, { f: 64, fx: 201, fy: 600, k: 2.6 }]}>
      {k => <Rec lang={lang} shot="cities" n={8 + f} count={90} k={k} />}
    </Screen>
  );
  if (shot.name === 'spray') view = (
    <Screen f={f} keys={[{ f: 0, fx: 201, fy: 400, k: 2.3 }, { f: 64, fx: 201, fy: 345, k: 2.9 }]}>
      {k => <Rec lang={lang} shot="spray" n={26 + f} count={96} k={k} />}
    </Screen>
  );
  if (shot.name === 'end') {
    const a = fade(f, 0, 10) * (1 - fade(f, 40, 50));
    view = (
      <AbsoluteFill style={{ background: '#000' }}>
        {f >= shot.len - 16 && <Dots t={f - shot.len} lang={lang} />}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 700, textAlign: 'center', opacity: a, transform: `translateY(${(1 - fade(f, 0, 12)) * 16}px)` }}>
          <Img src={staticFile('app-icon.png')} style={{ width: 248, height: 248, borderRadius: 56, boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }} />
          <div style={{ marginTop: 40, fontFamily: SANS, fontWeight: 600, fontSize: 72, color: '#F2EFE8', letterSpacing: lang === 'zh' ? '0.06em' : '-0.01em' }}>{lang === 'zh' ? '意大利罢工查询' : 'Italy Strike Radar'}</div>
          <div style={{ marginTop: 14, fontFamily: SANS, fontWeight: 500, fontSize: 36, color: 'rgba(242,239,232,0.45)' }}>{lang === 'zh' ? 'Italy Strike Radar' : '意大利罢工查询'}</div>
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {view}
      <Audio src={staticFile(`audio/film-${lang}.wav`)} />
    </AbsoluteFill>
  );
}
