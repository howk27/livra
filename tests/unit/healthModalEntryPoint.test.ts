/**
 * Founder ruling 2026-07-31: the per-mark Apple Health connect modal gets an
 * entry point. It had been orphaned since before M9 — the picker, both
 * handlers and the binding state all existed with ZERO callsites, so the
 * feature was unreachable dead weight in every build so far.
 *
 * Comment-stripped scan pinning the wiring so it cannot silently orphan
 * again. Confirmed 2/2 red against the orphaned code before being kept.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, '../../app/mark/[id]/index.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('mark detail wires the Apple Health modal', () => {
  test('a connect entry point invokes handleConnectHealth', () => {
    expect(source).toMatch(/onPress=\{[^}]*handleConnectHealth/);
  });

  test('a bound mark offers disconnect via handleDisconnectHealth', () => {
    expect(source).toMatch(/onPress=\{[^}]*handleDisconnectHealth/);
  });
});
