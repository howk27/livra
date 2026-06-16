// tests/unit/iapPrice.test.ts
import { parseLocalizedPrice, priceToNumber } from '../../lib/iap/price';

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
