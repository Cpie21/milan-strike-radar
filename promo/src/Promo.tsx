import { AbsoluteFill, Audio, Series, staticFile } from 'remotion';
import { Hook, HOOK_FRAMES, type Lang } from './scenes/Hook';
import { Reveal, REVEAL_FRAMES } from './scenes/Reveal';
import { Cities, CITIES_FRAMES } from './scenes/Cities';
import { Rumor, RUMOR_FRAMES } from './scenes/Rumor';
import { Spray, SPRAY_FRAMES } from './scenes/Spray';
import { Widget, WIDGET_FRAMES } from './scenes/Widget';
import { Brand, BRAND_FRAMES } from './scenes/Brand';

export const SHOTS = [
  [Hook, HOOK_FRAMES], [Reveal, REVEAL_FRAMES], [Cities, CITIES_FRAMES], [Rumor, RUMOR_FRAMES],
  [Spray, SPRAY_FRAMES], [Widget, WIDGET_FRAMES], [Brand, BRAND_FRAMES],
] as const;
export const PROMO_FRAMES = SHOTS.reduce((n, [, f]) => n + f, 0);

export function Promo({ lang }: { lang: Lang }) {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* one cycle of the score, the same length as the picture: both loop */}
      <Audio src={staticFile('audio/score.wav')} />
      <Series>
        {SHOTS.map(([Shot, frames], i) => (
          <Series.Sequence key={i} durationInFrames={frames}>
            <Shot lang={lang} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
}
