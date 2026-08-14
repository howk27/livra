/**
 * Pure price-parsing helpers for IAP display/math. Extracted from
 * `app/paywall.tsx` so the math is reusable and unit-testable independent of
 * the paywall UI. No React / store dependencies.
 */

/**
 * Parse a localized/formatted price string into a number, handling both
 * `1,234.56` (US) and `1.234,56` (EU) group/decimal conventions. Never NaN.
 */
export function parseLocalizedPrice(input: string | null | undefined): number {
  if (!input) return 0;
  let s = String(input).replace(/[^0-9.,]/g, '').trim();
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : lastDot > -1 ? '.' : '';
  if (decimalSep) {
    const groupSep = decimalSep === ',' ? '.' : ',';
    s = s.split(groupSep).join('');
    s = s.replace(decimalSep, '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resolve a numeric price for math. Prefers the machine-readable numeric
 * `price` field (locale-independent, provided by expo-iap); falls back to
 * locale-aware parsing of the localized/formatted display string. Never
 * returns NaN.
 */
/**
 * Format a derived value (e.g. the yearly price ÷ 12) in the same style as a
 * localized price string from the store, so the currency symbol, its position,
 * and the decimal separator all come from the storefront — never hardcoded.
 * "24,99 €" + 2.0825 → "2,08 €"; "$24.99" → "$2.08"; "¥3800" → "¥317".
 * Returns '' when the template has no digits or the value is not positive —
 * callers drop the line rather than show a wrong currency.
 */
export function formatPriceLike(
  template: string | null | undefined,
  value: number
): string {
  if (!template || !Number.isFinite(value) || value <= 0) return '';
  const s = String(template);
  const match = s.match(/[0-9][0-9.,\s ]*[0-9]|[0-9]/);
  if (!match) return '';
  const numeric = match[0];
  const lastComma = numeric.lastIndexOf(',');
  const lastDot = numeric.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : lastDot > -1 ? '.' : '';
  const formatted = decimalSep
    ? value.toFixed(2).replace('.', decimalSep)
    : String(Math.round(value));
  return s.replace(numeric, formatted);
}

export function priceToNumber(
  rawPrice: string | number | null | undefined,
  formatted?: string | null
): number {
  if (typeof rawPrice === 'number') return Number.isFinite(rawPrice) ? rawPrice : 0;
  if (typeof rawPrice === 'string') {
    const trimmed = rawPrice.trim();
    if (/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) return parseFloat(trimmed);
  }
  return parseLocalizedPrice(formatted ?? (typeof rawPrice === 'string' ? rawPrice : ''));
}
