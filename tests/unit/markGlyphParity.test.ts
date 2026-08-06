// tests/unit/markGlyphParity.test.ts
//
// THE GUARD THAT WAS MISSING. Before 2026-08-06 the widget tests pinned
// widget↔CATEGORY_MAP category parity and PNG byte integrity — but nothing
// pinned the invariant that actually matters: that a given mark renders the
// SAME face in the app and in the widget. So 40 of 41 library marks diverged
// silently and shipped to a device.
//
// Deliberately does NOT mock phosphor-react-native: the first test compares
// COMPONENT IDENTITY (the real export vs the real MARK_LIBRARY entry), which a
// mock would reduce to a vacuous string match. This repo has shipped four
// guards that measured nothing; this one resolves the actual module.

import * as fs from 'fs';
import * as path from 'path';
import * as Phosphor from 'phosphor-react-native';
import { MARK_LIBRARY } from '../../lib/suggestedCounters';
import {
  MARK_GLYPH_DEFS,
  CATEGORY_GLYPH_DEFS,
  FALLBACK_GLYPH_DEF,
  widgetAsset,
  allGlyphDefs,
} from '../../lib/markGlyphs';

const phosphorExports = Phosphor as unknown as Record<string, unknown>;

describe('mark glyph registry ↔ MARK_LIBRARY', () => {
  it('covers every library id, with no extra keys', () => {
    const libraryIds = MARK_LIBRARY.map((m) => m.id).sort();
    expect(Object.keys(MARK_GLYPH_DEFS).sort()).toEqual(libraryIds);
  });

  it('names the SAME component the library entry holds (identity, not a string)', () => {
    for (const mark of MARK_LIBRARY) {
      const def = MARK_GLYPH_DEFS[mark.id];
      expect(def).toBeDefined();
      // phosphor exports `${def}Icon`; the def FILE is the bare name.
      const exported = phosphorExports[`${def}Icon`] ?? phosphorExports[def];
      expect(`${mark.id}:${def}:resolved`).toBe(`${mark.id}:${def}:${exported ? 'resolved' : 'MISSING'}`);
      expect(`${mark.id} -> ${def}`).toBe(
        `${mark.id} -> ${exported === mark.icon ? def : 'DIFFERENT COMPONENT'}`,
      );
    }
  });

  it('every registry def has a Phosphor def file to render from', () => {
    const defsDir = path.join(__dirname, '../../node_modules/phosphor-react-native/src/defs');
    for (const def of allGlyphDefs()) {
      expect(`${def}:${fs.existsSync(path.join(defsDir, `${def}.tsx`))}`).toBe(`${def}:true`);
    }
  });
});

describe('category fallback glyphs ↔ MarkRow CATEGORY_MAP', () => {
  // Source-scanned rather than imported: MarkRow is a component module and
  // pulling it in drags react-native rendering into a data test. Comments are
  // stripped first — this repo has shipped THREE guards that matched a comment
  // instead of code.
  const markRowSrc = fs
    .readFileSync(path.join(__dirname, '../../components/ui/MarkRow.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const mapBlock = markRowSrc.slice(
    markRowSrc.indexOf('CATEGORY_MAP: Record'),
    markRowSrc.indexOf('interface MarkRowProps'),
  );

  it('has an entry for every CATEGORY_MAP key, and no extras', () => {
    const keys = [...mapBlock.matchAll(/^\s+'?([A-Za-z ]+?)'?:\s+\{\s+Icon/gm)].map((m) =>
      m[1].trim(),
    );
    expect(keys.length).toBeGreaterThan(0);
    expect(Object.keys(CATEGORY_GLYPH_DEFS).sort()).toEqual(keys.sort());
  });

  it('names the same glyph CATEGORY_MAP renders for that key', () => {
    const rows = [...mapBlock.matchAll(/^\s+'?([A-Za-z ]+?)'?:\s+\{\s+Icon:\s+([A-Za-z]+)/gm)];
    expect(rows.length).toBeGreaterThan(0);
    for (const [, rawKey, component] of rows) {
      const key = rawKey.trim();
      // MarkRow imports `CircleIcon as CircleIcon`-style aliases; compare on the
      // bare glyph name so an alias rename cannot silently pass.
      const expected = CATEGORY_GLYPH_DEFS[key];
      expect(`${key}=${component.replace(/Icon$/, '')}`).toBe(`${key}=${expected}`);
    }
  });
});

describe('widget asset keys', () => {
  it('derives snake_case asset names', () => {
    expect(widgetAsset('MoonStars')).toBe('livra_moon_stars');
    expect(widgetAsset('Drop')).toBe('livra_drop');
    expect(widgetAsset('CurrencyCircleDollar')).toBe('livra_currency_circle_dollar');
  });

  it('produces a unique asset per def (no two glyphs collide on one PNG)', () => {
    const defs = allGlyphDefs();
    const assets = defs.map(widgetAsset);
    expect(new Set(assets).size).toBe(defs.length);
  });

  it('includes the custom fallback', () => {
    expect(allGlyphDefs()).toContain(FALLBACK_GLYPH_DEF);
  });
});
