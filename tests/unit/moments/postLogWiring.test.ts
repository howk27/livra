// PL-4 wiring guard (source-order assertions, deadRouteGuard pattern):
// the increment path consults the voice engine ONLY after a successful persist,
// stamps voice_line_shown on mark_logged, and the surfaces mount VoiceLine.
// Behavior of each seam is covered in postLogVoice.test.ts / voiceSlice.test.ts /
// voiceLine.test.tsx; this file guards the glue between them.
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('post-log voice wiring (hooks/useCheckin.ts)', () => {
  // M9 Phase 5A Task 6: the increment path IS useCheckin (useCounters deleted).
  const src = read('hooks/useCheckin.ts');

  it('evaluates the voice engine after the check-in persists and before capture', () => {
    const persistIdx = src.indexOf('await logMutation.mutateAsync(');
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

  it('a failed check-in never speaks: the effects run after the awaited mutation', () => {
    // The voice call lives inside runAfterInteractions, which is only reached
    // once `await logMutation.mutateAsync(...)` has resolved — a rejected log
    // throws to the caller before any effect is scheduled.
    const persistIdx = src.indexOf('await logMutation.mutateAsync(');
    const effectsIdx = src.indexOf('InteractionManager.runAfterInteractions(');
    const voiceIdx = src.indexOf('maybeShowPostLogVoice(');
    expect(effectsIdx).toBeGreaterThan(persistIdx);
    expect(voiceIdx).toBeGreaterThan(effectsIdx);
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
