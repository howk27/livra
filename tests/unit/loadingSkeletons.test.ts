import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guard — the loading state on the two tabs.
 *
 * Two things this pins, both learned while writing it:
 *
 * 1. The skeleton only stands in for an EMPTY screen. Both stores set their
 *    loading flag on a refetch, so an unguarded skeleton replaces the list the
 *    user is already looking at with grey blocks the moment they pull to
 *    refresh. Focus had the guard; Goals did not.
 * 2. The screen gutter is carried by the loading block itself. Neither scroll
 *    container has a horizontal gutter on these screens (design-decisions.md,
 *    2026-07-12 width bug), so a block without one goes full-bleed.
 */

const ROOT = join(__dirname, '../../');

const TABS: Array<[string, string, string]> = [
  // file, the loading condition, the style block that must carry the gutter
  ['app/(tabs)/focus.tsx', 'loading && activeCounters.length === 0', 'loadingState'],
  ['app/(tabs)/goals.tsx', 'isLoading && active.length === 0', 'loadingState'],
];

describe('tab loading skeletons', () => {
  it.each(TABS)('%s gates its skeleton on an empty list', (rel, condition) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    expect(src).toContain(condition);
  });

  it.each(TABS)('%s loading block carries the screen gutter', (rel, _cond, styleName) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const block = src.match(new RegExp(`\\b${styleName}:\\s*\\{([\\s\\S]*?)\\}`));
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/marginHorizontal:\s*spacing\.lg/);
  });

  it.each(TABS)('%s renders Skeleton, not a bare ActivityIndicator', (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    expect(src).toContain('<Skeleton');
    expect(src).not.toContain('ActivityIndicator');
  });

  it.each(TABS)('%s offers pull to refresh', (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    expect(src).toContain('<RefreshControl');
    // Its own flag — reusing the store's loading flag would trip the skeleton.
    expect(src).toMatch(/refreshing=\{refreshing\}/);
  });
});
