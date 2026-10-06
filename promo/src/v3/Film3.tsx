import { AbsoluteFill, Audio, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Device, SCREEN } from '../v2/Device';
import { Rec } from '../v2/Rec';
import { camAt, type Cam } from '../v2/camera';
import { Chaos, CHAOS_LEN } from './Chaos';
import { Title, B } from './Title';
import { Working } from './Working';
import { How, HOW_LEN } from './How';
import { Italy, ITALY_LEN } from './Italy';
import { LedMark } from './LedMark';
import { INK, SANS, type Lang } from './type';

// The film, after "Projects are now a conversation with Claude": one thread
// of objects from start to end. The tangle in your head → one promise → you
// ask it, in the real app → it works → how it knows → the answer, and what
// you decide → all of Italy → who does what → the name.
const REC = { zh: { submit: 64, typed: 54 }, en: { submit: 108, typed: 96 } };
export const SHOTS = [
  ['chaos', CHAOS_LEN], ['title', 96], ['ask', 150], ['working', 78], ['how', HOW_LEN],
  ['answer', 120], ['day', 138], ['italy', ITALY_LEN], ['payoff', 120], ['logo', 84],
] as const;
export const FILM3_FRAMES = SHOTS.reduce((n, [, l]) => n + l, 0);
const STARTS: Record<string, number> = {}; SHOTS.reduce((t, [n, l]) => { STARTS[n] = t; return t + l; }, 0);

function Screen({ f, keys, children, touches = [], fadeIn = 0 }: { f: number; keys: Cam[]; children: (k: number) => React.ReactNode; touches?: { x: number; y: number; at: number }[]; fadeIn?: number }) {
  const c = camAt(keys, f);
  const ts = touches.map(t => ({ x: t.x, y: t.y, a: interpolate(f, [t.at - 3, t.at, t.at + 5, t.at + 10], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }));
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 80% at 50% 45%, #111214 0%, #000 70%)', opacity: fadeIn ? interpolate(f, [0, fadeIn], [0, 1], { extrapolateRight: 'clamp' }) : 1 }}>
      <div style={{ position: 'absolute', left: 540 - c.fx * c.k, top: 960 - c.fy * c.k }}>
        <Device k={c.k} touches={ts}>{children(c.k)}</Device>
      </div>
    </AbsoluteFill>
  );
}

// a message you'd send a friend, in the opening's hand
function Said({ f, text, at, y }: { f: number; text: string; at: number; y: number }) {
  const a = interpolate(f, [at, at + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.6)) });
  return <div style={{ position: 'absolute', right: 60, top: y, padding: '28px 38px', borderRadius: 30, background: '#2E6BE6', color: '#fff', fontFamily: SANS, fontSize: 52,
    opacity: a, transform: `rotate(${-1.5 * a}deg) scale(${0.9 + 0.1 * a})`, transformOrigin: 'right center', boxShadow: '0 24px 50px rgba(0,0,0,0.55)' }}>{text}</div>;
}

export function Film3({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const r = REC[lang];
  const [name] = SHOTS.find(([n, l]) => frame >= STARTS[n] && frame < STARTS[n] + l) ?? SHOTS[SHOTS.length - 1];
  const f = frame - STARTS[name];
  const FULL = 1.95, MID = { fx: SCREEN.w / 2, fy: SCREEN.h / 2 };
  let view: React.ReactNode = null;
  switch (name) {
    case 'chaos': view = <Chaos f={f} lang={lang} />; break;
    case 'title': view = <Title f={f} len={96} lang={lang} lines={lang === 'zh'
      ? [<>意大利的每一次罢工，</>, <><B>一句话</B>问清楚</>]
      : [<>Any strike in Italy,</>, <>cleared up in <B>one</B> question.</>]} />; break;
    case 'ask': {
      // hold on the app, then the question typed at a person's pace, then sent
      const n = f < 30 ? 10 + f * 4 / 30 : f < 110 ? 14 + (f - 30) * (r.typed - 14) / 80 : r.typed + (f - 110) * (r.submit + 10 - r.typed) / 40;
      view = <Screen f={f} fadeIn={10} keys={[{ f: 0, ...MID, k: FULL }, { f: 26, ...MID, k: FULL }, { f: 70, fx: 201, fy: 790, k: 3.4 }, { f: 150, fx: 201, fy: 790, k: 3.6 }]} touches={[{ x: 362, y: 812, at: 128 }]}>
        {k => <Rec lang={lang} shot="ask" n={n} count={r.submit + 12} k={k} />}
      </Screen>;
      break;
    }
    case 'working': view = <Working f={f} len={78} lang={lang} />; break;
    case 'how': view = <How f={f} lang={lang} />; break;
    case 'answer': view = <Screen f={f} fadeIn={8} keys={[{ f: 0, ...MID, k: FULL }, { f: 30, ...MID, k: FULL }, { f: 70, fx: 201, fy: lang === 'zh' ? 410 : 340, k: 2.9 }, { f: 120, fx: 201, fy: lang === 'zh' ? 560 : 500, k: 2.7 }]}>
      {k => <Rec lang={lang} shot="ask" n={r.submit + f} count={lang === 'zh' ? 154 : 198} k={k} />}
    </Screen>; break;
    case 'day': view = <>
      <Screen f={f} keys={[{ f: 0, fx: 207, fy: 253, k: 3.6 }, { f: 14, fx: 207, fy: 262, k: 3.4 }, { f: 48, fx: 201, fy: 533, k: 2.8 }, { f: 92, fx: 201, fy: 600, k: 2.4 }, { f: 138, fx: 201, fy: 560, k: 2.1 }]} touches={[{ x: 207, y: 253, at: 6 }]}>
        {k => <Rec lang={lang} shot="day" n={4 + Math.min(f, 70) * 0.9} count={110} k={k} />}
      </Screen>
      <Said f={f} at={96} y={1240} text={lang === 'zh' ? '那我 3 点以后再出门' : 'ok. leaving after 3'} />
    </>; break;
    case 'italy': view = <Italy f={f} lang={lang} />; break;
    case 'payoff': {
      const a = interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
      view = <AbsoluteFill style={{ background: '#000' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 600, display: 'flex', justifyContent: 'center', opacity: a }}><LedMark f={f + 10} size={150} /></div>
        <div style={{ position: 'absolute', inset: 0, top: 220 }}>
          <Title clear f={f} len={120} lang={lang} delay={30} lines={lang === 'zh' ? [<>罢工，它替你盯着。</>, <>怎么走，你来定。</>] : [<>It keeps track of the strikes.</>, <>You make the plan.</>]} />
        </div>
      </AbsoluteFill>;
      break;
    }
    case 'logo': {
      const a = interpolate(f, [0, 12, 62, 80], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      view = <AbsoluteFill style={{ background: '#000', alignItems: 'center', justifyContent: 'center', opacity: a }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          <Img src={staticFile('app-icon.png')} style={{ width: 170, height: 170, borderRadius: 38 }} />
          <div style={{ fontFamily: SANS, color: INK }}>
            <div style={{ fontSize: 70, fontWeight: 600, letterSpacing: lang === 'zh' ? '0.05em' : '-0.01em' }}>{lang === 'zh' ? '意大利罢工查询' : 'Italy Strike Radar'}</div>
            <div style={{ fontSize: 34, marginTop: 8, color: 'rgba(236,232,223,0.5)' }}>{lang === 'zh' ? 'Italy Strike Radar' : '意大利罢工查询'}</div>
          </div>
        </div>
      </AbsoluteFill>;
      break;
    }
  }
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {view}
      <Audio src={staticFile(`audio/film3-${lang}.wav`)} />
    </AbsoluteFill>
  );
}
