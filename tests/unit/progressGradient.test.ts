// QC3-E: the sanctioned `progressGradient` token (the goal-ring / goals-bar
// VD-1 carve-out). Guards the exact stops and that both are a real two-stop
// (a flat fill would defeat "the ring is a star").
import { themedColors } from '../../theme/tokens';

describe('progressGradient token (QC3-E)', () => {
  it('light: lighter amber -> deeper ember', () => {
    expect(themedColors('light').progressGradient).toEqual(['#D8A658', '#C8913F']);
  });

  it('dark: lighter amber -> deeper amber', () => {
    expect(themedColors('dark').progressGradient).toEqual(['#E0B36A', '#D8A658']);
  });

  it('is amber→ember, never green (the ring is deliberately not forest/mint)', () => {
    for (const theme of ['light', 'dark'] as const) {
      const c = themedColors(theme);
      expect(c.progressGradient).not.toContain(c.forest);
      expect(c.progressGradient).not.toContain(c.mint);
      expect(c.progressGradient).not.toContain(c.accent);
    }
  });

  it('both stops differ so the sweep is a genuine gradient', () => {
    for (const theme of ['light', 'dark'] as const) {
      const [start, end] = themedColors(theme).progressGradient;
      expect(start).not.toBe(end);
    }
  });
});
