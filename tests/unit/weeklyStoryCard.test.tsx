// Weekly Story card (spec 2026-09-15 §5). FRAME PIN INVERTED from the old
// WeeklyReviewShareCard suite: that card had prose and was ruled
// height-follows-content on 2026-09-13; this one has no prose, every element
// is fixed or capped, so a fixed 9:16 frame is what makes it an object and
// the test now pins the frame INSTEAD of forbidding it.
import React from 'react';
import { act, render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => {
  const Rn = require('react-native');
  const Animated = { View: Rn.View, createAnimatedComponent: (C: any) => C };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: any) => v,
    withDelay: (_: any, v: any) => v,
    withSequence: (...v: any[]) => v[v.length - 1],
    Easing: { out: (e: any) => e, cubic: (t: number) => t },
  };
});
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
import { StyleSheet, Text } from 'react-native';
import {
  STORY_CARD_HEIGHT,
  STORY_CARD_WIDTH,
  STORY_NUMERAL_DROP,
  WeeklyStoryCard,
  storyMetaLine,
  type WeeklyStoryCardProps,
} from '../../components/WeeklyStoryCard';
import { Stop } from 'react-native-svg';
import { STORY_PALETTES, blendTint } from '../../lib/sharing/storyPalettes';
import { fonts } from '../../theme/tokens';

const props: WeeklyStoryCardProps = {
  weekLabel: 'Week of September 8',
  archetype: { id: 'slow_burn', name: 'The Slow Burn', line: 'Not loud. Not gone. Still going.' },
  daysActive: [true, true, false, true, true, false, true],
  daysActiveCount: 5,
  marksLogged: 11,
  goalTitles: ['Marathon Prep', 'Read 20 pages', 'A third goal past the cap'],
  deepestGoal: { title: 'Marathon Prep', weeksIn: 5 },
  signatureName: 'Deivi',
  showWeeksIn: true,
  showGoalTitle: true,
  palette: STORY_PALETTES.amber,
};

const flat = (style: unknown) => StyleSheet.flatten(style as any) as Record<string, any>;

describe('WeeklyStoryCard', () => {
  it('is a fixed 360x640 frame (9:16), the inverted pin', () => {
    const { getByTestId } = render(<WeeklyStoryCard {...props} />);
    const s = flat(getByTestId('story-card').props.style);
    expect(s.width).toBe(STORY_CARD_WIDTH);
    expect(s.height).toBe(STORY_CARD_HEIGHT);
    expect([STORY_CARD_WIDTH, STORY_CARD_HEIGHT]).toEqual([360, 640]);
    expect(s.overflow).toBe('hidden');
  });

  it('renders the archetype, the numeral, the fraction, the meta line and the footer', () => {
    const { getByText, getByTestId } = render(<WeeklyStoryCard {...props} />);
    expect(getByText('Week of September 8')).toBeTruthy();
    expect(getByText('Your week was')).toBeTruthy();
    expect(getByText('The Slow Burn')).toBeTruthy();
    expect(getByText('Not loud. Not gone. Still going.')).toBeTruthy();
    expect(getByTestId('story-numeral').props.children).toBe('5');
    expect(getByText('/ 7 days')).toBeTruthy();
    expect(getByText('11 marks · Week 6 of Marathon Prep')).toBeTruthy();
    expect(getByText('livralife.com')).toBeTruthy();
  });

  it('name and kicker wear the palette tint; the numeral stays linen', () => {
    const { getByTestId, getByText } = render(
      <WeeklyStoryCard {...props} palette={STORY_PALETTES.green} />,
    );
    expect(flat(getByTestId('story-name').props.style).color).toBe(STORY_PALETTES.green.tint);
    expect(flat(getByText('Your week was').props.style).color).toBe(STORY_PALETTES.green.tint);
    expect(flat(getByTestId('story-numeral').props.style).color).toBe('#F0EDE8');
  });

  // The week walks the gradient: Monday wears the lead colour, Sunday the
  // far end, every active day in between a step along it (founder 2026-09-20).
  it('draws seven day dots that walk the gradient, quiet days neutral', () => {
    const { getAllByTestId } = render(<WeeklyStoryCard {...props} />);
    const dots = getAllByTestId('story-day-dot');
    expect(dots).toHaveLength(7);
    const bg = (i: number) => flat(dots[i].props.style).backgroundColor;
    const { tint, tintEnd } = STORY_PALETTES.amber;
    expect(bg(0)).toBe(blendTint(tint, tintEnd, 0));
    expect(bg(6)).toBe(blendTint(tint, tintEnd, 1));
    expect(bg(3)).toBe(blendTint(tint, tintEnd, 3 / 6));
    // Wednesday and Saturday were quiet: neutral, never a colour.
    expect(bg(2)).not.toMatch(/^#[0-9A-F]{6}$/);
    expect(bg(5)).toBe(bg(2));
  });

  it('signs in the far end of the gradient, so the card reads amber to green', () => {
    const { getByTestId } = render(<WeeklyStoryCard {...props} />);
    expect(flat(getByTestId('story-signature').props.style).color).toBe(STORY_PALETTES.amber.tintEnd);
    // The name still leads: gradient TEXT needs masked-view, which this repo
    // does not have (ruling 2026-09-16), so the name is the lead colour flat.
    expect(flat(getByTestId('story-name').props.style).color).toBe(STORY_PALETTES.amber.tint);
  });

  it('the glow carries both ends of the gradient', () => {
    const { UNSAFE_getAllByType } = render(<WeeklyStoryCard {...props} />);
    const stops = UNSAFE_getAllByType(Stop as never);
    const colors = stops.map((s: { props: Record<string, unknown> }) => s.props.stopColor);
    expect(colors).toContain(STORY_PALETTES.amber.tint);
    expect(colors).toContain(STORY_PALETTES.amber.tintEnd);
  });

  // 2026-09-20: the two-goal list became one DEPTH line — "week 6 of X" is the
  // stakes the card had none of. Each half is a toggle, so every combination
  // has to read as a sentence.
  it('builds the depth line, and each toggle removes exactly its half', () => {
    const goal = { title: 'Marathon Prep', weeksIn: 5 };
    expect(storyMetaLine(11, goal, { showWeeksIn: true, showGoalTitle: true })).toBe(
      '11 marks · Week 6 of Marathon Prep',
    );
    expect(storyMetaLine(11, goal, { showWeeksIn: false, showGoalTitle: true })).toBe(
      '11 marks · Marathon Prep',
    );
    expect(storyMetaLine(11, goal, { showWeeksIn: true, showGoalTitle: false })).toBe(
      '11 marks · Week 6',
    );
    expect(storyMetaLine(11, goal, { showWeeksIn: false, showGoalTitle: false })).toBe('11 marks');
    // Week one is "Week 1", never "Week 0".
    expect(
      storyMetaLine(3, { title: 'Read daily', weeksIn: 0 }, { showWeeksIn: true, showGoalTitle: true }),
    ).toBe('3 marks · Week 1 of Read daily');
    // No goals at all, and the singular.
    expect(storyMetaLine(1, null, { showWeeksIn: true, showGoalTitle: true })).toBe('1 mark');
    expect(storyMetaLine(0, null, { showWeeksIn: true, showGoalTitle: true })).toBe('0 marks');
  });

  describe('signature (founder 2026-09-20: the card must be MINE)', () => {
    it('signs the footer in the script face, in the palette tint', () => {
      const { getByTestId, queryByText } = render(<WeeklyStoryCard {...props} />);
      const sig = getByTestId('story-signature');
      expect(sig.props.children).toBe('Deivi');
      expect(flat(sig.props.style).fontFamily).toBe(fonts.signature);
      // The far end of the gradient: the card opens amber and signs green.
      expect(flat(sig.props.style).color).toBe(STORY_PALETTES.amber.tintEnd);
      // The signature took the prompt's job.
      expect(queryByText('what was your week?')).toBeNull();
    });

    it('a name-less account keeps TODAY\'s footer, never an empty slot', () => {
      const { queryByTestId, getByText } = render(<WeeklyStoryCard {...props} signatureName={null} />);
      expect(queryByTestId('story-signature')).toBeNull();
      expect(getByText('what was your week?')).toBeTruthy();
      expect(getByText('livralife.com')).toBeTruthy();
    });

    it('a long name shrinks to fit rather than running into livralife.com', () => {
      const { getByTestId } = render(<WeeklyStoryCard {...props} signatureName="Jacqueline" />);
      const sig = getByTestId('story-signature');
      expect(sig.props.adjustsFontSizeToFit).toBe(true);
      expect(sig.props.numberOfLines).toBe(1);
    });
  });

  // Founder 2026-09-20: the numeral sits lower than frame centre. The
  // frame-centred column stays — it is what stopped the iOS clip on 09-18 —
  // so the drop is a transform on top of it, never a recomputed top.
  it('drops the numeral below centre without reintroducing a hand-computed top', () => {
    const { getByTestId } = render(<WeeklyStoryCard {...props} />);
    const row = flat(getByTestId('story-numeral-row').props.style);
    expect(row.transform).toEqual([{ translateY: STORY_NUMERAL_DROP }]);
    expect(STORY_NUMERAL_DROP).toBe(28);
    const frame = flat(getByTestId('story-numeral-frame').props.style);
    expect(frame.justifyContent).toBe('center');
    expect(frame.top).toBe(0);
    expect(frame.bottom).toBe(0);
  });

  it('a zero day week renders "0 / 7 days" under its name, never "not yet"', () => {
    const { getByTestId, queryByText } = render(
      <WeeklyStoryCard
        {...props}
        daysActiveCount={0}
        daysActive={[false, false, false, false, false, false, false]}
        archetype={{ id: 'quiet_week', name: 'Quiet Week', line: 'The thread is still yours.' }}
      />,
    );
    expect(getByTestId('story-numeral').props.children).toBe('0');
    expect(queryByText(/not yet/)).toBeNull();
  });

  it('pins allowFontScaling off on every Text and caps only the name (2) and meta (1)', () => {
    const { UNSAFE_getAllByType } = render(<WeeklyStoryCard {...props} />);
    const texts = UNSAFE_getAllByType(Text);
    expect(texts.length).toBeGreaterThan(8);
    for (const t of texts) expect(t.props.allowFontScaling).toBe(false);
    const capped = texts.filter((t) => t.props.numberOfLines != null);
    expect(capped.map((t) => [t.props.testID, t.props.numberOfLines])).toEqual(
      expect.arrayContaining([
        ['story-name', 2],
        ['story-meta', 1],
        ['story-signature', 1],
      ]),
    );
    expect(capped).toHaveLength(3);
  });

  // Device bug 2026-09-18: a 123pt numeral in a 98pt line box was CUT IN HALF
  // on iOS (the web harness let the glyph overflow, so the design pass never
  // saw it). The numeral must carry no line box shorter than its font size,
  // and the fraction must sit on the numeral's baseline, not a padded guess.
  it('never gives the numeral a line box shorter than its glyphs; fraction rides the baseline', () => {
    const { getByTestId } = render(<WeeklyStoryCard {...props} />);
    const n = flat(getByTestId('story-numeral').props.style);
    if (n.lineHeight != null) expect(n.lineHeight).toBeGreaterThanOrEqual(n.fontSize);
    const row = flat(getByTestId('story-numeral-row').props.style);
    expect(row.alignItems).toBe('baseline');
    expect(flat(getByTestId('story-fraction').props.style).paddingBottom).toBeUndefined();
  });

  describe('entrance (the in-app reveal)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('counts the numeral up from 0 as the active days light, then reports done once', () => {
      const onEntranceDone = jest.fn();
      const { getByTestId } = render(
        <WeeklyStoryCard {...props} animate onEntranceDone={onEntranceDone} />,
      );
      expect(getByTestId('story-numeral').props.children).toBe('0');
      act(() => jest.advanceTimersByTime(5000));
      expect(getByTestId('story-numeral').props.children).toBe('5');
      expect(onEntranceDone).toHaveBeenCalledTimes(1);
    });

    it('a static card (the default) is final on the first frame and reports done', () => {
      const onEntranceDone = jest.fn();
      const { getByTestId } = render(<WeeklyStoryCard {...props} onEntranceDone={onEntranceDone} />);
      expect(getByTestId('story-numeral').props.children).toBe('5');
      act(() => jest.runOnlyPendingTimers());
      expect(onEntranceDone).toHaveBeenCalledTimes(1);
    });
  });
});
