import { Composition } from 'remotion';
import { Hook } from './scenes/Hook';

export const Root = () => (
  <>
    <Composition id="Hook-zh" component={Hook} durationInFrames={48} fps={30} width={1080} height={1920} defaultProps={{ lang: 'zh' as const }} />
    <Composition id="Hook-en" component={Hook} durationInFrames={48} fps={30} width={1080} height={1920} defaultProps={{ lang: 'en' as const }} />
  </>
);
