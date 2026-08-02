/**
 * App Store Review 3.1.2 requires the point-of-purchase screen to carry the
 * subscription's renewal terms and functional links to the privacy policy and
 * terms of use. The plan cards already state title, length and price; the
 * renewal sentence and the two links are what this guard pins, because they are
 * pure prose with no runtime behaviour behind them — nothing else in the suite
 * would notice if a refactor dropped them, and the cost of noticing at Apple is
 * a whole review cycle.
 *
 * Scans the SHIPPED source with comments stripped. This repo has shipped four
 * guards that measured nothing, three of them source-scanners that matched a
 * comment instead of code (see docs/PROJECT-CONTEXT.md, Conventions) — and the
 * comment introducing this very disclosure names 3.1.2 and the word renewal, so
 * an unstripped scan here would pass on the comment alone.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const PAYWALL = 'app/paywall.tsx';

/** Same shape as tests/unit/copyDashRule.test.ts — CRLF-safe, leaves `//` in URLs. */
function stripComments(src: string): string {
  return src
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

function paywallSource(): string {
  return stripComments(readFileSync(join(__dirname, '../../', PAYWALL), 'utf8'));
}

/** JSX text and string literals collapsed to one whitespace-normalised haystack. */
function readableText(src: string): string {
  return src.replace(/\s+/g, ' ');
}

describe('paywall carries its App Store 3.1.2 disclosures', () => {
  it('states that the subscription renews automatically', () => {
    expect(readableText(paywallSource())).toMatch(/renews automatically/i);
  });

  it('states the 24 hour cancellation window', () => {
    const text = readableText(paywallSource());
    expect(text).toMatch(/24 hours/i);
    expect(text).toMatch(/cancel/i);
  });

  it('links the privacy policy and the terms at the point of purchase', () => {
    const src = paywallSource();
    expect(src).toContain('/legal/privacy-policy');
    expect(src).toContain('/legal/terms-and-conditions');
  });

  it('still states the term alongside each price', () => {
    const text = readableText(paywallSource());
    expect(text).toMatch(/\/ month/);
    expect(text).toMatch(/\/ year/);
  });

  it('keeps the disclosure out of comments only — the guard reads stripped source', () => {
    // Proves the stripper is load-bearing: the block comment at the top of the
    // paywall's disclosure mentions renewal, and must NOT be what satisfies the
    // assertions above.
    const raw = readFileSync(join(__dirname, '../../', PAYWALL), 'utf8');
    const stripped = paywallSource();
    expect(stripped.length).toBeLessThan(raw.length);
    expect(stripped).not.toContain('App Store Review 3.1.2');
  });
});
