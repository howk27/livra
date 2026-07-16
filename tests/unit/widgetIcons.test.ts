import { categoryVisual } from '../../lib/widgets/widgetIcons';
import { categoryAccents } from '../../theme/tokens';

describe('categoryVisual', () => {
  it('maps known categories to their SF Symbol + accent', () => {
    expect(categoryVisual('Recovery')).toEqual({ symbol: 'moon.fill', accent: categoryAccents.recovery });
    expect(categoryVisual('Health')).toEqual({ symbol: 'drop.fill', accent: categoryAccents.health });
    expect(categoryVisual('Finance')).toEqual({
      symbol: 'dollarsign.circle.fill',
      accent: categoryAccents.finance,
    });
  });

  it('maps legacy lowercase category keys', () => {
    expect(categoryVisual('sleep')).toEqual({ symbol: 'moon.fill', accent: categoryAccents.recovery });
    expect(categoryVisual('water')).toEqual({ symbol: 'drop.fill', accent: categoryAccents.health });
    expect(categoryVisual('planning')).toEqual({ symbol: 'calendar', accent: categoryAccents.planning });
  });

  it('falls back to custom for unknown / empty categories (parity with MarkRow)', () => {
    const custom = { symbol: 'circle.fill', accent: categoryAccents.custom };
    expect(categoryVisual('gym')).toEqual(custom); // not in CATEGORY_MAP → custom
    expect(categoryVisual('totally-unknown')).toEqual(custom);
    expect(categoryVisual(undefined)).toEqual(custom);
    expect(categoryVisual(null)).toEqual(custom);
    expect(categoryVisual('')).toEqual(custom);
  });

  it('only ever returns SF Symbol names, never emoji', () => {
    for (const key of ['Recovery', 'Fitness', 'Health', 'Mindset', 'Deep Work', 'custom']) {
      expect(categoryVisual(key).symbol).toMatch(/^[a-z0-9.]+$/);
    }
  });
});
