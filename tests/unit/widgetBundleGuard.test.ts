import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guard: no conditionals inside the WidgetBundle body.
 *
 * `if #available(...)` (or any `if`) in a @WidgetBundleBuilder body compiles
 * into WidgetBundleBuilder.buildLimitedAvailability / buildOptional, which
 * assertion-fails at runtime when iOS enumerates the bundle. The extension
 * then crash-loops (EXC_BREAKPOINT in LivraWidgetBundle.body.getter) and the
 * widget NEVER appears in the widget gallery — no error surfaces anywhere
 * except device crash logs. Root-caused 2026-07-19 from 52 on-device .ips
 * reports; the widget had been invisible since it shipped.
 *
 * Availability gating belongs on the Widget type as an @available attribute
 * (statically satisfied by the 16.0 deployment target), never as a runtime
 * branch in the bundle body.
 */
describe('LivraWidgetBundle gallery-crash guard', () => {
  const source = readFileSync(
    join(__dirname, '../../targets/LivraWidget/LivraWidgetBundle.swift'),
    'utf8',
  );
  // Strip // comments — the crash lives in code, and the file's own comment
  // explains the rule by naming the forbidden construct. Split on \r?\n and
  // rejoin with \n: a CRLF checkout leaves \r on each line, and in JS regex
  // `.` won't cross \r nor will `$` match before it, silently defeating the strip.
  const code = source
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

  it('bundle body contains no #available runtime checks', () => {
    expect(code).not.toContain('#available');
  });

  it('bundle body contains no conditional statements', () => {
    // Any `if ` / `guard ` / `switch ` inside this file means someone
    // reintroduced a builder conditional — the crash class this guards.
    const bodyMatch = code.match(/var body: some Widget \{([\s\S]*?)\n\}/);
    expect(bodyMatch).not.toBeNull();
    const body = bodyMatch![1];
    expect(body).not.toMatch(/\bif\b|\bguard\b|\bswitch\b/);
  });

  it('both widgets are unconditionally listed', () => {
    expect(source).toContain('LivraWidget()');
    expect(source).toContain('LivraLockScreenWidget()');
  });
});

/**
 * Guard: the widget is fully free — no Pro gate in the views.
 *
 * The redesign's branch source gated logging behind `if !data.isPro { "Upgrade
 * to Livra+…" }`, which walled the widget's core usability. Founder call
 * (2026-07-19): the widget is fully free — logging is not Pro-gated in-app
 * either, so the gate was pure widget-side invention. This locks it out for
 * good; if a real Pro perk is ever added it must not resurrect this copy or a
 * blanket `data.isPro` branch in the views.
 */
describe('LivraWidget views are fully free (no Pro gate)', () => {
  const views = readFileSync(
    join(__dirname, '../../targets/LivraWidget/LivraWidget.swift'),
    'utf8',
  );

  it('has no isPro gating branch in the widget views', () => {
    expect(views).not.toMatch(/if\s+!?\s*data\.isPro/);
  });

  it('has no upgrade/paywall copy in the widget views', () => {
    expect(views).not.toMatch(/Upgrade to Livra\+|Livra\+ to log/);
  });
});
