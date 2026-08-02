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

  it('declares the surface via containerBackground(for: .widget)', () => {
    // The helper does the iOS 17+ container background. Since the light-theme
    // fix it is applied ONCE, at the entry view, with an explicitly resolved
    // ground — see the "explicit scheme" guard below for why.
    expect(views).toContain('containerBackground(color, for: .widget)');
    expect(views).toContain('widgetContainerBackground(WidgetPalette.bg(for: scheme))');
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
    expect(views).toContain('AllDoneOrEmpty(data: data, alignment: .center, compact: true)');
  });

  // THE BUILD-62 LIGHT-THEME BUG, PINNED SO IT CANNOT COME BACK.
  //
  // 057a18a made the widget follow the app's theme by overriding the
  // `.colorScheme` environment. That reaches every colour drawn INSIDE the
  // SwiftUI hierarchy — but `containerBackground(_:for:)` hands its colour to
  // WidgetKit, which paints the container outside it, so a dynamic UIColor
  // there resolved against the DEVICE appearance. Result on device: a
  // light-themed app on a dark phone rendered near-black ink on the near-black
  // dark ground. The ground must be resolved from an explicit scheme.
  it('resolves the container ground from an explicit scheme, not a dynamic colour', () => {
    expect(views).toMatch(/static func bg\(for scheme: ColorScheme\) -> Color/);
    // A `static let bg` is the regression: that form can only be a dynamic
    // colour, which is exactly what the container background cannot resolve.
    expect(views).not.toMatch(/static let bg\s*=/);
    expect(views).toMatch(/entry\.data\.colorSchemeOverride\s*\?\?\s*systemScheme/);
  });

  it('applies the container background once, at the entry view', () => {
    // Both family views used to carry their own copy. Two call sites means two
    // chances to reintroduce an unresolved ground.
    // Leading dot = a call site; the bare name is the helper's own declaration.
    const calls = views.match(/\.widgetContainerBackground\(/g) ?? [];
    expect(calls).toHaveLength(1);
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
    const from = views.indexOf('static func bg(for scheme');
    expect(from).toBeGreaterThan(-1);
    const body = views.slice(from, views.indexOf('}', from) + 1);
    expect(body).toContain('#15211D');
    expect(body).toContain('#F0EDE8');
    expect(body).not.toContain('#1C3830');
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

/**
 * Guard: the medium widget uses the frame it is given.
 *
 * Founder device report 2026-08-02: "too close, too much space unused" (active
 * state) and "completed state feels empty" (done state). Measured from the
 * screenshots, the content column filled ~77pt of a ~126pt content box — the
 * medium family rendered at roughly half scale, with the done state holding two
 * elements in it.
 */
describe('LivraWidget medium layout fills its frame', () => {
  const views = readFileSync(
    join(__dirname, '../../targets/LivraWidget/LivraWidget.swift'),
    'utf8',
  )
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');

  it('sizes the medium ring from measured height, not a constant', () => {
    // The regression is a hardcoded diameter back in MediumWidgetView.
    expect(views).toContain('GeometryReader');
    expect(views).toMatch(/min\(geo\.size\.height,\s*Self\.ringCap\)/);
    expect(views).toMatch(/GoalRingView\(goal: goal, diameter: diameter/);
  });

  it('gives the done state the same pill as the mark tile, so nothing re-arranges', () => {
    // Both must render a full-width rounded pill on an accent wash. If the done
    // state drops back to a bare row, the column jumps on the day's last tap.
    const pills = views.match(/RoundedRectangle\(cornerRadius: 12, style: \.continuous\)/g) ?? [];
    expect(pills.length).toBeGreaterThanOrEqual(2);
    expect(views).not.toMatch(/Spacer\(minLength: 0\)\s*\n\s*AllDoneOrEmpty/);
  });

  it('captions the done state with the day count', () => {
    expect(views).toContain('struct DayCountText');
    expect(views).toMatch(/DayCountText\(goal: goal\)/);
    // Gated on marks existing — an account with none must not read "0 / 7".
    expect(views).toMatch(/!data\.marks\.isEmpty,\s*let goal = data\.currentGoal/);
  });

  it('reads the unit off the snapshot instead of hardcoding "check-in days"', () => {
    // goals.tsx:262 only says "check-in days" when a commitment backs the
    // threshold; hardcoding it here would state a commitment that may not exist.
    expect(views).toContain('goal.progressUnit');
    expect(views).not.toContain('check-in days');
  });
});
