import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * QC2-D acceptance guards — the creation pageSheet half-render fix.
 *
 * The device half-render (VD-6, re-opened as QC2-D) lived in
 * KeyboardAvoidingView: a keyboard-driven paddingBottom applied via
 * LayoutAnimation against a native pageSheet is the only stateful layout in
 * the creation flow that can stick at ~keyboard height (half the sheet).
 * The fix REMOVES the component; these guards keep the failure class out:
 *
 * 1. No KeyboardAvoidingView in either creation modal (all content is
 *    top-anchored; overflow scrolls).
 * 2. No raw `autoFocus` — keyboard entrance goes through useDeferredAutoFocus
 *    so it never overlaps the sheet presentation.
 * 3. Overflow is a ScrollView with keyboardShouldPersistTaps (taps on the AI
 *    hatch / links land while the keyboard is up).
 * 4. The dev-only half-render probe stays attached, so a regression is
 *    diagnosable from one Metro line.
 * 5. The deferred-focus fallback timer can never beat a live pageSheet
 *    transition (~500ms): it must stay >= 900ms.
 */

const ROOT = join(__dirname, '../../');

const CREATION_MODALS = ['app/goal/new.tsx', 'app/goal/suggest.tsx'];

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('creation pageSheet modals — half-render guards (QC2-D)', () => {
  it.each(CREATION_MODALS)('%s does not use KeyboardAvoidingView', (rel) => {
    expect(read(rel)).not.toMatch(/<KeyboardAvoidingView/);
  });

  it.each(CREATION_MODALS)('%s does not use raw autoFocus', (rel) => {
    expect(read(rel)).not.toMatch(/\bautoFocus\b\s*(=|\n|\/)/);
  });

  it.each(CREATION_MODALS)('%s defers focus behind the presentation transition', (rel) => {
    expect(read(rel)).toContain('useDeferredAutoFocus');
  });

  it.each(CREATION_MODALS)('%s scrolls overflow with taps persisting through the keyboard', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/<ScrollView/);
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
  });

  it.each(CREATION_MODALS)('%s keeps the dev-only half-render probe attached', (rel) => {
    const src = read(rel);
    expect(src).toContain('useHalfRenderProbe');
    expect(src).toContain('onLayout={onProbeLayout}');
  });

  it('deferred-focus fallback cannot beat a live pageSheet transition (>= 900ms)', () => {
    const src = read('hooks/useDeferredAutoFocus.ts');
    const delay = Number(src.match(/FALLBACK_DELAY_MS\s*=\s*(\d+)/)?.[1]);
    expect(delay).toBeGreaterThanOrEqual(900);
  });
});
