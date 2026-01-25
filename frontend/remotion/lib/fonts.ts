import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';

// Load fonts with specific weights
const spaceGrotesk = loadSpaceGrotesk('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['latin'],
});

const dmSans = loadDMSans('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['latin'],
});

const jetBrainsMono = loadJetBrainsMono('normal', {
  weights: ['400', '500', '600'],
  subsets: ['latin'],
});

export const fonts = {
  heading: spaceGrotesk.fontFamily,
  body: dmSans.fontFamily,
  mono: jetBrainsMono.fontFamily,
} as const;

// Ensure fonts are loaded
export async function waitForFonts() {
  await Promise.all([
    spaceGrotesk.waitUntilDone(),
    dmSans.waitUntilDone(),
    jetBrainsMono.waitUntilDone(),
  ]);
}
