// The paywall must not sell a feature the user cannot reach.
//
// 2026-08-08 hid the goal-completion share card behind SHARE_CARD_ENABLED. The
// paywall kept a "Custom Share Cards — Restyle your finish" row, so Livra+ was
// advertising a surface that no longer exists. The existing drift check was
// dev-only (`if (!env.isDev) return`) AND compared two hand-maintained lists
// that both carried the same mistake, so it could never have caught it.
//
// This runs in CI and reads the real module.

import { readFileSync } from 'fs';
import { join } from 'path';
import { SHARE_CARD_ENABLED } from '@/lib/sharing/shareCardEnabled';

const PAYWALL = join(__dirname, '..', '..', 'app', 'paywall.tsx');

/** Titles as they appear in the ALL_PRO_FEATURES literal, in source order. */
function advertisedTitles(): string[] {
  const src = readFileSync(PAYWALL, 'utf8');
  const block = src.slice(
    src.indexOf('const ALL_PRO_FEATURES'),
    src.indexOf('const PRO_FEATURES')
  );
  return [...block.matchAll(/title:\s*'([^']+)'/g)].map((m) => m[1]);
}

describe('the paywall sells only what ships', () => {
  it('advertises Custom Share Cards only while the share card is reachable', () => {
    // The flag is the single source of truth for whether the feature exists.
    const sellsShareCards =
      advertisedTitles().includes('Custom Share Cards') && SHARE_CARD_ENABLED;
    expect(sellsShareCards).toBe(SHARE_CARD_ENABLED);
  });

  it('the shipped-titles list tracks the flag, so the drift guard cannot compare two copies of one mistake', () => {
    const src = readFileSync(PAYWALL, 'utf8');
    const shippedBlock = src.slice(
      src.indexOf('SHIPPED_PREMIUM_FEATURE_TITLES'),
      src.indexOf('PAYWALL_FEATURE_TITLES')
    );
    // Not a bare literal: it must be conditional on the flag.
    expect(shippedBlock).toMatch(/SHARE_CARD_ENABLED\s*\?/);
  });

  it('the scan is non-vacuous — it finds the titles it claims to read', () => {
    const titles = advertisedTitles();
    expect(titles).toContain('Unlimited Goals');
    expect(titles).toContain('CSV Export');
    expect(titles.length).toBeGreaterThanOrEqual(5);
  });
});
