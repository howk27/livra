import { readFileSync } from 'fs';
import { join } from 'path';
import { goalPreviewMarks } from '../../lib/creation/creationPreview';
import { getMarksForGoal } from '../../lib/goalMarkSuggestions';

/**
 * QC4 wave 3 — "The Bench and the Object" acceptance guards for goal/new.
 *
 * These are source guards in the house style (see creationAssembly.test.ts):
 * the properties below are structural decisions with a founder note behind
 * each one, and a regression here is silent on every unit test that only
 * exercises logic. The behavioural halves (which marks a title resolves, and
 * that every one of them can explain itself) run against the real data.
 */

const ROOT = join(__dirname, '../../');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * QC5-B — the ten welcome goals, pinned. Every one is OUTCOME-shaped (a thing
 * you finish or reach). The founder's note is the rule: "Read nightly ... sounds
 * like a mark, not a goal" — a recurring action IS a mark in this product, so a
 * mark-shaped preset teaches the wrong model on a new user's first open.
 * "Meditate daily" was removed under the same rule.
 *
 * These are the behavioural fixtures for the whole file: the preset list and the
 * data assertions below are the SAME ten, so a library change can never leave a
 * shipped chip resolving to nothing.
 */
const WELCOME_GOALS = [
  'Run a 5k',
  'Lose 15 pounds',
  'Save $5k',
  'Fix my sleep',
  'Get my stress under control',
  'Learn Spanish',
  'Read 12 books this year',
  'Write a book',
  'Be more present with my family',
  'Launch a side hustle',
];

describe('QC4-E — the card is the object, the group below is the instrument', () => {
  const src = stripComments(read('app/goal/new.tsx'));

  it('the card renders read-only from title/why props, with the hollow placeholder', () => {
    expect(src).toContain('title={title}');
    expect(src).toContain('titlePlaceholder="Your goal"');
    expect(src).toContain('why={description}');
  });

  it('the card answers a named goal with the sanctioned ember flourish', () => {
    expect(src).toContain('flourish={!!title.trim()}');
  });

  it('the caret lives in the instrument group, which keeps the deferred autofocus', () => {
    expect(src).toContain('testID="goal-title-input"');
    expect(src).toContain('ref={titleInputRef}');
    expect(src).toContain('useDeferredAutoFocus');
  });

  it('the instrument borrows mark/new’s grammar, not a fresh one', () => {
    expect(src).toContain('styles.inputInCard');
    expect(src).toContain('styles.groupLabel');
    expect(src).toContain('backgroundColor: c.surface');
  });

  it('GoalCardPreview no longer offers a caret slot to any caller', () => {
    expect(stripComments(read('components/creation/GoalCardPreview.tsx'))).not.toContain('titleSlot');
  });
});

describe('QC2-D — the half-render cause stays dead on goal/new', () => {
  it('no KeyboardAvoidingView, and the probe survives', () => {
    const src = stripComments(read('app/goal/new.tsx'));
    expect(src).not.toContain('KeyboardAvoidingView');
    expect(src).toContain('useHalfRenderProbe');
  });
});

describe('QC4-C — the parts bin stays reachable after you commit', () => {
  const src = stripComments(read('app/goal/new.tsx'));

  it('the preset row is never gated on an empty title', () => {
    // The QC4-C root cause: `{!title.trim() && (` around the chip block emptied
    // the screen at the exact moment creation began.
    expect(src).not.toMatch(/!title\.trim\(\)\s*&&\s*\(/);
    expect(src).toContain('testID="goal-example-chips"');
  });

  it('tapping the selected preset clears it — changing your mind without cancelling', () => {
    expect(src).toContain('cur.trim() === example ? \'\' : example');
  });

  it('the chips are category-tinted parts, not beige chrome', () => {
    expect(src).toContain('applyOpacity(accent, 0.14)');
    expect(src).toContain('applyOpacity(accent, 0.45)');
    expect(src).not.toContain('borderColor: c.borderLight');
  });
});

describe('QC4-D — the actions clear the keyboard', () => {
  const src = stripComments(read('app/goal/new.tsx'));

  it('"Set the plan" comes first, the AI door directly below it', () => {
    const setPlan = src.indexOf('Set the plan');
    const suggest = src.indexOf('let Livra suggest a plan');
    expect(setPlan).toBeGreaterThan(-1);
    expect(suggest).toBeGreaterThan(-1);
    expect(setPlan).toBeLessThan(suggest);
  });

  it('the action zone rides in the scroll, not a screen-anchored bottom bar', () => {
    expect(src).toContain('styles.actionZone');
    expect(src).not.toContain('styles.footer,');
    // It must stay BELOW the instrument, or it pushes the input under the
    // keyboard on a 667pt device (the QC4-D x QC4-E shared constraint).
    expect(src.indexOf('testID="goal-why-input"')).toBeLessThan(src.indexOf('styles.actionZone'));
  });
});

describe('QC4-B-ui — every suggested mark can explain itself', () => {
  const src = stripComments(read('app/goal/new.tsx'));

  it('the strip carries a headline and a tappable disclosure', () => {
    expect(src).toContain('styles.sectionLabel');
    expect(src).toContain('accessibilityState={{ expanded }}');
    expect(src).toContain('testID="goal-mark-preview-description"');
  });

  it('the explanation is the library sentence, not new copy', () => {
    expect(src).toContain('{expanded.description}');
  });

  it('every mark a real goal resolves to has a description to disclose', () => {
    for (const goal of WELCOME_GOALS) {
      const marks = goalPreviewMarks(goal);
      expect(marks.length).toBeGreaterThan(0);
      for (const mark of marks) {
        expect(typeof mark.description).toBe('string');
        expect(mark.description.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('every preset resolves a category, so no chip falls back to the custom grey', () => {
    for (const goal of WELCOME_GOALS) {
      expect(getMarksForGoal(goal)[0]?.category).toBeTruthy();
    }
  });
});

describe('QC5-B — the welcome bin: ten outcome-shaped goals, at the bottom', () => {
  const src = stripComments(read('app/goal/new.tsx'));

  it('ships exactly the ten pinned goals, in order', () => {
    const list = src.match(/const EXAMPLE_GOALS = \[([\s\S]*?)\];/);
    expect(list).toBeTruthy();
    const shipped = [...list![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(shipped).toEqual(WELCOME_GOALS);
  });

  it('drops the mark-shaped presets the founder called out', () => {
    // "Read nightly ... sounds like a mark, not a goal" (founder). "Meditate
    // daily" is the same grammar and went with it.
    expect(src).not.toContain("'Read nightly'");
    expect(src).not.toContain("'Meditate daily'");
  });

  it('every welcome goal is an outcome, never a recurring action', () => {
    // The grammar rule behind the founder's note, enforced: a goal is a thing
    // you finish or reach, so no preset may wear a cadence adverb.
    for (const goal of WELCOME_GOALS) {
      expect(goal).not.toMatch(/\b(daily|nightly|weekly|every day|each day)\b/i);
    }
  });

  it('the bin sits at the BOTTOM — below the action zone AND below the strip', () => {
    // QC4-D's guarantee, restated at this task's granularity: the CTA must not
    // move down. The bin is the last thing in the scroll, so nothing it renders
    // can push "Set the plan" further from the thumb.
    const actions = src.indexOf('styles.actionZone');
    const strip = src.indexOf('<MarkPreviewStrip');
    const bin = src.indexOf('testID="goal-example-chips"');
    expect(actions).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(-1);
    expect(bin).toBeGreaterThan(-1);
    expect(actions).toBeLessThan(strip);
    expect(strip).toBeLessThan(bin);
  });

  it('is a welcome: shown by goal count read ONCE at mount, never by title', () => {
    // The QC4-C trap is gating on a value that flips while you type. The goal
    // count is frozen in a useState initializer, so the bin cannot vanish under
    // an editing thumb.
    expect(src).toContain('useState(() => useGoalsStore.getState().goals.length === 0)');
    expect(src).toContain('showWelcomeGoals ?');
    expect(src).not.toMatch(/!title\.trim\(\)\s*&&\s*\(/);
  });
});
