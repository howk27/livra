import {
  LEVEL_THRESHOLDS,
  getLevelForXP,
  getLevelProgress,
  checkLevelUp,
  getBorderStyle,
  LEVEL_UP_COPY,
} from '../../lib/xpEngine';

describe('LEVEL_THRESHOLDS', () => {
  it('has 10 entries', () => {
    expect(LEVEL_THRESHOLDS).toHaveLength(10);
  });
  it('first threshold is 0', () => {
    expect(LEVEL_THRESHOLDS[0]).toBe(0);
  });
  it('last threshold is 15000', () => {
    expect(LEVEL_THRESHOLDS[9]).toBe(15000);
  });
});

describe('getLevelForXP', () => {
  it('returns 1 at 0 XP', () => {
    expect(getLevelForXP(0)).toBe(1);
  });
  it('returns 1 just below level 2 threshold', () => {
    expect(getLevelForXP(199)).toBe(1);
  });
  it('returns 2 at exactly 200 XP', () => {
    expect(getLevelForXP(200)).toBe(2);
  });
  it('returns 5 at 2000 XP', () => {
    expect(getLevelForXP(2000)).toBe(5);
  });
  it('returns 10 at 15000 XP', () => {
    expect(getLevelForXP(15000)).toBe(10);
  });
  it('returns 10 (capped) beyond 15000', () => {
    expect(getLevelForXP(99999)).toBe(10);
  });
});

describe('getLevelProgress', () => {
  it('returns correct fields at level 1 with 100 XP', () => {
    const p = getLevelProgress(100);
    expect(p.currentLevel).toBe(1);
    expect(p.levelTitle).toBe('Beginner');
    expect(p.nextLevelTitle).toBe('Committed');
    expect(p.xpInCurrentLevel).toBe(100);
    expect(p.xpToNextLevel).toBe(200);
    expect(p.progressRatio).toBeCloseTo(100 / 200);
  });
  it('returns progressRatio 1.0 at level 10', () => {
    const p = getLevelProgress(15000);
    expect(p.currentLevel).toBe(10);
    expect(p.progressRatio).toBe(1.0);
    expect(p.nextLevelTitle).toBeNull();
    expect(p.xpToNextLevel).toBe(0);
  });
  it('handles mid-level correctly at level 3 (XP = 700)', () => {
    // Level 3 starts at 500, level 4 at 1000 → range 500
    const p = getLevelProgress(700);
    expect(p.currentLevel).toBe(3);
    expect(p.levelTitle).toBe('Consistent');
    expect(p.xpInCurrentLevel).toBe(200); // 700 - 500
    expect(p.xpToNextLevel).toBe(1000);
    expect(p.progressRatio).toBeCloseTo(200 / 500);
  });
});

describe('checkLevelUp', () => {
  it('returns null when no threshold crossed', () => {
    expect(checkLevelUp(0, 100)).toBeNull();
  });
  it('returns 2 when crossing from 0 to 200', () => {
    expect(checkLevelUp(0, 200)).toBe(2);
  });
  it('returns 2 when crossing from 100 to 250', () => {
    expect(checkLevelUp(100, 250)).toBe(2);
  });
  it('returns 5 when jumping from level 3 to level 5 in one award', () => {
    // Level 4 threshold = 1000, level 5 = 2000
    expect(checkLevelUp(600, 2100)).toBe(5);
  });
  it('returns null at level 10 (no higher level)', () => {
    expect(checkLevelUp(15000, 15200)).toBeNull();
  });
});

describe('getBorderStyle', () => {
  it('level 1 — thin ring, animated false', () => {
    const s = getBorderStyle(1);
    expect(s.borderWidth).toBe(1);
    expect(s.animated).toBe(false);
  });
  it('level 2 — same style as level 1', () => {
    const s = getBorderStyle(2);
    expect(s.borderWidth).toBe(1);
    expect(s.animated).toBe(false);
  });
  it('level 3 — slightly thicker', () => {
    const s = getBorderStyle(3);
    expect(s.borderWidth).toBe(2);
    expect(s.animated).toBe(false);
  });
  it('level 9 — gold color', () => {
    const s = getBorderStyle(9);
    expect(s.borderColor).toBe('#C9963A');
    expect(s.animated).toBe(false);
  });
  it('level 10 — animated', () => {
    const s = getBorderStyle(10);
    expect(s.animated).toBe(true);
  });
  it('level 5 — double ring', () => {
    const s = getBorderStyle(5);
    expect(s.borderWidth).toBe(2);
    expect(s.doubleRing).toBe(true);
    expect(s.animated).toBe(false);
  });
  it('level 7 — shadow elevation', () => {
    const s = getBorderStyle(7);
    expect(s.shadowElevation).toBe(6);
    expect(s.animated).toBe(false);
  });
});

describe('LEVEL_UP_COPY', () => {
  it('has entries for levels 2–10', () => {
    for (let level = 2; level <= 10; level++) {
      expect(LEVEL_UP_COPY[level]).toBeTruthy();
    }
  });
  it('level 10 copy ends with "forever"', () => {
    expect(LEVEL_UP_COPY[10]).toMatch(/forever/);
  });
});
