import { Composition } from 'remotion';
import { Hook, HOOK_FRAMES } from './scenes/Hook';
import { Promo, PROMO_FRAMES } from './Promo';

const base = { fps: 30, width: 1080, height: 1920 };
export const Root = () => (
  <>
    <Composition id="Promo-zh" component={Promo} durationInFrames={PROMO_FRAMES} {...base} defaultProps={{ lang: 'zh' as const }} />
    <Composition id="Promo-en" component={Promo} durationInFrames={PROMO_FRAMES} {...base} defaultProps={{ lang: 'en' as const }} />
    <Composition id="Hook-zh" component={Hook} durationInFrames={HOOK_FRAMES} {...base} defaultProps={{ lang: 'zh' as const }} />
    <Composition id="Hook-en" component={Hook} durationInFrames={HOOK_FRAMES} {...base} defaultProps={{ lang: 'en' as const }} />
  </>
);
