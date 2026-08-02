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

/**
 * Guard: the iOS 17 container-background migration stays adopted.
 *
 * The redesign shipped with the iOS 16 pattern (`.background()` on the content +
 * manual `.padding()`). On iOS 17+ that leaves the system's default dark surface
 * bleeding at the widget's corners/margins (content background never reaches the
 * container edge) AND double-pads the content against the system's default
 * content margins, clipping the ring + tiles. Root-caused 2026-07-20 from a
 * build-48 device report ("dark corners exposed", "half rendered icons/elements").
 *
 * Fix = declare the forest fill as the CONTAINER background + opt out of the
 * system content margins (we own our padding). This locks both in so a future
 * edit can't silently regress to the content-only `.background(WidgetPalette.bg)`.
 */
describe('LivraWidget iOS 17 container-background migration', () => {
  const views = readFileSync(
    join(__dirname, '../../targets/LivraWidget/LivraWidget.swift'),
    'utf8',
  );

  it('declares the forest fill via containerBackground(for: .widget)', () => {
    // The helper does the iOS 17+ container background; both views call it with
    // the forest fill.
    expect(views).toContain('containerBackground(color, for: .widget)');
    expect(views).toContain('widgetContainerBackground(WidgetPalette.bg)');
  });

  it('opts out of the system content margins', () => {
    expect(views).toContain('.contentMarginsDisabled()');
  });

  it('no longer paints the forest fill as a content-only background', () => {
    // The old bug: `.background(WidgetPalette.bg)` on the content view. The iOS 16
    // fallback lives inside the widgetContainerBackground helper as `background(color)`
    // (no `WidgetPalette.bg` literal), so this literal must not reappear as a
    // content background on the Small/Medium views.
    expect(views).not.toContain('.background(WidgetPalette.bg)');
  });
});

describe('LivraWidget is theme-aware (light + dark surfaces)', () => {
  const rawViews = readFileSync(
    join(__dirname, '../../targets/LivraWidget/LivraWidget.swift'),
    'utf8',
  );

  // Swift comments stripped before any colour assertion. The palette is heavily
  // commented and those comments QUOTE the hexes they explain, so a plain
  // `toContain` scan is satisfied by prose — proven live on 2026-08-02, when
  // reverting the dark surface failed only the line-based guard below while this
  // block stayed green off a comment. That is the exact class of dead guard
  // docs/PROJECT-CONTEXT.md warns about; do not scan raw source for a hex here.
  const views = rawViews
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');

  it('strips comments before scanning, so prose cannot satisfy a colour assertion', () => {
    expect(rawViews).toMatch(/colorsLight\.forest/i); // prose naming the old value
    expect(views).not.toMatch(/colorsLight\.forest/i);
    expect(views.length).toBeLessThan(rawViews.length);
  });

  // Founder ruling 2026-08-02: the widget follows the APP's theme. Swift only
  // compiles at EAS, so these are source scans — but over STRIPPED source, so
  // the explanatory comments cannot satisfy them.
  it('overrides the colorScheme environment from the snapshot theme', () => {
    expect(views).toContain('func widgetColorScheme');
    expect(views).toMatch(/environment\(\\?\.colorScheme,\s*scheme\)/);
    expect(views).toContain('entry.data.colorSchemeOverride');
  });

  it('drops the redundant goal glyph from the ring', () => {
    // The ring must no longer render the goal's own icon; the mark tile in
    // LogMarkLabel is the only glyph left. `goal.icon` reaching an Image() is
    // the regression.
    expect(views).not.toMatch(/Image\(goal\.icon/);
  });

  it('centers the done row on Small, where the ring above it is centered', () => {
    expect(views).toContain('AllDoneOrEmpty(data: data, alignment: .center)');
  });

  it('resolves surface + ink per color scheme via a dynamic UIColor', () => {
    expect(views).toMatch(/UIColor\s*\{/); // trait-based dynamic color
    expect(views).toContain('#F0EDE8'); // light surface
    expect(views).toContain('#15211D'); // dark surface = colorsDark.linen
    expect(views).toContain('#1A1A18'); // light ink
  });

  // THIS GUARD PREVIOUSLY ENCODED THE BUG: it asserted the dark surface was
  // "#1C3830", which is colorsLight.forest — a light-theme card/button colour
  // used as a dark page background. The founder saw it as "the widget stays
  // green". Asserting the string alone cannot catch the regression, because
  // #1C3830 legitimately remains the LIGHT accent on the line below. So this
  // reads the `bg` declaration specifically.
  it('does not paint the light-theme forest as the dark surface', () => {
    const bgLine = views.split('\n').find((l) => /static let bg\s*=/.test(l));
    expect(bgLine).toBeDefined();
    expect(bgLine).toContain('dark: "#15211D"');
    expect(bgLine).not.toContain('#1C3830');
  });

  it('keeps the sanctioned amber→ember ring in both themes', () => {
    expect(views).toContain('#C8913F'); // light ring end
    expect(views).toContain('#E0B36A'); // dark ring start
  });

  it('resolves the ring-track opacity per theme (not a shared flat value)', () => {
    expect(views).toMatch(/opacity\(0\.12\)/); // light ring track
    expect(views).toMatch(/opacity\(0\.14\)/); // dark ring track
  });

  it('still renders the current mark via the queue, not a fixed index', () => {
    expect(views).toMatch(/currentMark/);
    expect(views).toMatch(/currentGoal/);
  });
});
