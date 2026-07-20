/**
 * Regenerates targets/LivraWidget/icons/*.png — the widget's category glyphs.
 *
 * Each PNG is the exact Phosphor DUOTONE glyph the app renders in-app
 * (components/ui/MarkRow.tsx CATEGORY_MAP), with the category accent baked in
 * (theme/tokens.ts categoryAccents): background layer at 0.2 opacity + solid
 * foreground, rasterized from phosphor-react-native's path data (viewBox
 * 0 0 256 256) onto a transparent 240x240 canvas.
 *
 * Run: node scripts/generate-widget-icons.js
 * Needs @resvg/resvg-js (not a dependency): npm i --no-save @resvg/resvg-js
 *
 * The 2026-07 "icons render half way" device bug was PNGs committed with the
 * glyph clipped at ~62% of the canvas — so after rendering, this script ASSERTS
 * the visible bounding box is vertically centered and clear of the canvas
 * edges, and fails loudly if any glyph comes out clipped again.
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

// asset file -> { phosphor def, accent } — MUST mirror lib/widgets/widgetIcons.ts
// (which mirrors MarkRow's CATEGORY_MAP) + theme/tokens.ts categoryAccents.
const ICONS = {
  'moon.png': { def: 'Moon', accent: '#6B8FA6' }, // recovery
  'pulse.png': { def: 'Pulse', accent: '#A0614A' }, // fitness
  'drop.png': { def: 'Drop', accent: '#4A8C7A' }, // health
  'heart.png': { def: 'Heart', accent: '#8A6B7B' }, // mindset
  'briefcase.png': { def: 'Briefcase', accent: '#4A6A8C' }, // deepWork
  'pencil.png': { def: 'PencilSimple', accent: '#7A4A8C' }, // creative
  'shield.png': { def: 'Shield', accent: '#8A7E6B' }, // discipline
  'users.png': { def: 'Users', accent: '#9E7B6B' }, // relationships
  'currency.png': { def: 'CurrencyDollar', accent: '#9E8A6B' }, // finance
  'envelope.png': { def: 'EnvelopeSimple', accent: '#4A7A8C' }, // email
  'calendar.png': { def: 'Calendar', accent: '#8C7A3A' }, // planning
  'book.png': { def: 'BookOpen', accent: '#7A4A8C' }, // creative (reading)
  'circle.png': { def: 'Circle', accent: '#6B7A6B' }, // custom
};

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

function toSvg(paths, accent) {
  const body = paths
    .map(({ d, isBackground }) =>
      isBackground
        ? `<path d="${d}" fill="${accent}" fill-opacity="${DUOTONE_OPACITY}"/>`
        : `<path d="${d}" fill="${accent}"/>`,
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
  // Phosphor glyphs are optically centered inside the 256 viewBox with inherent
  // margins — a healthy render never touches an edge, and the vertical margins
  // are roughly symmetric. The clipped-PNG bug had bottomGap ~90px vs topGap ~10.
  const problems = [];
  if (Math.min(topGap, bottomGap, leftGap, rightGap) < 2) {
    problems.push(`touches canvas edge (gaps t${topGap} b${bottomGap} l${leftGap} r${rightGap})`);
  }
  if (Math.abs(topGap - bottomGap) > SIZE * 0.15) {
    problems.push(`vertically off-center (top gap ${topGap}px vs bottom gap ${bottomGap}px)`);
  }
  if (problems.length) {
    throw new Error(`${name}: glyph looks clipped — ${problems.join('; ')}`);
  }
}

// Manifest ties the committed PNG bytes to a render that PASSED the clip
// assertion — tests/unit/widgetIcons.test.ts verifies the hashes, so a
// hand-edited or stale-broken PNG fails CI instead of failing on device.
const manifest = {};
for (const [file, { def, accent }] of Object.entries(ICONS)) {
  const svg = toSvg(duotonePaths(def), accent);
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
    accent,
    sha256: crypto.createHash('sha256').update(png).digest('hex'),
    bbox,
  };
  console.log(`ok ${file} (${def}, ${accent})`);
}
fs.writeFileSync(
  path.join(OUT_DIR, 'icons-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(`\n${Object.keys(ICONS).length} widget icons regenerated in ${OUT_DIR}`);
