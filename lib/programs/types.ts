// lib/programs/types.ts
// Guided Programs (PG-1, spec docs/superpowers/specs/2026-08-30-guided-programs-design.md §3).
//
// A program card is CONTENT: hand-authored data, typed here, validated
// structurally by tests/unit/programCatalog.test.ts and held to the copy rules
// by tests/unit/copyDashRule.test.ts. Cards reference existing MARK_LIBRARY ids
// only; adding a program is a content change, never a code change.

/** The four launch domains (spec §2). Adding one here is a founder decision. */
export const PROGRAM_DOMAINS = ['sleep', 'fitness', 'focus', 'calm'] as const;
export type ProgramDomain = (typeof PROGRAM_DOMAINS)[number];

/** Target multiplier applied on top of pace when a stage is entered eased. */
export const DEFAULT_EASED_SCALE = 0.6;

export type ProgramStageMark = {
  /** A MARK_LIBRARY id (lib/suggestedCounters.ts). The guard test resolves it. */
  libraryId: string;
  /**
   * Desired per-week count at steady pace. For fixed/abstinence library marks
   * this MUST equal the library's frequency_recommended (a limit kept 5 days a
   * week is not a limit; the stage BAR carries progression instead) and the
   * guard test enforces it.
   */
  weeklyTarget: number;
  /** Per-day count override; absent = defaultDailyTargetForMarkId. */
  dailyTarget?: number;
};

export type ProgramStageCopy = {
  /** Shown entering the stage. */
  intro: string;
  /** Last week graded held. */
  held: string;
  /** Last week graded partial. */
  partial: string;
  /** Last week graded quiet (also the eased entry line; kind, never a demotion). */
  quiet: string;
  /** What Monday brings (the advance line). */
  advance: string;
};

export type ProgramStage = {
  /** e.g. 'Week 2 · Protect the morning' */
  name: string;
  /** The FULL desired mark set for the stage (spec §3). */
  marks: ProgramStageMark[];
  /** held = active days >= (scaled) daysRequired; partial = >=1 log; quiet = none. */
  bar: { daysRequired: number };
  copy: ProgramStageCopy;
  /** Target multiplier when this stage is entered eased. Default DEFAULT_EASED_SCALE. */
  easedScale?: number;
};

export type ProgramDefinition = {
  /** kebab-case; becomes goals.program_id. */
  id: string;
  title: string;
  tagline: string;
  domain: ProgramDomain;
  /** 3 to 8; stages.length must equal this (guard-enforced). */
  durationWeeks: number;
  /** One honest paragraph; becomes the goal description, so deriveWhy feeds the review quote. */
  whyItWorks: string;
  stages: ProgramStage[];
};
