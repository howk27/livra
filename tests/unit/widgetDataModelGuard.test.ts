import { readFileSync } from 'fs';
import { join } from 'path';

const rawModel = readFileSync(
  join(__dirname, '../../targets/LivraWidget/WidgetDataModel.swift'),
  'utf8',
);

// Comments stripped before any assertion: this file's comments quote the very
// symbols the guards look for (e.g. the note explaining why `theme` must be
// carried through the tap re-encode names `theme:` itself). Scanning raw source
// would let prose satisfy a structural guard — the dead-guard class recorded in
// docs/PROJECT-CONTEXT.md, hit again on 2026-08-02.
const model = rawModel
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

describe('the theme survives the widget-tap re-encode', () => {
  // WidgetLogQueue.optimisticallyComplete rebuilds WidgetData on every tap.
  // Omitting `theme` there would erase the app's theme from the snapshot the
  // first time a mark was logged from the widget, silently reverting it to
  // following the phone. Structural, and invisible to every other test.
  it('constructs the updated snapshot with theme carried from the current one', () => {
    const ctor = model.slice(model.indexOf('let updated = WidgetData('));
    expect(ctor).toContain('theme: current.theme');
  });

  it('decodes theme as optional, so an older snapshot still renders', () => {
    expect(model).toMatch(/let theme: String\?/);
    expect(model).toContain('decodeIfPresent(String.self, forKey: .theme)');
    expect(model).toContain('case goals, lastUpdated, isPro, theme');
  });

  it('maps only the two known values, defaulting to the system trait', () => {
    expect(model).toContain('var colorSchemeOverride: ColorScheme?');
    expect(model).toMatch(/case "dark": return \.dark/);
    expect(model).toMatch(/case "light": return \.light/);
    expect(model).toMatch(/default: return nil/);
  });

  // Same trap as `theme`, one field over: the tap rebuild reconstructs every
  // WidgetGoalData, so an omitted `hasCommitment` would downgrade the day
  // count's wording from "check-in days" to "check-ins" the first time a mark
  // was logged from the widget — and only then, which is why no other test
  // would ever see it.
  it('constructs the updated goal with hasCommitment carried from the current one', () => {
    const ctor = model.slice(model.indexOf('return WidgetGoalData('));
    expect(ctor).toContain('hasCommitment: goal.hasCommitment');
  });

  it('decodes hasCommitment as optional, so an older snapshot still renders', () => {
    // Non-optional would fail the whole goals array into the legacy adapter.
    expect(model).toMatch(/let hasCommitment: Bool\?/);
  });

  it('claims "check-in days" only when a commitment backs the threshold', () => {
    // Mirrors goals.tsx:262. Absent must fall to the cautious "check-ins".
    expect(model).toContain('hasCommitment == true ? "check-in days" : "check-ins"');
  });

  it('strips comments, so prose cannot satisfy the guards above', () => {
    expect(rawModel).toContain('MUST be carried through');
    expect(model).not.toContain('MUST be carried through');
  });
});

describe('WidgetData v2 Swift model', () => {
  it('defines a WidgetGoalData struct with a marks array', () => {
    expect(model).toMatch(/struct WidgetGoalData: Codable/);
    expect(model).toMatch(/let marks: \[WidgetMarkData\]/);
  });

  it('decodes the v2 goals array', () => {
    expect(model).toMatch(/goals/);
    expect(model).toMatch(/\[WidgetGoalData\]/);
  });

  it('adapts a legacy v1 snapshot (goals key absent) instead of crashing', () => {
    // The decoder must reference the old top-level keys to build a one-goal v2.
    expect(model).toMatch(/activeGoalTitle/);
    expect(model).toMatch(/decodeIfPresent/);
  });

  it('derives current goal / current mark for the queue', () => {
    expect(model).toMatch(/var currentGoal:/);
    expect(model).toMatch(/var currentMark:/);
  });

  it('keeps backward-compat accessors for the lock-screen widget', () => {
    for (const acc of ['activeGoalTitle', 'goalProgress', 'progressFraction', 'nextQueuedMark']) {
      expect(model).toContain(acc);
    }
  });

  it('does NOT bump the ring on an optimistic tap (ring is days-based)', () => {
    // The old code did `goalProgress: current.goalProgress + (newlyCompleted ? 1 : 0)`.
    // v2 must not increment any progress field inside the optimistic flip.
    expect(model).not.toMatch(/progress:\s*\w+\.progress\s*\+/);
  });
});
