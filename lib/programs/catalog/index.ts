// lib/programs/catalog/index.ts
// The launch catalog (spec §2): engine ships with two excellent cards; Fitness
// On-Ramp and Calm Reset follow by OTA when their copy is ready (PG-9). Adding
// a card here is a content change, no code change.

import type { ProgramDefinition } from '../types';
import { sleepReset } from './sleepReset';
import { deepWorkMonth } from './deepWorkMonth';

export const PROGRAM_CATALOG: ProgramDefinition[] = [sleepReset, deepWorkMonth];

export const PROGRAM_BY_ID: Record<string, ProgramDefinition> = Object.fromEntries(
  PROGRAM_CATALOG.map((p) => [p.id, p]),
);
