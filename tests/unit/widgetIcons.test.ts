import * as fs from 'fs';
import * as path from 'path';
import { categoryVisual } from '../../lib/widgets/widgetIcons';
import { categoryAccents } from '../../theme/tokens';

describe('categoryVisual', () => {
  it('maps known categories to their glyph asset + accent', () => {
    expect(categoryVisual('Recovery')).toEqual({ icon: 'livra_moon', accent: categoryAccents.recovery });
    expect(categoryVisual('Health')).toEqual({ icon: 'livra_drop', accent: categoryAccents.health });
    expect(categoryVisual('Finance')).toEqual({ icon: 'livra_currency', accent: categoryAccents.finance });
  });

  it('maps legacy lowercase category keys', () => {
    expect(categoryVisual('sleep')).toEqual({ icon: 'livra_moon', accent: categoryAccents.recovery });
    expect(categoryVisual('water')).toEqual({ icon: 'livra_drop', accent: categoryAccents.health });
    expect(categoryVisual('planning')).toEqual({ icon: 'livra_calendar', accent: categoryAccents.planning });
  });

  it('falls back to custom for unknown / empty categories (parity with MarkRow)', () => {
    const custom = { icon: 'livra_circle', accent: categoryAccents.custom };
    expect(categoryVisual('gym')).toEqual(custom); // not in CATEGORY_MAP → custom
    expect(categoryVisual('totally-unknown')).toEqual(custom);
    expect(categoryVisual(undefined)).toEqual(custom);
    expect(categoryVisual(null)).toEqual(custom);
    expect(categoryVisual('')).toEqual(custom);
  });

  it('every bundled PNG matches the generator manifest (guards clipped/hand-edited assets)', () => {
    // The 2026-07 "icons render half way" device bug: PNGs committed with the
    // glyph clipped at ~62% canvas height. scripts/generate-widget-icons.js
    // only writes the manifest after its bounding-box clip assertion passes,
    // so bytes-match-manifest ⇒ the asset came from a verified render.
    const crypto = require('crypto') as typeof import('crypto');
    const iconsDir = path.join(__dirname, '../../targets/LivraWidget/icons');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(iconsDir, 'icons-manifest.json'), 'utf8'),
    ) as Record<string, { sha256: string }>;
    const pngs = fs.readdirSync(iconsDir).filter((f) => f.endsWith('.png'));
    expect(pngs.sort()).toEqual(Object.keys(manifest).sort());
    for (const file of pngs) {
      const sha = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(iconsDir, file)))
        .digest('hex');
      expect(`${file}:${sha}`).toBe(`${file}:${manifest[file].sha256}`);
    }
  });

  it('every mapped glyph asset has a bundled PNG and a target images entry', () => {
    const keys = [
      'Recovery', 'Fitness', 'Health', 'Mindset', 'Deep Work', 'Creative',
      'Discipline', 'Relationships', 'Finance', 'email', 'planning', 'reading', 'custom',
    ];
    const iconsDir = path.join(__dirname, '../../targets/LivraWidget/icons');
    const targetConfig = fs.readFileSync(
      path.join(__dirname, '../../targets/LivraWidget/expo-target.config.js'),
      'utf8',
    );
    for (const key of keys) {
      const { icon } = categoryVisual(key);
      const file = icon.replace('livra_', '') + '.png';
      expect(fs.existsSync(path.join(iconsDir, file))).toBe(true);
      expect(targetConfig).toContain(`${icon}: './icons/${file}'`);
    }
  });
});
