import { Composition } from 'remotion';
import { Film, FILM_FRAMES } from './v2/Film';

const base = { fps: 30, width: 1080, height: 1920 };
export const Root = () => (
  <>
    <Composition id="Film-zh" component={Film} durationInFrames={FILM_FRAMES} {...base} defaultProps={{ lang: 'zh' as const }} />
    <Composition id="Film-en" component={Film} durationInFrames={FILM_FRAMES} {...base} defaultProps={{ lang: 'en' as const }} />
  </>
);
