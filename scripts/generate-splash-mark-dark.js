/**
 * Regenerates assets/Livra-Splash-Mark-Dark.png — the DARK-MODE splash mark.
 *
 * The light splash (assets/Livra-Splash-Mark.png) is the Livra mark in tone
 * #121212 on the linen background #F0EDE8. In dark mode the splash background
 * becomes colorsDark.linen (#15211D), where a #121212 mark is invisible — so
 * this script re-tones the SAME mark to colorsDark.inkDark (#F0EDE8), the
 * app's dark-mode foreground. Light = dark mark on linen; dark = linen mark on
 * dark. Same silhouette, inverted tone.
 *
 * Run: node scripts/generate-splash-mark-dark.js
 * Needs pngjs (already a transitive dependency).
 *
 * The source carries its shape ENTIRELY in the alpha channel (RGB is a flat
 * #121212 across every pixel), so re-toning is lossless: overwrite RGB, keep
 * alpha byte-for-byte. Both invariants are ASSERTED below — this is the same
 * class of asset bug as the 2026-07 "splash black square" (an icon asset with
 * an opaque background used where a transparent mark was needed) and the
 * "icons render half way" clipped PNGs, so it fails here, not on device.
 */

/* global __dirname */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = path.join(__dirname, '../assets/Livra-Splash-Mark.png');
const OUT = path.join(__dirname, '../assets/Livra-Splash-Mark-Dark.png');

// theme/tokens.ts colorsDark.inkDark — the dark-mode foreground tone.
const TONE = { r: 0xf0, g: 0xed, b: 0xe8 };
// theme/tokens.ts colors — the tone the light source mark is drawn in.
const SOURCE_TONE = { r: 0x12, g: 0x12, b: 0x12 };

const src = PNG.sync.read(fs.readFileSync(SRC));
const { width, height } = src;

// Assert the source is the flat-tone + alpha-shape asset this script assumes.
// If someone swaps in a full-color or opaque-background mark, a blind RGB
// overwrite would silently destroy it — so refuse instead.
let visiblePixels = 0;
for (let i = 0; i < src.data.length; i += 4) {
  if (src.data[i + 3] === 0) continue;
  visiblePixels++;
  const { data } = src;
  if (
    data[i] !== SOURCE_TONE.r ||
    data[i + 1] !== SOURCE_TONE.g ||
    data[i + 2] !== SOURCE_TONE.b
  ) {
    const px = (i / 4) | 0;
    throw new Error(
      `source is not a flat-tone mark: pixel (${px % width}, ${(px / width) | 0}) is ` +
        `rgb(${data[i]},${data[i + 1]},${data[i + 2]}), expected the #121212 mark tone. ` +
        `Re-tone by hand or update SOURCE_TONE.`,
    );
  }
}
if (visiblePixels === 0) {
  throw new Error('source mark is fully transparent');
}

const out = new PNG({ width, height });
for (let i = 0; i < src.data.length; i += 4) {
  out.data[i] = TONE.r;
  out.data[i + 1] = TONE.g;
  out.data[i + 2] = TONE.b;
  out.data[i + 3] = src.data[i + 3]; // silhouette preserved exactly
}

// Assert the silhouette survived: every alpha byte identical to the source.
for (let i = 3; i < src.data.length; i += 4) {
  if (out.data[i] !== src.data[i]) {
    throw new Error(`alpha drift at byte ${i} — silhouette changed`);
  }
}

const png = PNG.sync.write(out);
fs.writeFileSync(OUT, png);

console.log(`ok ${path.basename(OUT)} (${width}x${height})`);
console.log(`   tone  #121212 -> #${TONE.r.toString(16)}${TONE.g.toString(16)}${TONE.b.toString(16)}`);
console.log(`   visible pixels ${visiblePixels}`);
console.log(`   sha256 ${crypto.createHash('sha256').update(png).digest('hex')}`);
