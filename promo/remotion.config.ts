import { Config } from '@remotion/cli/config';

// Shaders need a real GPU path in the headless browser.
Config.setChromiumOpenGlRenderer('angle');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
