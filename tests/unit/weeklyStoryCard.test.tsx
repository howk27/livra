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
  STORY_GOAL_CAP,
  WeeklyStoryCard,
  storyMetaLine,
  type WeeklyStoryCardProps,
} from '../../components/WeeklyStoryCard';
import { STORY_PALETTES } from '../../lib/sharing/storyPalettes';

const props: WeeklyStoryCardProps = {
  weekLabel: 'Week of September 8',
  archetype: { id: 'slow_burn', name: 'The Slow Burn', line: 'Not loud. Not gone. Still going.' },
  daysActive: [true, true, false, true, true, false, true],
  daysActiveCount: 5,
  marksLogged: 11,
  goalTitles: ['Marathon Prep', 'Read 20 pages', 'A third goal past the cap'],
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
    expect(getByText('11 marks · Marathon Prep · Read 20 pages')).toBeTruthy();
    expect(getByText('what was your week?')).toBeTruthy();
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

  it('draws seven day dots, active ones in the tint', () => {
    const { getAllByTestId } = render(<WeeklyStoryCard {...props} />);
    const dots = getAllByTestId('story-day-dot');
    expect(dots).toHaveLength(7);
    const active = dots.filter((d) => flat(d.props.style).backgroundColor === STORY_PALETTES.amber.tint);
    expect(active).toHaveLength(5);
  });

  it('caps the meta line at two goals and pluralises marks', () => {
    expect(STORY_GOAL_CAP).toBe(2);
    expect(storyMetaLine(11, ['A', 'B', 'C'])).toBe('11 marks · A · B');
    expect(storyMetaLine(1, ['A'])).toBe('1 mark · A');
    expect(storyMetaLine(0, [])).toBe('0 marks');
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
      ]),
    );
    expect(capped).toHaveLength(2);
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
