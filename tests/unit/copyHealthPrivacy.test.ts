/**
 * The binary declares com.apple.developer.healthkit and ships
 * NSHealthShareUsageDescription ("Livra reads your workouts, mindful sessions,
 * steps, and sleep to automatically log check-ins for your connected marks and
 * power your weekly reflection" — app.json:32). Apple's HealthKit rules (5.1.3)
 * require the privacy policy to describe that collection and forbid advertising
 * use, and nothing else in the suite reads this prose, so this guard pins the
 * policy's health section to the same claims the usage string makes.
 *
 * 2026-08-05 — INVERTED CASE. Until health auto-sync shipped, this file asserted
 * the policy SAYS "never stored on our servers". Auto-sync writes a mark_events
 * row for every qualifying day (lib/health/autoSync.ts →
 * lib/data/mutations/checkins.ts, attribution column
 * 20260805_mark_events_source.sql), so health-DERIVED data now reaches the
 * server and that sentence became a false claim in a published policy. The case
 * below is its mirror image: the phrase must be ABSENT, and the truthful
 * replacement — values stay on device, qualifying days sync as check-ins — must
 * be present. Re-introducing the old sentence fails the suite by design.
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

  it('never re-asserts that health data is not stored on our servers — auto-sync made that false', () => {
    const text = readableText(policySource());
    // The exact retired sentence, plus the near-misses a rewrite might reach for.
    expect(text).not.toMatch(/never stored on our servers/i);
    expect(text).not.toMatch(/never (?:stored|kept|saved|held|transmitted|sent)[^.]{0,60}our servers/i);
    expect(text).not.toMatch(/health data[^.]{0,60}never (?:leaves|leave) your (?:device|phone)/i);
  });

  it('discloses that qualifying days sync to our servers as check-ins, values excepted', () => {
    const text = readableText(policySource());
    // A check-in born from Health reaches Supabase.
    expect(text).toMatch(/check-?ins?[^.]{0,80}synced to our servers/i);
    // ...and what does NOT: the raw readings behind it.
    expect(text).toMatch(/health readings stay on your device/i);
    expect(text).toMatch(/discarded on your device and never sent to us/i);
    // The attribution the mark_events.source column carries is disclosed too.
    expect(text).toMatch(/labeled as logged from Apple Health/i);
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
