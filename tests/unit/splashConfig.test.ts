import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guard: the splash image is a transparent logo mark, not an opaque icon tile.
 *
 * Root-caused 2026-07-20 from a build-48 device report ("white screen with a
 * black square and the logo in the center" on first open). The splash was
 * configured with `./assets/Livra-Clean-Dark.png` — the SAME asset used as the
 * app icon and Android adaptive foreground, which is a white mark on a fully
 * opaque BLACK (#010101) square. With `resizeMode: contain` on a cream
 * background the system scales that black square to screen width and centers it,
 * so the whole splash reads as a black square floating on cream.
 *
 * Fix: the splash uses `Livra-Splash-Mark.png` (the mark keyed to a transparent
 * background) on the app's real linen background (#F0EDE8, matching
 * theme/tokens colorsLight.linen), so the mark floats on linen with no square
 * and no color step into the first screen. This locks the icon assets out of
 * the splash slot so the black-square bug can't regress.
 */
describe('expo-splash-screen config', () => {
  const config = JSON.parse(
    readFileSync(join(__dirname, '../../app.json'), 'utf8'),
  );
  const plugins: unknown[] = config.expo.plugins;
  const splash = plugins.find(
    (p): p is [string, Record<string, string>] =>
      Array.isArray(p) && p[0] === 'expo-splash-screen',
  ) as [string, Record<string, string>] | undefined;

  it('registers the expo-splash-screen plugin with options', () => {
    expect(splash).toBeDefined();
    expect(splash![1]).toBeDefined();
  });

  it('does not use an opaque icon asset as the splash image', () => {
    // The icon assets (Livra-Clean-Dark / -Light) are opaque squares; contain
    // mode paints their background, producing the reported square-on-cream bug.
    expect(splash![1].image).not.toMatch(/Livra-Clean-(Dark|Light)\.png$/);
  });

  it('uses the dedicated transparent splash mark', () => {
    expect(splash![1].image).toBe('./assets/Livra-Splash-Mark.png');
  });

  it('backgroundColor matches the app light linen (no step into first screen)', () => {
    expect(splash![1].backgroundColor?.toUpperCase()).toBe('#F0EDE8');
  });
});
