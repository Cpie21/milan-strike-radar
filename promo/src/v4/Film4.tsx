import { AbsoluteFill, Audio, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { Device, SCREEN } from '../v2/Device';
import { Rec } from '../v2/Rec';
import { Title, B } from '../v3/Title';
import { Italy } from '../v3/Italy';
import { AMBER, INK, SANS, type Lang } from '../v3/type';
import { Board } from './Board';
import { Chaos4 } from './Chaos4';
import { Sources4 } from './Sources4';
import { b, FILM4_FRAMES, lin, ramp, SECTIONS, snap, springy, START } from './beat';
import RECTS from '../rects.json';

export { FILM4_FRAMES };
const REC = { zh: { submit: 64, typed: 54, q: 19 }, en: { submit: 108, typed: 96, q: 41 } };
type Rect = [number, number, number, number];

// The phone, filmed: camera (fx, fy in screen points, k px per point), a
// fly-in offset, and a focus: everything but `focus` falls out of focus and
// darkens, the focused part stays sharp with an amber edge that pulses.
function Phone({ cam, children, focus, fa = 0, pulse = 0, off = [0, 0], rot = 0, touches = [] }: {
  cam: { fx: number; fy: number; k: number }; children: (k: number) => React.ReactNode; focus?: Rect; fa?: number; pulse?: number; off?: [number, number]; rot?: number; touches?: { x: number; y: number; a: number }[];
}) {
  const { fx, fy, k } = cam;
  const [x, y, w, h] = focus ?? [0, 0, 0, 0], r = Math.min(h / 2, 30);
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(110% 70% at 50% 50%, #131417 0%, #000 72%)' }}>
      <div style={{ position: 'absolute', left: 540 - fx * k + off[0], top: 960 - fy * k + off[1], transform: `rotate(${rot}deg)`, transformOrigin: `${fx * k}px ${fy * k}px` }}>
        <Device k={k} touches={touches}>
          <div style={{ position: 'absolute', inset: 0, filter: fa ? `blur(${5 * fa}px) brightness(${1 - 0.6 * fa}) saturate(${1 - 0.4 * fa})` : undefined }}>{children(k)}</div>
          {fa > 0 && focus && <>
            <div style={{ position: 'absolute', inset: 0, clipPath: `inset(${y * k}px ${(SCREEN.w - x - w) * k}px ${(SCREEN.h - y - h) * k}px ${x * k}px round ${r * k}px)` }}>{children(k)}</div>
            <div style={{ position: 'absolute', left: x * k, top: y * k, width: w * k, height: h * k, borderRadius: r * k, opacity: fa,
              boxShadow: `0 0 0 ${2 + 2 * pulse}px rgba(255,177,74,${0.55 + 0.4 * pulse}), 0 0 ${30 + 50 * pulse}px rgba(255,150,30,${0.35 + 0.35 * pulse})` }} />
          </>}
        </Device>
      </div>
    </AbsoluteFill>
  );
}
const tap = (f: number, at: number) => interpolate(f, [at - 2, at, at + 5, at + 9], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
// camera moves between keys with a whip ease
function keys(f: number, ks: [number, number, number, number][]) {
  if (f <= ks[0][0]) return { fx: ks[0][1], fy: ks[0][2], k: ks[0][3] };
  for (let i = 0; i < ks.length - 1; i++) {
    const [fa, xa, ya, ka] = ks[i], [fb, xb, yb, kb] = ks[i + 1];
    if (f <= fb) { const t = snap(Math.min(1, Math.max(0, (f - fa) / (fb - fa)))); return { fx: xa + (xb - xa) * t, fy: ya + (yb - ya) * t, k: Math.exp(Math.log(ka) + (Math.log(kb) - Math.log(ka)) * t) }; }
  }
  const z = ks[ks.length - 1]; return { fx: z[1], fy: z[2], k: z[3] };
}
const LOWER = { fx: 201, fy: 736, k: 2.5 }; // the lower half of the page, full width

function Scene({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const r = REC[lang], R = (RECTS as unknown as Record<string, Record<string, Rect>>)[lang];
  const [name] = SECTIONS.find(([n, beats]) => frame >= START[n] && frame < START[n] + b(beats)) ?? SECTIONS[SECTIONS.length - 1];
  const f = frame - START[name];
  switch (name) {
    case 'chaos': return <Chaos4 f={f} lang={lang} />;
    case 'title': return <Title f={f} len={b(4)} lang={lang} delay={b(1.5)} lines={lang === 'zh'
      ? [<>意大利的每一次罢工，</>, <><B>一句话</B>问清楚</>] : [<>Any strike in Italy,</>, <>cleared up in <B>one</B> question.</>]} />;
    case 'ask': {
      // the phone arrives from below, already framed on the lower half; the
      // field is the only thing in focus while you type; send on the beat
      const fly = ramp(f, 0, 12, Easing.out(Easing.cubic));
      const T0 = 14, T1 = 92, SEND = 98;
      const n = f < T0 ? 10 + f * 4 / T0 : f < T1 ? 14 + (f - T0) * (r.typed - 14) / (T1 - T0) : Math.min(r.submit - 1, r.typed + (f - T1) * (r.submit - 1 - r.typed) / (SEND + 2 - T1)); // the sheet appears on the submit frame
      const chars = Array.from({ length: r.q }, (_, i) => T0 + (2 * i) * (T1 - T0) / (r.typed - 14));
      const pulse = chars.reduce((m, c) => Math.max(m, f >= c ? Math.exp(-(f - c) / 3) : 0), 0);
      const [x, y, w, h] = R.form;
      return <Phone cam={{ ...LOWER, k: LOWER.k + 0.06 * lin(f, 12, 110) }} off={[0, (1 - fly) * 1500]} rot={(1 - fly) * -7}
        focus={[x - 6, y - 6, w + 12, h + 12]} fa={lin(f, 10, 18)} pulse={pulse} touches={[{ x: 362, y: 812, a: tap(f, SEND) }]}>
        {k => <Rec lang={lang} shot="ask" n={n} count={r.submit + 12} k={k} />}
      </Phone>;
    }
    case 'dive': {
      // into the little face beside the field, until its dots are the screen
      const t = ramp(f, 0, b(2), Easing.in(Easing.cubic));
      const cam = { fx: LOWER.fx + (44 - LOWER.fx) * ramp(f, 0, 12), fy: LOWER.fy + (812 - LOWER.fy) * ramp(f, 0, 12), k: LOWER.k * Math.exp(Math.log(90 / LOWER.k) * t) };
      const into = lin(f, 16, 28);
      return <>
        <Phone cam={cam}>{k => <Rec lang={lang} shot="ask" n={r.submit - 1} count={r.submit + 12} k={k} />}</Phone>
        <AbsoluteFill style={{ opacity: into }}><Sources4 f={0} lang={lang} /></AbsoluteFill>
        <AbsoluteFill style={{ background: AMBER, mixBlendMode: 'screen', opacity: interpolate(f, [18, 26, 30], [0, 0.45, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }} />
      </>;
    }
    case 'sources': return <Sources4 f={f} lang={lang} />;
    case 'answer': {
      // the sheet rises with the answer: punch in on the verdict, whip to the hours
      const cam = keys(f, [[0, 201, 640, 2.45], [22, 201, 640, 2.45], [28, 201, 404, 2.95], [50, 201, 404, 2.95], [56, 201, 618, 2.95]]);
      const onV = lin(f, 26, 32) * (1 - lin(f, 48, 52)), onH = lin(f, 54, 60);
      return <Phone cam={cam} off={[0, (1 - ramp(f, 0, 8, Easing.out(Easing.cubic))) * -1500]}
        focus={onH > 0 ? [30, 575, 342, 92] : [20, 339, 362, 129]} fa={Math.max(onV, onH)} pulse={Math.max(interpolate(f, [28, 36], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), interpolate(f, [56, 64], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))}>
        {k => <Rec lang={lang} shot="ask" n={r.submit + 2 + f} count={lang === 'zh' ? 154 : 198} k={k} />}
      </Phone>;
    }
    case 'day': {
      // tap Friday, whip down to its card; then what you decide
      const [rx, ry, rw, rh] = R.rail9;
      const cam = keys(f, [[0, rx + rw / 2, ry + rh / 2, 3.0], [16, rx + rw / 2, ry + rh / 2, 3.0], [24, 201, 600, 2.45]]);
      const said = ramp(f, b(3), b(3) + 7, springy);
      return <>
        <Phone cam={cam} focus={[28, 492, 346, 232]} fa={lin(f, 26, 34) * 0.85} touches={[{ x: rx + rw / 2, y: ry + rh / 2, a: tap(f, 6) }]}>
          {k => <Rec lang={lang} shot="day" n={4 + Math.min(f, 42)} count={110} k={k} />}
        </Phone>
        <div style={{ position: 'absolute', right: 150, top: 1250, padding: '30px 42px', borderRadius: 34, background: '#2E6BE6', color: '#fff', fontFamily: SANS, fontSize: 54, fontWeight: 500,
          opacity: Math.min(1, said * 2), transform: `scale(${0.5 + 0.5 * said}) rotate(${-2 * said}deg)`, transformOrigin: 'right center', boxShadow: '0 30px 60px rgba(0,0,0,0.6)', whiteSpace: 'nowrap' }}>
          {lang === 'zh' ? '那我 3 点以后再出门' : 'ok. leaving after 3'}
        </div>
      </>;
    }
    case 'italy': return <Italy f={f} lang={lang} start={10} step={3.75} len={b(8)} />;
    case 'payoff': {
      const blink = f % 45 > 41 ? 0.15 : 1;
      return <AbsoluteFill style={{ background: '#000' }}>
        <div style={{ position: 'absolute', left: 510 - 300, top: 300, transform: `translateY(${(1 - ramp(f, 0, 10, Easing.out(Easing.back(1.4)))) * -500}px)` }}>
          <Board show={{ kind: 'eyes', open: blink, gx: Math.sin(f * 0.06) * 0.3 }} width={600} swing={Math.sin(f * 0.09) * 1.2} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 60, top: 760, height: 520 }}>
          <Title clear f={f} len={b(6)} lang={lang} delay={b(2)} lines={lang === 'zh' ? [<>罢工，它替你盯着。</>, <>怎么走，你来定。</>] : [<>It keeps track of the strikes.</>, <>You make the plan.</>]} />
        </div>
      </AbsoluteFill>;
    }
    case 'logo': {
      const p = ramp(f, 0, 8, springy), a = 1 - lin(f, b(4) - 12, b(4) - 2);
      return <AbsoluteFill style={{ background: '#000', alignItems: 'center', justifyContent: 'center', opacity: a }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, transform: `scale(${0.85 + 0.15 * p})`, opacity: Math.min(1, p * 1.5), marginRight: 60 }}>
          <Img src={staticFile('app-icon.png')} style={{ width: 170, height: 170, borderRadius: 38 }} />
          <div style={{ fontFamily: SANS, color: INK }}>
            <div style={{ fontSize: 70, fontWeight: 600, letterSpacing: lang === 'zh' ? '0.05em' : '-0.01em' }}>{lang === 'zh' ? '意大利罢工查询' : 'Italy Strike Radar'}</div>
            <div style={{ fontSize: 34, marginTop: 8, color: 'rgba(236,232,223,0.5)' }}>{lang === 'zh' ? 'Italy Strike Radar' : '意大利罢工查询'}</div>
          </div>
        </div>
      </AbsoluteFill>;
    }
  }
  return null;
}

// fast moves get real motion blur (Remotion's CameraMotionBlur); still ones don't pay for it
const BLUR: [string, number, number][] = [['chaos', b(6.5) - 2, b(7.5) + 4], ['ask', 0, 14], ['dive', 0, b(2)], ['sources', 0, 16], ['sources', b(7.3), b(8)], ['answer', 0, 10], ['answer', 20, 30], ['answer', 48, 58], ['day', 14, 28]];
export function Film4({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const moving = BLUR.some(([n, a, z]) => frame >= START[n] + a && frame < START[n] + z);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <CameraMotionBlur samples={moving ? 10 : 1} shutterAngle={moving ? 220 : 1}><Scene lang={lang} /></CameraMotionBlur>
      <Audio src={staticFile(`audio/film4-${lang}.wav`)} />
    </AbsoluteFill>
  );
}
