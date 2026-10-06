import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { Phone } from '../comp/Phone';
import { Stage, hex, mixRGB } from '../comp/Stage';
import { Caption, FONT } from '../comp/Caption';
import type { Lang } from './Hook';

// Twenty Italian cities, every mode: the phone turns while its screen swipes
// through the days (metro, then a plane, then Rome's general strike), and
// the light follows each mode's colour. Italian city names run past below.
export const CITIES_FRAMES = 41;
const CITY_NAMES = ['MILANO', 'ROMA', 'TORINO', 'FIRENZE', 'NAPOLI', 'BOLOGNA', 'VENEZIA', 'GENOVA', 'PALERMO', 'BARI', 'VERONA', 'PISA'];
export function Cities({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const t = (a: number, b: number) => interpolate(frame, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const offset = t(6, 15) + t(22, 31);
  const red = hex('#FF5147'), violet = hex('#B08CFF'), blue = hex('#5B93FF');
  const key = offset < 1 ? mixRGB(red, violet, offset) : mixRGB(violet, blue, offset - 1);
  const ry = interpolate(frame, [0, CITIES_FRAMES], [-8, 20], { easing: Easing.inOut(Easing.sin) });
  const rx = interpolate(frame, [0, CITIES_FRAMES], [7, 3]);
  const z = interpolate(frame, [0, CITIES_FRAMES], [-120, -40]);
  const tick = frame * 14;
  return (
    <AbsoluteFill style={{ background: '#000', perspective: 2400, overflow: 'hidden' }}>
      <Stage keyColor={key} keyPos={[0.05, 0.1]} drift={0.3 + frame / 120} />
      {/* the cities, huge and outlined, running past behind the phone */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 860, whiteSpace: 'nowrap', fontFamily: FONT.en, fontWeight: 800, fontSize: 210, letterSpacing: '0.04em',
        color: 'transparent', WebkitTextStroke: '3px rgba(255,255,255,0.34)', transform: `translateX(${-tick}px)` }}>
        {[...CITY_NAMES, ...CITY_NAMES].join('  ·  ')}
      </div>
      <Phone src={[`app/metro-${lang}.png`, `app/air-${lang}.png`, `app/rome-${lang}.png`]} screenOffset={offset} rx={rx} ry={ry} rz={-1 + frame * 0.05} z={z} y={150} x={20} />
      <Caption lang={lang} from={0} to={CITIES_FRAMES + 3} top={190} accent={`rgb(${key.map(v => Math.round(v * 255 * 0.85 + 38)).join(',')})`}
        lines={lang === 'zh' ? ['[20 个]意大利城市', '地铁 · 公交 · 火车 · 机场'] : ['[20 cities] across Italy', 'Metro · bus · train · airport']} />
    </AbsoluteFill>
  );
}
