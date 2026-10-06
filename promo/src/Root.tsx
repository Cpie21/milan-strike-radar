import { Composition } from 'remotion';
import { Film4, FILM4_FRAMES } from './v4/Film4';

const base = { fps: 30, width: 1080, height: 1920 };
export const Root = () => (
  <>
    <Composition id="Film4-zh" component={Film4} durationInFrames={FILM4_FRAMES} {...base} defaultProps={{ lang: 'zh' as const }} />
    <Composition id="Film4-en" component={Film4} durationInFrames={FILM4_FRAMES} {...base} defaultProps={{ lang: 'en' as const }} />
  </>
);
