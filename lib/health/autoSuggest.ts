import type { HealthKitType } from './healthTypes';

const RULES: [HealthKitType, RegExp][] = [
  ['sleep',     /sleep|recovery/i],
  ['running',   /run|running/i],
  ['workout',   /workout|exercise|strength|gym/i],
  ['hydration', /hydration|water|vitality/i],
  ['mindful',   /mindful|meditation|breathe/i],
  ['steps',     /steps|walk|walking/i],
];

export function detectHealthKitType(markName: string): HealthKitType | null {
  for (const [type, pattern] of RULES) {
    if (pattern.test(markName)) return type;
  }
  return null;
}
