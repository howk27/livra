// PL-4 wiring guard (source-order assertions, deadRouteGuard pattern):
// the increment path consults the voice engine ONLY after a successful persist,
// stamps voice_line_shown on mark_logged, and the surfaces mount VoiceLine.
// Behavior of each seam is covered in postLogVoice.test.ts / voiceSlice.test.ts /
// voiceLine.test.tsx; this file guards the glue between them.
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('post-log voice wiring (hooks/useCounters.ts)', () => {
  const src = read('hooks/useCounters.ts');

  it('evaluates the voice engine after the event persists and before capture', () => {
    const persistIdx = src.indexOf('await addEvent(');
    const voiceIdx = src.indexOf('maybeShowPostLogVoice(');
    const captureIdx = src.indexOf('capture(ANALYTICS_EVENTS.MARK_LOGGED');
    expect(persistIdx).toBeGreaterThan(-1);
    expect(voiceIdx).toBeGreaterThan(persistIdx);
    expect(captureIdx).toBeGreaterThan(voiceIdx);
  });

  it('stamps voice_line_shown on the mark_logged event (both ways via the boolean)', () => {
    const captureIdx = src.indexOf('capture(ANALYTICS_EVENTS.MARK_LOGGED');
    const captureBlock = src.slice(captureIdx, captureIdx + 400);
    expect(captureBlock).toContain('voice_line_shown: voiceLineShown');
  });

  it('a failed increment never speaks: the voice call sits inside the persist try, before the catch', () => {
    const voiceIdx = src.indexOf('maybeShowPostLogVoice(');
    const persistCatchIdx = src.indexOf('Persist failed — reverting counter row');
    expect(persistCatchIdx).toBeGreaterThan(-1);
    expect(voiceIdx).toBeLessThan(persistCatchIdx);
  });
});

describe('VoiceLine surface mounts', () => {
  it('Focus mounts the voice line overlay', () => {
    expect(read('app/(tabs)/focus.tsx')).toContain('<VoiceLine');
  });

  it('goal detail mounts the voice line overlay (shared increment path, VD-4 rows)', () => {
    expect(read('app/goal/[id].tsx')).toContain('<VoiceLine');
  });
});
