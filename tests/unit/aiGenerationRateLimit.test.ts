import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ai-goal-generation runs on Deno and cannot be imported here, so this guards
 * the one property of it that costs real money if it drifts: THE ORDER OF THE
 * GATES. Everything after the rate-limit claim can call OpenAI; everything
 * before it must be free.
 *
 * Source-position assertions, not prose matching. This repo has twice shipped
 * guards that matched across an apostrophe in a comment and measured nothing —
 * so these compare indices of code tokens, and every one of them was confirmed
 * to fail with the gate moved or deleted before being kept.
 */
const SOURCE = readFileSync(
  join(__dirname, '../../supabase/functions/ai-goal-generation/index.ts'),
  'utf8',
);

/*
 * MATCH THE CALL SITE, NOT THE NAME. An earlier version of this file searched
 * for the bare string 'claim_ai_generation_slot' — and the comment ABOVE the
 * gate mentions that name, so deleting the gate outright left all eleven tests
 * green. Caught by deleting it and watching nothing fail. That is the third
 * time in this repo a source-scanning guard has measured a comment instead of
 * the code, so: the token here is the rpc invocation itself.
 */
const claimAt = SOURCE.indexOf("admin.rpc('claim_ai_generation_slot'");
const openAiCallAt = SOURCE.indexOf('await callOpenAI(');
const cacheAt = SOURCE.indexOf("from('ai_goal_packages')");
const entitlementAt = SOURCE.indexOf("select('pro_unlocked, ai_uses_count')");

describe('ai-goal-generation rate limiting', () => {
  it('claims a slot at all', () => {
    expect(claimAt).toBeGreaterThan(-1);
  });

  /*
   * Every ordering assertion re-asserts `> -1` on BOTH sides first. Without
   * that, deleting the gate sets claimAt to -1 and `-1 < openAiCallAt` passes —
   * the guard would go green on the exact change it exists to catch. Found by
   * trying to break it rather than by reading it.
   */
  it('claims the slot BEFORE any model call — the whole point of the gate', () => {
    expect(claimAt).toBeGreaterThan(-1);
    expect(openAiCallAt).toBeGreaterThan(-1);
    expect(claimAt).toBeLessThan(openAiCallAt);
  });

  it('claims the slot AFTER the cache check — a cache hit calls no model', () => {
    expect(claimAt).toBeGreaterThan(-1);
    expect(cacheAt).toBeGreaterThan(-1);
    expect(cacheAt).toBeLessThan(claimAt);
  });

  it('claims the slot AFTER the entitlement read — an ineligible user is told so, not told to wait', () => {
    expect(claimAt).toBeGreaterThan(-1);
    expect(entitlementAt).toBeGreaterThan(-1);
    expect(entitlementAt).toBeLessThan(claimAt);
  });

  /**
   * FAIL CLOSED. If the limiter errors we do not know what this user has spent,
   * and the unknown case is the expensive one. This also covers the deploy
   * window: until the migration is applied the function does not exist, and
   * every call lands on this branch.
   */
  it('treats a limiter error as a refusal, not as permission', () => {
    const errorBranch = SOURCE.indexOf('if (slotError)');
    expect(errorBranch).toBeGreaterThan(-1);
    expect(openAiCallAt).toBeGreaterThan(-1);
    expect(errorBranch).toBeLessThan(openAiCallAt);
    const afterBranch = SOURCE.slice(errorBranch, errorBranch + 400);
    expect(afterBranch).toContain('return json(');
  });

  it('refuses when the limiter says not allowed', () => {
    const denyBranch = SOURCE.indexOf('if (!claim?.allowed)');
    expect(denyBranch).toBeGreaterThan(-1);
    expect(openAiCallAt).toBeGreaterThan(-1);
    expect(denyBranch).toBeLessThan(openAiCallAt);
  });

  /**
   * THE WINDOW IS PART OF THE ANSWER. claim_ai_generation_slot has always
   * returned `scope`, and this handler used to throw it away and send a bare
   * `rate_limited` — whose copy says "give it a few minutes". True of the hourly
   * cap, a LIE about the daily one, which resets tomorrow. A free user who hit
   * 15/day was told to wait minutes and would keep retrying for hours.
   */
  it('tells the client WHICH window was hit, instead of discarding scope', () => {
    expect(SOURCE).toMatch(/claim\?\.scope === 'day'/);
    expect(SOURCE).toContain("'rate_limited_day'");
    expect(SOURCE).toContain("'rate_limited_hour'");
  });

  it('never sends the bare rate_limited reason, which cannot be worded honestly', () => {
    // The generic string survives on the CLIENT as a version-skew fallback, but
    // a function that can see `scope` has no excuse to send it.
    expect(SOURCE).not.toMatch(/reason: 'rate_limited'[,\s}]/);
  });

  /**
   * Free users get the tighter window. If these ever invert, a free account
   * becomes the cheapest way to spend the most money.
   */
  it('gives free users a strictly tighter window than Pro', () => {
    const match = SOURCE.match(
      /isPro\s*\?\s*\{\s*hourly:\s*(\d+),\s*daily:\s*(\d+)\s*\}\s*:\s*\{\s*hourly:\s*(\d+),\s*daily:\s*(\d+)\s*\}/,
    );
    expect(match).not.toBeNull();
    const [, proHourly, proDaily, freeHourly, freeDaily] = match!.map(Number);
    expect(freeHourly).toBeLessThan(proHourly);
    expect(freeDaily).toBeLessThan(proDaily);
  });
});

/**
 * The migration and the function are one change in two places, deployed in a
 * fixed order. If the SQL stops defining what the function calls, the function
 * fails closed and AI generation is dead for everyone — so the name is pinned
 * on both sides.
 */
describe('the migration backing it', () => {
  const MIGRATION = readFileSync(
    join(__dirname, '../../supabase/migrations/20260727_ai_generation_rate_limit.sql'),
    'utf8',
  );

  it('defines the function the edge function calls, by that exact name', () => {
    expect(MIGRATION).toMatch(
      /create or replace function public\.claim_ai_generation_slot\s*\(/i,
    );
  });

  it('enables RLS on the event table', () => {
    expect(MIGRATION).toMatch(
      /alter table public\.ai_generation_events\s+enable row level security/i,
    );
  });

  it('does not expose the claim function to the client', () => {
    expect(MIGRATION).toMatch(/revoke all on function public\.claim_ai_generation_slot/i);
    expect(MIGRATION).toMatch(/grant execute on function[\s\S]*?to service_role/i);
  });

  it('takes a per-user lock, so two concurrent claims cannot both pass the count', () => {
    expect(MIGRATION).toContain('pg_advisory_xact_lock');
  });
});
