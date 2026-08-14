// tests/unit/iapPrice.test.ts
import { parseLocalizedPrice, priceToNumber, formatPriceLike } from '../../lib/iap/price';

describe('parseLocalizedPrice', () => {
  it('parses US-style group/decimal separators', () => {
    expect(parseLocalizedPrice('$1,234.56')).toBeCloseTo(1234.56);
    expect(parseLocalizedPrice('$9.99')).toBeCloseTo(9.99);
  });

  it('parses EU-style group/decimal separators', () => {
    expect(parseLocalizedPrice('1.234,56 €')).toBeCloseTo(1234.56);
    expect(parseLocalizedPrice('9,99 €')).toBeCloseTo(9.99);
  });

  it('treats a lone separator as the decimal mark (documented ambiguity)', () => {
    // With no second separator to disambiguate, "1,200" / "1.200" are read as
    // decimals, not thousands. This is why priceToNumber prefers the numeric
    // `price` field; localized parsing is best-effort display math only.
    expect(parseLocalizedPrice('1,200')).toBeCloseTo(1.2);
    expect(parseLocalizedPrice('1.200')).toBeCloseTo(1.2);
  });

  it('returns 0 for empty/garbage/nullish input (never NaN)', () => {
    expect(parseLocalizedPrice('')).toBe(0);
    expect(parseLocalizedPrice(null)).toBe(0);
    expect(parseLocalizedPrice(undefined)).toBe(0);
    expect(parseLocalizedPrice('Free')).toBe(0);
  });
});

describe('priceToNumber', () => {
  it('prefers a numeric raw price (locale-independent)', () => {
    expect(priceToNumber(9.99)).toBeCloseTo(9.99);
    expect(priceToNumber(0)).toBe(0);
  });

  it('parses a plain numeric string', () => {
    expect(priceToNumber('9.99')).toBeCloseTo(9.99);
    expect(priceToNumber('1200')).toBeCloseTo(1200);
  });

  it('falls back to the localized formatted string when raw is non-numeric', () => {
    expect(priceToNumber('US$9.99', '$9.99')).toBeCloseTo(9.99);
    expect(priceToNumber(null, '1.234,56 €')).toBeCloseTo(1234.56);
  });

  it('never returns NaN', () => {
    expect(priceToNumber(NaN)).toBe(0);
    expect(priceToNumber(null, null)).toBe(0);
    expect(priceToNumber(undefined)).toBe(0);
  });
});

describe('formatPriceLike', () => {
  it('keeps a leading symbol and US decimal style', () => {
    expect(formatPriceLike('$24.99', 24.99 / 12)).toBe('$2.08');
  });

  it('keeps a trailing symbol and EU comma decimal', () => {
    expect(formatPriceLike('24,99 €', 24.99 / 12)).toBe('2,08 €');
  });

  it('keeps grouped EU prices intact around the replaced number', () => {
    expect(formatPriceLike('1.234,56 €', 102.88)).toBe('102,88 €');
  });

  it('rounds to whole units when the template has no decimals (e.g. JPY)', () => {
    expect(formatPriceLike('¥3800', 3800 / 12)).toBe('¥317');
  });

  it('formats a bare numeric template (raw price fallback, no symbol)', () => {
    expect(formatPriceLike('24.99', 24.99 / 12)).toBe('2.08');
  });

  it("returns '' rather than guessing a currency", () => {
    expect(formatPriceLike('', 2.08)).toBe('');
    expect(formatPriceLike(null, 2.08)).toBe('');
    expect(formatPriceLike(undefined, 2.08)).toBe('');
    expect(formatPriceLike('Free', 2.08)).toBe('');
    expect(formatPriceLike('$24.99', 0)).toBe('');
    expect(formatPriceLike('$24.99', NaN)).toBe('');
  });
});
