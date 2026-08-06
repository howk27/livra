// tests/unit/widgetIcons.test.ts
//
// The widget's glyph assets, and the contract that they show the SAME face the
// app shows.
//
// Before 2026-08-06 this file tested `categoryVisual` — a 13-glyph, one-per-
// CATEGORY table with the accent baked into each PNG. That module is gone: it
// was the mechanism that made 40 of 41 library marks wear a different icon in
// the widget than in the app. One of its assertions (`categoryVisual('gym')`
// resolves to the custom circle, "not in CATEGORY_MAP → custom") had pinned the
// namespace-collision bug as correct behaviour.

import * as fs from 'fs';
import * as path from 'path';
import { MARK_LIBRARY } from '../../lib/suggestedCounters';
import { allGlyphDefs, widgetAsset, MARK_GLYPH_DEFS } from '../../lib/markGlyphs';
import { resolveMarkFace, resolveGoalFace } from '../../lib/markCategoryResolve';

const ICONS_DIR = path.join(__dirname, '../../targets/LivraWidget/icons');
const TARGET_CONFIG = path.join(__dirname, '../../targets/LivraWidget/expo-target.config.js');

const manifest = JSON.parse(
  fs.readFileSync(path.join(ICONS_DIR, 'icons-manifest.json'), 'utf8'),
) as Record<string, { def: string; sha256: string; template?: boolean }>;

describe('widget glyph assets', () => {
  it('every bundled PNG matches the generator manifest (guards clipped/hand-edited assets)', () => {
    // The 2026-07 "icons render half way" device bug: PNGs committed with the
    // glyph clipped at ~62% canvas height. This byte pin — not the generator's
    // geometry smoke test — is what actually protects against a stale or
    // hand-edited asset, and it is why the geometry check was allowed to relax
    // when the set widened past 13 narrow glyphs.
    const crypto = require('crypto') as typeof import('crypto');
    const pngs = fs.readdirSync(ICONS_DIR).filter((f) => f.endsWith('.png'));
    expect(pngs.sort()).toEqual(Object.keys(manifest).sort());
    for (const file of pngs) {
      const sha = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(ICONS_DIR, file)))
        .digest('hex');
      expect(`${file}:${sha}`).toBe(`${file}:${manifest[file].sha256}`);
    }
  });

  it('the manifest covers exactly the registry glyph set — no missing, no stale', () => {
    const expected = allGlyphDefs().sort();
    const rendered = Object.values(manifest)
      .map((m) => m.def)
      .sort();
    expect(rendered).toEqual(expected);
  });

  it('every glyph is registered as an imageset in the widget target', () => {
    const targetConfig = fs.readFileSync(TARGET_CONFIG, 'utf8');
    for (const def of allGlyphDefs()) {
      const asset = widgetAsset(def);
      const file = `${asset.replace('livra_', '')}.png`;
      expect(`${asset}:exists`).toBe(
        `${asset}:${fs.existsSync(path.join(ICONS_DIR, file)) ? 'exists' : 'MISSING'}`,
      );
      expect(targetConfig).toContain(`${asset}: './icons/${file}'`);
    }
  });

  it('glyphs are COLOURLESS templates — the accent is data, tinted natively', () => {
    // If a future change bakes colour back in, one asset per (glyph x hue) comes
    // back and every accent tweak needs a paid native build again.
    for (const [file, entry] of Object.entries(manifest)) {
      expect(`${file}:${entry.template}`).toBe(`${file}:true`);
    }
    const swift = fs.readFileSync(
      path.join(__dirname, '../../targets/LivraWidget/LivraWidget.swift'),
      'utf8',
    );
    // Every Image() drawing a bundled livra_ asset must render as a template.
    const imageLines = swift
      .split('\n')
      .filter((l) => l.includes('Image(') && l.includes('livra_'));
    expect(imageLines.length).toBeGreaterThan(0);
    for (const line of imageLines) {
      const idx = swift.indexOf(line);
      const block = swift.slice(idx, idx + 400);
      expect(`${line.trim()} => templated`).toBe(
        `${line.trim()} => ${block.includes('.renderingMode(.template)') ? 'templated' : 'NOT TEMPLATED'}`,
      );
      expect(`${line.trim()} => tinted`).toBe(
        `${line.trim()} => ${block.includes('.foregroundStyle(') ? 'tinted' : 'NOT TINTED'}`,
      );
    }
  });
});

describe('app ↔ widget face parity', () => {
  it('every library mark resolves to its OWN glyph, not its category glyph', () => {
    // The headline regression: Water and Calories are both Health, so the widget
    // drew one identical drop for two marks the app draws differently.
    const faces = new Map<string, string>();
    for (const mark of MARK_LIBRARY) {
      const face = resolveMarkFace({ name: mark.name, emoji: mark.emoji });
      faces.set(mark.id, face.icon);
      // The asset must be the one the registry names for THIS mark — which the
      // parity guard separately proves is the same component the app renders.
      const expected = widgetAsset(MARK_GLYPH_DEFS[mark.id]);
      expect(`${mark.id} -> ${face.icon}`).toBe(`${mark.id} -> ${expected}`);
    }
    // 41 library marks must not collapse onto a handful of category glyphs.
    expect(new Set(faces.values()).size).toBe(MARK_LIBRARY.length);
  });

  it('two marks sharing a category still get different faces', () => {
    const water = resolveMarkFace({ name: 'Water', emoji: null });
    const calories = resolveMarkFace({ name: 'Calories', emoji: null });
    expect(water.icon).not.toBe(calories.icon);
    expect(water.accent).not.toBe(calories.accent);
  });

  it('an unresolvable mark falls back to the custom circle, in both renderers', () => {
    const face = resolveMarkFace({ name: 'Xyzzy', emoji: '🦄' });
    expect(face.icon).toBe('livra_circle');
  });

  it('a goal wears the glyph of its own words', () => {
    expect(resolveGoalFace({ title: 'Save $5k' }).icon).toBe('livra_piggy_bank');
    expect(resolveGoalFace({ title: 'Learn Spanish' }).icon).toBe('livra_globe_simple');
  });
});
