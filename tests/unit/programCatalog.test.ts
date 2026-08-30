import { PROGRAM_CATALOG, PROGRAM_BY_ID } from '@/lib/programs/catalog';
import { PROGRAM_DOMAINS } from '@/lib/programs/types';
import { MARK_LIBRARY_BY_ID } from '@/lib/suggestedCounters';

// Structural guard for every program card (spec §3). A card that fails here is
// unshippable content, caught at the gate instead of on a device.

describe('program catalog structure', () => {
  it('ships at least the first two cards', () => {
    expect(PROGRAM_CATALOG.length).toBeGreaterThanOrEqual(2);
    expect(PROGRAM_CATALOG.map((p) => p.id)).toEqual(
      expect.arrayContaining(['sleep-reset', 'deep-work-month']),
    );
  });

  it('ids are unique and kebab-case, and PROGRAM_BY_ID mirrors the list', () => {
    const ids = PROGRAM_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(Object.keys(PROGRAM_BY_ID).sort()).toEqual([...ids].sort());
  });

  it.each(PROGRAM_CATALOG.map((p) => [p.id, p] as const))(
    '%s is structurally valid',
    (_id, p) => {
      expect(PROGRAM_DOMAINS).toContain(p.domain);
      expect(p.durationWeeks).toBeGreaterThanOrEqual(3);
      expect(p.durationWeeks).toBeLessThanOrEqual(8);
      expect(p.stages).toHaveLength(p.durationWeeks);
      expect(p.title.trim().length).toBeGreaterThan(0);
      expect(p.tagline.trim().length).toBeGreaterThan(0);
      expect(p.whyItWorks.trim().length).toBeGreaterThan(0);

      for (const stage of p.stages) {
        expect(stage.name.trim().length).toBeGreaterThan(0);
        expect(stage.marks.length).toBeGreaterThan(0);
        expect(stage.bar.daysRequired).toBeGreaterThanOrEqual(1);
        expect(stage.bar.daysRequired).toBeLessThanOrEqual(7);
        if (stage.easedScale !== undefined) {
          expect(stage.easedScale).toBeGreaterThan(0);
          expect(stage.easedScale).toBeLessThanOrEqual(1);
        }
        for (const key of ['intro', 'held', 'partial', 'quiet', 'advance'] as const) {
          expect(stage.copy[key].trim().length).toBeGreaterThan(0);
        }
        for (const m of stage.marks) {
          const lib = MARK_LIBRARY_BY_ID[m.libraryId];
          expect(lib).toBeDefined();
          expect(m.weeklyTarget).toBeGreaterThanOrEqual(1);
          expect(m.weeklyTarget).toBeLessThanOrEqual(7);
          // Fixed/abstinence marks: the target is the library's recommended,
          // full stop. The 2026-08-04 backfill bug (an AI override shipping
          // weekly_target 5 on a fixed 7/7/7 mark) is the precedent. The BAR
          // carries stage progression for these.
          if (lib.frequencyKind !== 'variable') {
            expect(m.weeklyTarget).toBe(lib.frequency_recommended);
          }
          if (m.dailyTarget !== undefined) {
            expect(m.dailyTarget).toBeGreaterThanOrEqual(1);
          }
        }
      }
    },
  );

  it('a stage never lists the same library id twice', () => {
    for (const p of PROGRAM_CATALOG) {
      for (const stage of p.stages) {
        const ids = stage.marks.map((m) => m.libraryId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});
