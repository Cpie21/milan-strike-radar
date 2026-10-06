import { Composition } from 'remotion';
import { Film3, FILM3_FRAMES } from './v3/Film3';

const base = { fps: 30, width: 1080, height: 1920 };
export const Root = () => (
  <>
    <Composition id="Film3-zh" component={Film3} durationInFrames={FILM3_FRAMES} {...base} defaultProps={{ lang: 'zh' as const }} />
    <Composition id="Film3-en" component={Film3} durationInFrames={FILM3_FRAMES} {...base} defaultProps={{ lang: 'en' as const }} />
  </>
);
