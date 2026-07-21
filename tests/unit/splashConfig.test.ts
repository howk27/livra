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
type SplashOptions = {
  image?: string;
  resizeMode?: string;
  backgroundColor?: string;
  dark?: { image?: string; resizeMode?: string; backgroundColor?: string };
};

describe('expo-splash-screen config', () => {
  const config = JSON.parse(
    readFileSync(join(__dirname, '../../app.json'), 'utf8'),
  );
  const plugins: unknown[] = config.expo.plugins;
  const splash = plugins.find(
    (p): p is [string, SplashOptions] =>
      Array.isArray(p) && p[0] === 'expo-splash-screen',
  ) as [string, SplashOptions] | undefined;

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

  /**
   * Guard: the splash follows the system theme.
   *
   * `userInterfaceStyle` is "automatic", so a dark-mode user opening the app got
   * the LIGHT splash — a #121212 mark on #F0EDE8 linen — flashing before a dark
   * first screen (founder report, 2026-07-21). The dark variant re-tones the same
   * silhouette to colorsDark.inkDark on colorsDark.linen; regenerate it with
   * `node scripts/generate-splash-mark-dark.js`.
   */
  describe('dark variant', () => {
    it('declares a dark splash', () => {
      expect(splash![1].dark).toBeDefined();
    });

    it('uses the dedicated dark splash mark, not an icon asset', () => {
      expect(splash![1].dark!.image).toBe('./assets/Livra-Splash-Mark-Dark.png');
      expect(splash![1].dark!.image).not.toMatch(/Livra-Clean-(Dark|Light)\.png$/);
    });

    it('does not reuse the light mark (invisible on a dark background)', () => {
      expect(splash![1].dark!.image).not.toBe(splash![1].image);
    });

    it('backgroundColor matches colorsDark.linen', () => {
      expect(splash![1].dark!.backgroundColor?.toUpperCase()).toBe('#15211D');
    });

    it('keeps resizeMode contain, matching the light variant', () => {
      expect(splash![1].dark!.resizeMode).toBe(splash![1].resizeMode);
    });
  });

  /**
   * The config can name the right file and still ship the wrong PIXELS — that is
   * exactly how both the black-square splash and the half-rendered widget icons
   * reached a device. Each mark must actually contrast against the background it
   * is painted on, and must be a transparent mark rather than an opaque tile.
   */
  describe('mark assets contrast against their backgrounds', () => {
    /** Mean luminance of the visible (non-transparent) pixels, 0..255. */
    const inspect = (file: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PNG } = require('pngjs');
      const png = PNG.sync.read(
        readFileSync(join(__dirname, '../../assets', file)),
      );
      const data: Buffer = png.data;
      let sum = 0;
      let visible = 0;
      let opaqueCorners = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 8) continue;
        visible++;
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }
      const corner = (x: number, y: number) =>
        data[(y * png.width + x) * 4 + 3];
      for (const [x, y] of [
        [0, 0],
        [png.width - 1, 0],
        [0, png.height - 1],
        [png.width - 1, png.height - 1],
      ]) {
        if (corner(x, y) > 250) opaqueCorners++;
      }
      return { luminance: visible ? sum / visible : 0, visible, opaqueCorners };
    };

    it('light mark is dark-toned and transparent-cornered', () => {
      const { luminance, visible, opaqueCorners } = inspect(
        'Livra-Splash-Mark.png',
      );
      expect(visible).toBeGreaterThan(0);
      expect(opaqueCorners).toBe(0); // an opaque tile is the black-square bug
      expect(luminance).toBeLessThan(64); // reads on linen
    });

    it('dark mark is light-toned and transparent-cornered', () => {
      const { luminance, visible, opaqueCorners } = inspect(
        'Livra-Splash-Mark-Dark.png',
      );
      expect(visible).toBeGreaterThan(0);
      expect(opaqueCorners).toBe(0);
      expect(luminance).toBeGreaterThan(192); // reads on #15211D
    });
  });
});
