/**
 * The binary declares com.apple.developer.healthkit and ships
 * NSHealthShareUsageDescription ("Livra reads your workout, sleep, and activity
 * data... never stored on our servers"). Apple's HealthKit rules (5.1.3) require
 * the privacy policy to describe that collection and forbid advertising use —
 * and until 2026-08-02 the in-app policy never mentioned health data at all.
 * This guard pins the policy's health section to the same claims the usage
 * string makes, because nothing else in the suite reads this prose.
 *
 * Scans the SHIPPED source with comments stripped, same as
 * copySubscriptionRenewal.test.ts — this repo has shipped source-scanners that
 * passed on a comment.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const POLICY = 'app/legal/privacy-policy.tsx';

/** Same shape as tests/unit/copySubscriptionRenewal.test.ts — CRLF-safe, leaves `//` in URLs. */
function stripComments(src: string): string {
  return src
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

function policySource(): string {
  return stripComments(readFileSync(join(__dirname, '../../', POLICY), 'utf8'));
}

function readableText(src: string): string {
  return src.replace(/\s+/g, ' ');
}

describe('privacy policy covers Apple Health data', () => {
  it('names Apple Health and what is read', () => {
    const text = readableText(policySource());
    expect(text).toMatch(/Apple Health/);
    expect(text).toMatch(/workout/i);
    expect(text).toMatch(/sleep/i);
  });

  it('states health data is never stored on our servers — matching the usage string', () => {
    expect(readableText(policySource())).toMatch(/never stored on our servers/i);
  });

  it('excludes advertising and sale of health data (HealthKit 5.1.3)', () => {
    const text = readableText(policySource());
    expect(text).toMatch(/health data[^.]*advertising/i);
  });

  it('keeps the disclosure out of comments only — the guard reads stripped source', () => {
    const raw = readFileSync(join(__dirname, '../../', POLICY), 'utf8');
    const stripped = policySource();
    expect(stripped.length).toBeLessThan(raw.length);
    expect(stripped).not.toContain('HealthKit 5.1.3 drift fix');
  });
});
