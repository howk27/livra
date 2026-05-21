import {
  getDailyHeader,
  getWeekArc,
  getPostLogMessage,
  getWeekSentimentHeader,
  type HeaderState,
  type WeekArcState,
  type PostLogState,
} from '../../lib/copy';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeDate(hour: number, dow: number): Date {
  // Create a date with the given hour and day-of-week (0=Sun).
  // We fix an arbitrary Monday and offset from there.
  const base = new Date('2025-01-06T00:00:00'); // a Monday
  const dayOffset = (dow + 6) % 7; // 0=Mon…6=Sun in base-week terms — shift so Mon=0
  // dow=1(Mon)→offset=0, dow=2(Tue)→1, dow=0(Sun)→6
  const d = new Date(base);
  d.setDate(base.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function baseHeader(overrides: Partial<HeaderState> = {}): HeaderState {
  return {
    completedToday: 0,
    totalMarks: 3,
    streakDays: 0,
    now: makeDate(10, 3), // Wednesday 10 am, no streak
    daysSinceLastLog: 0,
    ...overrides,
  };
}

// ─── getDailyHeader ──────────────────────────────────────────────────────────

describe('getDailyHeader', () => {
  test('all done — 30-day streak → Thirty days', () => {
    const h = getDailyHeader(baseHeader({ completedToday: 3, streakDays: 30 }));
    expect(h.title).toBe('Thirty days.');
    expect(h.subtitle).toBe('This is rare.');
  });

  test('all done — 7-day streak → One week', () => {
    const h = getDailyHeader(baseHeader({ completedToday: 3, streakDays: 7 }));
    expect(h.title).toBe('One week.');
    expect(h.subtitle).toBe('Most people stopped by now.');
  });

  test('all done — no milestone streak → Done', () => {
    const h = getDailyHeader(baseHeader({ completedToday: 3, streakDays: 2 }));
    expect(h.title).toBe('Done.');
    expect(h.subtitle).toBe('Come back tomorrow.');
  });

  test('returning after 3+ day gap → You\'re back', () => {
    const h = getDailyHeader(baseHeader({ daysSinceLastLog: 4 }));
    expect(h.title).toBe("You're back.");
  });

  test('Monday morning nothing logged → New week', () => {
    const h = getDailyHeader(baseHeader({ now: makeDate(9, 1) }));
    expect(h.title).toBe('New week.');
  });

  test('Sunday 9 pm nothing logged → Don\'t let Sunday slip', () => {
    const h = getDailyHeader(baseHeader({ now: makeDate(21, 0) }));
    expect(h.title).toBe("Don't let Sunday slip.");
  });

  test('Sunday 7 pm nothing logged — no streak override → Still time (not sunday override)', () => {
    // 7pm is hour 19 — not >= 20, so Sunday override doesn't fire; streak check fires if streak >=5
    const h = getDailyHeader(baseHeader({ now: makeDate(19, 0), streakDays: 6 }));
    expect(h.title).toBe('Still tonight.');
  });

  test('evening, nothing logged, streak 5+ → Still tonight', () => {
    const h = getDailyHeader(baseHeader({ now: makeDate(20, 3), streakDays: 5 }));
    expect(h.title).toBe('Still tonight.');
  });

  test('evening, nothing logged, streak < 5 → Still time (falls to afternoon branch)', () => {
    const h = getDailyHeader(baseHeader({ now: makeDate(20, 3), streakDays: 2 }));
    // hour >= 19, streakDays < 5, noneLogged → falls past evening streak check
    // hour >= 19, so NOT < 19 → default fallback
    expect(h.title).toBe('Daily Momentum');
  });

  test('2 of 3 logged → Almost there', () => {
    const h = getDailyHeader(baseHeader({ completedToday: 2 }));
    expect(h.title).toBe('Almost there.');
  });

  test('1 of 3 logged → One down', () => {
    const h = getDailyHeader(baseHeader({ completedToday: 1 }));
    expect(h.title).toBe('One down.');
  });

  test('morning, no logs, streak active → Day N', () => {
    const h = getDailyHeader(baseHeader({ now: makeDate(8, 3), streakDays: 5 }));
    expect(h.title).toBe('Day 5.');
    expect(h.subtitle).toBe('You showed up yesterday. Do it again.');
  });

  test('morning, no logs, no streak → Day\'s wide open', () => {
    const h = getDailyHeader(baseHeader({ now: makeDate(8, 3), streakDays: 0 }));
    expect(h.title).toBe("Day's wide open.");
  });

  test('afternoon, nothing logged → Still time', () => {
    const h = getDailyHeader(baseHeader({ now: makeDate(14, 3) }));
    expect(h.title).toBe('Still time.');
  });

  test('default fallback with partial marks', () => {
    const h = getDailyHeader(
      baseHeader({ now: makeDate(21, 3), completedToday: 1, totalMarks: 3, streakDays: 1 }),
    );
    expect(h.title).toBe('One down.');
  });

  test('30-day streak beats 7-day streak when all done', () => {
    const h30 = getDailyHeader(baseHeader({ completedToday: 3, streakDays: 30 }));
    const h7 = getDailyHeader(baseHeader({ completedToday: 3, streakDays: 7 }));
    expect(h30.title).toBe('Thirty days.');
    expect(h7.title).toBe('One week.');
  });
});

// ─── getWeekArc ───────────────────────────────────────────────────────────────

function baseWeekArc(overrides: Partial<WeekArcState> = {}): WeekArcState {
  return {
    now: makeDate(10, 3), // Wednesday 10 am
    weekLoggedDays: 2,
    isPerfectWeekSoFar: false,
    ...overrides,
  };
}

describe('getWeekArc', () => {
  test('perfect week so far from Tuesday on → override fires', () => {
    const s = getWeekArc(baseWeekArc({ now: makeDate(10, 2), isPerfectWeekSoFar: true, weekLoggedDays: 2 }));
    expect(s).toBe("Perfect week so far. Don't stop.");
  });

  test('perfect week on Monday → no override (first day, dayIndex=0)', () => {
    const s = getWeekArc(baseWeekArc({ now: makeDate(10, 1), isPerfectWeekSoFar: true, weekLoggedDays: 1 }));
    expect(s).toBe('Week begins.');
  });

  test('Sunday 6/7 logged → One more. Best week ever.', () => {
    const s = getWeekArc(baseWeekArc({ now: makeDate(10, 0), weekLoggedDays: 6 }));
    expect(s).toBe('One more. Best week ever.');
  });

  test('Thursday 0 logged → The week isn\'t over.', () => {
    const s = getWeekArc(baseWeekArc({ now: makeDate(10, 4), weekLoggedDays: 0 }));
    expect(s).toBe("The week isn't over.");
  });

  test('Wednesday 0 logged → no override (dayIndex=2 < 3)', () => {
    const s = getWeekArc(baseWeekArc({ now: makeDate(10, 3), weekLoggedDays: 0 }));
    expect(s).toBe('Halfway.');
  });

  test('Monday → Week begins.', () => {
    expect(getWeekArc(baseWeekArc({ now: makeDate(9, 1) }))).toBe('Week begins.');
  });
  test('Tuesday → Day 2 of 7.', () => {
    expect(getWeekArc(baseWeekArc({ now: makeDate(9, 2) }))).toBe('Day 2 of 7.');
  });
  test('Wednesday → Halfway.', () => {
    expect(getWeekArc(baseWeekArc({ now: makeDate(9, 3) }))).toBe('Halfway.');
  });
  test('Thursday → Keep it going.', () => {
    expect(getWeekArc(baseWeekArc({ now: makeDate(9, 4), weekLoggedDays: 2 }))).toBe('Keep it going.');
  });
  test('Friday → Weekend incoming — the real test.', () => {
    expect(getWeekArc(baseWeekArc({ now: makeDate(9, 5) }))).toBe('Weekend incoming — the real test.');
  });
  test('Saturday → The weekend test.', () => {
    expect(getWeekArc(baseWeekArc({ now: makeDate(9, 6) }))).toBe('The weekend test.');
  });
  test('Sunday before 6pm → One day left.', () => {
    expect(getWeekArc(baseWeekArc({ now: makeDate(15, 0) }))).toBe('One day left.');
  });
  test('Sunday after 6pm → Final call.', () => {
    expect(getWeekArc(baseWeekArc({ now: makeDate(19, 0) }))).toBe('Final call.');
  });
});

// ─── getPostLogMessage ────────────────────────────────────────────────────────

function basePostLog(overrides: Partial<PostLogState> = {}): PostLogState {
  return {
    streakDays: 0,
    isReturning: false,
    isCompleting3of3: false,
    isNearMiss: false,
    ...overrides,
  };
}

describe('getPostLogMessage', () => {
  test('returns a non-empty string', () => {
    const msg = getPostLogMessage(basePostLog());
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  test('does not repeat the last shown message (when alternatives exist)', () => {
    const last = "Quiet consistency. That's the whole game.";
    // Run 20 times — with 10+ default messages it should never repeat
    for (let i = 0; i < 20; i++) {
      const msg = getPostLogMessage(basePostLog({ lastShownPostLogMessage: last }));
      expect(msg).not.toBe(last);
    }
  });

  test('resolves {streak} template — never returns the raw placeholder', () => {
    for (let i = 0; i < 200; i++) {
      const msg = getPostLogMessage(basePostLog({ streakDays: 12 }));
      expect(msg).not.toContain('{streak}');
    }
  });

  test('resolves {streak} template — dynamic message appears in large sample', () => {
    const results = new Set<string>();
    for (let i = 0; i < 300; i++) {
      results.add(getPostLogMessage(basePostLog({ streakDays: 12 })));
    }
    // "Day 12. Still here." must appear at least once across 300 draws
    expect([...results].some((r) => r.includes('12'))).toBe(true);
  });

  test('completing_3of3 messages appear when flag is set', () => {
    const results = new Set<string>();
    for (let i = 0; i < 60; i++) {
      results.add(getPostLogMessage(basePostLog({ isCompleting3of3: true, streakDays: 3 })));
    }
    const has3of3 = [...results].some(
      (r) => r === 'This one mattered.' || r === 'Momentum logged.',
    );
    expect(has3of3).toBe(true);
  });

  test('returning messages appear when isReturning is true', () => {
    const results = new Set<string>();
    for (let i = 0; i < 60; i++) {
      results.add(getPostLogMessage(basePostLog({ isReturning: true })));
    }
    const hasReturning = [...results].some(
      (r) => r === "You came back. That's the hardest part." || r === "It wasn't nothing. It was this.",
    );
    expect(hasReturning).toBe(true);
  });

  test('streak_5plus messages only appear when streak >= 5', () => {
    const noStreak = new Set<string>();
    for (let i = 0; i < 60; i++) {
      noStreak.add(getPostLogMessage(basePostLog({ streakDays: 2 })));
    }
    expect([...noStreak]).not.toContain('Most people stopped by now.');
  });

  test('fallback to eligible pool when last message was the only one', () => {
    // Only default messages are eligible with streakDays=0; if last shown is one, still returns something
    const msg = getPostLogMessage(
      basePostLog({ lastShownPostLogMessage: "Quiet consistency. That's the whole game." }),
    );
    expect(msg).toBeTruthy();
  });
});

// ─── getWeekSentimentHeader ───────────────────────────────────────────────────

describe('getWeekSentimentHeader', () => {
  test('7/7 → Perfect week', () => {
    expect(getWeekSentimentHeader({ weekLoggedDays: 7, isAfterComeback: false })).toBe(
      'Perfect week. This is what it looks like.',
    );
  });
  test('6/7 → Strong week', () => {
    expect(getWeekSentimentHeader({ weekLoggedDays: 6, isAfterComeback: false })).toBe(
      "Strong week. You're building something real.",
    );
  });
  test('5/7 → Strong week', () => {
    expect(getWeekSentimentHeader({ weekLoggedDays: 5, isAfterComeback: false })).toBe(
      "Strong week. You're building something real.",
    );
  });
  test('4/7 → Half measures', () => {
    expect(getWeekSentimentHeader({ weekLoggedDays: 4, isAfterComeback: false })).toBe(
      'Half measures. You know you can do more.',
    );
  });
  test('3/7 → Half measures', () => {
    expect(getWeekSentimentHeader({ weekLoggedDays: 3, isAfterComeback: false })).toBe(
      'Half measures. You know you can do more.',
    );
  });
  test('2/7 → Rough week', () => {
    expect(getWeekSentimentHeader({ weekLoggedDays: 2, isAfterComeback: false })).toBe(
      "Rough week. They happen. Monday's a clean slate.",
    );
  });
  test('0/7 → The week slipped', () => {
    expect(getWeekSentimentHeader({ weekLoggedDays: 0, isAfterComeback: false })).toBe(
      'The week slipped. It does sometimes.',
    );
  });
  test('after comeback → comeback message regardless of log count', () => {
    expect(getWeekSentimentHeader({ weekLoggedDays: 0, isAfterComeback: true })).toBe(
      'You came back. That matters more than you think.',
    );
  });
});
