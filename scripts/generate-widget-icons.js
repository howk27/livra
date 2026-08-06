/**
 * Regenerates targets/LivraWidget/icons/*.png — the widget's glyph set.
 *
 * ONE PNG PER PHOSPHOR GLYPH, COLOURLESS. Each is the exact duotone glyph the
 * app renders in-app, rasterized from phosphor-react-native's path data
 * (viewBox 0 0 256 256) onto a transparent 240x240 canvas — but drawn in WHITE,
 * with the duotone ratio (0.2 background / 1.0 foreground) carried in the ALPHA
 * channel. The widget tints at runtime via
 * `.renderingMode(.template).foregroundStyle(accent)`.
 *
 * Before 2026-08-06 this wrote 13 CATEGORY glyphs with the accent baked in, so
 * the widget could only ever show a mark's category — 40 of 41 library marks
 * wore a different face there than in the app. The set is now derived from
 * lib/markGlyphs.ts (every library glyph + the category fallbacks) and the
 * colour is data, so re-tinting never needs another native build.
 *
 * Run: node scripts/generate-widget-icons.js
 * Needs @resvg/resvg-js (not a dependency): npm i --no-save @resvg/resvg-js
 *
 * After running, add any NEW asset to targets/LivraWidget/expo-target.config.js
 * — tests/unit/widgetIcons.test.ts fails until every glyph is registered there.
 */

/* global __dirname */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const SIZE = 240;
const DUOTONE_OPACITY = 0.2;
const DEFS_DIR = path.join(__dirname, '../node_modules/phosphor-react-native/src/defs');
const OUT_DIR = path.join(__dirname, '../targets/LivraWidget/icons');

// THE GLYPH SET IS DERIVED, NOT LISTED HERE (2026-08-06).
//
// It used to be a hand-kept table of 13 category glyphs with the accent BAKED
// into each PNG. That is what made the widget category-shaped: the app drew a
// mark's own glyph in its own hue, the widget could only draw its category's.
//
// Two changes:
//  1. The set now comes from lib/markGlyphs.ts — every library mark's glyph
//     plus the category fallbacks, ~51 defs. Parsed from that file rather than
//     duplicated, and tests/unit/widgetIcons.test.ts asserts the manifest covers
//     `allGlyphDefs()` exactly, so the two cannot drift.
//  2. Glyphs render COLOURLESS (white, with the duotone ratio carried in the
//     ALPHA channel). The widget tints them at runtime with
//     `.renderingMode(.template).foregroundStyle(accent)`, and the accent it
//     uses already travels in the snapshot as data. So an accent change is a JS
//     change forever after — never another paid native build — and one PNG
//     serves a glyph in every hue instead of one PNG per (glyph x colour).
const GLYPH_SOURCE = path.join(__dirname, '../lib/markGlyphs.ts');

function defsFromRegistry() {
  const src = fs.readFileSync(GLYPH_SOURCE, 'utf8');
  const defs = new Set();
  for (const record of ['MARK_GLYPH_DEFS', 'CATEGORY_GLYPH_DEFS']) {
    const start = src.indexOf(`export const ${record}`);
    if (start === -1) throw new Error(`${record} not found in ${GLYPH_SOURCE}`);
    const body = src.slice(start, src.indexOf('};', start));
    for (const m of body.matchAll(/:\s*'([A-Za-z]+)'/g)) defs.add(m[1]);
  }
  const fallback = src.match(/FALLBACK_GLYPH_DEF\s*=\s*'([A-Za-z]+)'/);
  if (fallback) defs.add(fallback[1]);
  if (defs.size === 0) throw new Error('no glyph defs parsed — registry format changed');
  return [...defs].sort();
}

/** `MoonStars` -> `moon_stars` (mirrors widgetAsset() in lib/markGlyphs.ts). */
function assetBase(def) {
  return def.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function duotonePaths(defName) {
  const src = fs.readFileSync(path.join(DEFS_DIR, `${defName}.tsx`), 'utf8');
  const section = src.match(/'duotone',([\s\S]*?)\n {2}\],/);
  if (!section) throw new Error(`${defName}: no duotone section found`);
  const paths = [];
  const pathRe = /<Path\s+([\s\S]*?)\/>/g;
  let m;
  while ((m = pathRe.exec(section[1])) !== null) {
    const attrs = m[1];
    const d = attrs.match(/d="([^"]+)"/);
    if (!d) throw new Error(`${defName}: Path without d attribute`);
    paths.push({ d: d[1], isBackground: attrs.includes('duotoneOpacity') });
  }
  if (paths.length === 0) throw new Error(`${defName}: no duotone paths`);
  return paths;
}

function toSvg(paths) {
  // White, with the duotone ratio in ALPHA. SwiftUI's template rendering keeps
  // the alpha and replaces the colour, so this reproduces the duotone exactly
  // in whatever accent the snapshot carries.
  const body = paths
    .map(({ d, isBackground }) =>
      isBackground
        ? `<path d="#FFF_D" fill="#FFFFFF" fill-opacity="${DUOTONE_OPACITY}"/>`.replace('#FFF_D', d)
        : `<path d="#FFF_D" fill="#FFFFFF"/>`.replace('#FFF_D', d),
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${SIZE}" height="${SIZE}">${body}</svg>`;
}

/** Alpha bounding box of the rendered RGBA buffer. */
function visibleBBox(pixels, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('empty render');
  return { minX, minY, maxX, maxY };
}

function assertNotClipped(name, bbox) {
  const topGap = bbox.minY;
  const bottomGap = SIZE - 1 - bbox.maxY;
  const leftGap = bbox.minX;
  const rightGap = SIZE - 1 - bbox.maxX;
  // WHAT THIS CAN AND CANNOT PROVE — read before tightening it again.
  //
  // The old rule (no gap < 2px, vertical skew < 15%) held only because the
  // original set was 13 narrow, symmetric glyphs. Across the full library it
  // rejects CORRECT renders: Barbell spans the whole 256 viewBox (l0 r0), and
  // Phosphor draws Cigarette high in its box (t15 b60). Those are the artwork,
  // not a clipping bug, and we do not control the artwork.
  //
  // The 2026-07 "renders half way" bug (topGap ~10 vs bottomGap ~90) is NOT
  // cleanly separable from legitimate asymmetry by ratio alone — Cigarette's
  // real geometry sits close to the bug's. Pretending otherwise would give a
  // guard that fails honest renders and would be loosened under pressure.
  //
  // So this now catches only GROSS failure — empty, tiny, or degenerate output.
  // The real protection against a stale or hand-edited PNG is the sha256
  // manifest verified by tests/unit/widgetIcons.test.ts (bytes must equal a
  // render that passed this script), plus the coverage test asserting the
  // manifest holds exactly `allGlyphDefs()`. Those are byte-exact; this is a
  // smoke test.
  const problems = [];
  const width = bbox.maxX - bbox.minX + 1;
  const height = bbox.maxY - bbox.minY + 1;
  if (Math.max(width, height) < SIZE * 0.5) {
    problems.push(`glyph too small (${width}x${height} on a ${SIZE}px canvas)`);
  }
  if (topGap < 0 || bottomGap < 0 || leftGap < 0 || rightGap < 0) {
    problems.push(`bbox outside canvas (t${topGap} b${bottomGap} l${leftGap} r${rightGap})`);
  }
  if (problems.length) {
    throw new Error(`${name}: glyph looks clipped — ${problems.join('; ')}`);
  }
}

// Manifest ties the committed PNG bytes to a render that PASSED the clip
// assertion — tests/unit/widgetIcons.test.ts verifies the hashes, so a
// hand-edited or stale-broken PNG fails CI instead of failing on device.
const manifest = {};
const defs = defsFromRegistry();
for (const def of defs) {
  const file = `${assetBase(def)}.png`;
  const svg = toSvg(duotonePaths(def));
  const rendered = new Resvg(svg, {
    fitTo: { mode: 'width', value: SIZE },
    background: 'rgba(0,0,0,0)',
  }).render();
  if (rendered.width !== SIZE || rendered.height !== SIZE) {
    throw new Error(`${file}: rendered ${rendered.width}x${rendered.height}, expected ${SIZE}x${SIZE}`);
  }
  const bbox = visibleBBox(rendered.pixels, rendered.width, rendered.height);
  assertNotClipped(file, bbox);
  const png = rendered.asPng();
  fs.writeFileSync(path.join(OUT_DIR, file), png);
  manifest[file] = {
    def,
    template: true,
    sha256: crypto.createHash('sha256').update(png).digest('hex'),
    bbox,
  };
  console.log(`ok ${file} (${def})`);
}

// Stale PNGs from the old 13-glyph, accent-baked set would still be bundled and
// would still pass a bytes-match on their own manifest entry, so they are
// removed explicitly rather than left to rot in the target.
for (const stale of fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png') && !manifest[f])) {
  fs.unlinkSync(path.join(OUT_DIR, stale));
  console.log(`removed stale ${stale}`);
}

fs.writeFileSync(
  path.join(OUT_DIR, 'icons-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(`\n${defs.length} widget icons regenerated in ${OUT_DIR}`);
