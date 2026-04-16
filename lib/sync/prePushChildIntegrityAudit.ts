/**
 * Pre-push integrity: classify dirty lc_events / lc_streaks by local + remote parent state,
 * tombstone irrecoverable orphans only, structured logs. Does not advance cursors.
 *
 * Classification (parent = mark_id / counter_id):
 * - CASE A VALID: active local parent (deleted_at empty), not dirty vs push cursor
 * - CASE B WAITING: active local parent AND parent.updated_at > push cursor (ordering)
 * - CASE C ORPHAN: no active local parent AND parent not active on remote → tombstone
 * - CASE D ORPHAN: local parent row tombstoned AND parent not on remote → tombstone
 *
 * KEEP (never tombstone) when remote still has an active parent even if local row missing/deleted
 * (divergence — sync must not hide data loss).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { execute, query } from '../db';
import { logger } from '../utils/logger';
import type { CounterEvent, CounterStreak, MarkBadge } from '../../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(str: string): boolean {
  return UUID_RE.test(str);
}

export function isParentMissingSyncError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg === 'SYNC_EVENT_PARENT_MISSING' ||
    msg === 'SYNC_STREAK_PARENT_MISSING' ||
    msg === 'SYNC_BADGE_PARENT_MISSING'
  );
}

function counterIsActiveLocal(deletedAt: string | null | undefined): boolean {
  return deletedAt == null || String(deletedAt).trim() === '';
}

function eventParentId(e: CounterEvent & { counter_id?: string }): string | null {
  const id = (e as any).mark_id || (e as any).counter_id;
  return id && typeof id === 'string' && isValidUUID(id) ? id : null;
}

function streakParentId(s: CounterStreak & { counter_id?: string }): string | null {
  const id = (s as any).mark_id || (s as any).counter_id;
  return id && typeof id === 'string' && isValidUUID(id) ? id : null;
}

function badgeParentId(b: MarkBadge & { counter_id?: string }): string | null {
  const id = (b as any).mark_id || (b as any).counter_id;
  return id && typeof id === 'string' && isValidUUID(id) ? id : null;
}

async function tombstoneLcEvents(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const t = new Date().toISOString();
  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const ph = slice.map(() => '?').join(',');
    await execute(
      `UPDATE lc_events SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND id IN (${ph}) AND (deleted_at IS NULL OR deleted_at = '')`,
      [t, t, userId, ...slice],
    );
  }
}

async function tombstoneLcStreaks(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const t = new Date().toISOString();
  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const ph = slice.map(() => '?').join(',');
    await execute(
      `UPDATE lc_streaks SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND id IN (${ph}) AND (deleted_at IS NULL OR deleted_at = '')`,
      [t, t, userId, ...slice],
    );
  }
}

async function tombstoneLcBadges(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const t = new Date().toISOString();
  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const ph = slice.map(() => '?').join(',');
    await execute(
      `UPDATE lc_badges SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND id IN (${ph}) AND (deleted_at IS NULL OR deleted_at = '')`,
      [t, t, userId, ...slice],
    );
  }
}

export async function prePushChildIntegrityAuditAndCleanup(opts: {
  userId: string;
  supabase: SupabaseClient;
  pushCursorIso: string;
  attemptIndex: number;
}): Promise<void> {
  const { userId, supabase, pushCursorIso, attemptIndex } = opts;

  const eventsRaw = await query<CounterEvent>(
    'SELECT * FROM lc_events WHERE user_id = ? AND updated_at > ?',
    [userId, pushCursorIso],
  );
  const streaksRaw = await query<CounterStreak>(
    'SELECT * FROM lc_streaks WHERE user_id = ? AND updated_at > ?',
    [userId, pushCursorIso],
  );

  logger.log('[SYNC] integrity: dirty snapshot (pre-classification)', {
    attemptIndex,
    dirtyEventsTotal: eventsRaw.length,
    dirtyStreaksTotal: streaksRaw.length,
  });

  const allLocalCounters = await query<{ id: string; deleted_at: string | null; updated_at: string }>(
    'SELECT id, deleted_at, updated_at FROM lc_counters WHERE user_id = ?',
    [userId],
  );
  const localMap = new Map(allLocalCounters.map((c) => [c.id, c]));

  const { data: remoteRows, error: remoteErr } = await supabase
    .from('counters')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (remoteErr) {
    logger.error('[SYNC] integrity: remote active parent id fetch failed — skipping orphan cleanup', {
      attemptIndex,
      message: remoteErr.message,
    });
    return;
  }
  const remoteActive = new Set((remoteRows || []).map((r) => r.id as string));

  let eventsValid = 0;
  let eventsWaiting = 0;
  /** Active local parent, not on remote, parent.updated_at > push cursor (ordering). */
  let eventsNeedsParentPushDirty = 0;
  /** Active local parent, not on remote, parent NOT dirty vs cursor — must be augmented into counter push. */
  let eventsNeedsParentPushClean = 0;
  let eventsOrphan = 0;
  let eventsSkippedTombstoned = 0;
  let eventsSkippedInvalidParent = 0;

  const orphanEventIds: string[] = [];

  for (const row of eventsRaw) {
    const e: any = { ...row, mark_id: row.mark_id || row.counter_id };
    if (e.deleted_at && String(e.deleted_at).trim() !== '') {
      eventsSkippedTombstoned += 1;
      continue;
    }
    const pid = eventParentId(e as CounterEvent);
    if (!pid) {
      eventsSkippedInvalidParent += 1;
      continue;
    }
    const local = localMap.get(pid);
    const localActive = local && counterIsActiveLocal(local.deleted_at);
    const onRemote = remoteActive.has(pid);

    if (localActive) {
      const dirtyParent = new Date(local!.updated_at).getTime() > new Date(pushCursorIso).getTime();
      if (!onRemote) {
        if (dirtyParent) eventsNeedsParentPushDirty += 1;
        else eventsNeedsParentPushClean += 1;
        continue;
      }
      if (dirtyParent) eventsWaiting += 1;
      else eventsValid += 1;
      continue;
    }

    if (!onRemote) {
      eventsOrphan += 1;
      orphanEventIds.push(e.id);
      continue;
    }

    eventsValid += 1;
  }

  let streaksValid = 0;
  let streaksWaiting = 0;
  let streaksNeedsParentPushDirty = 0;
  let streaksNeedsParentPushClean = 0;
  let streaksOrphan = 0;
  let streaksSkippedTombstoned = 0;
  let streaksSkippedInvalidParent = 0;
  const orphanStreakIds: string[] = [];

  for (const row of streaksRaw) {
    const s: any = { ...row, mark_id: (row as any).mark_id || (row as any).counter_id };
    if (s.deleted_at && String(s.deleted_at).trim() !== '') {
      streaksSkippedTombstoned += 1;
      continue;
    }
    const pid = streakParentId(s as CounterStreak);
    if (!pid) {
      streaksSkippedInvalidParent += 1;
      continue;
    }
    const local = localMap.get(pid);
    const localActive = local && counterIsActiveLocal(local.deleted_at);
    const onRemote = remoteActive.has(pid);

    if (localActive) {
      const dirtyParent = new Date(local!.updated_at).getTime() > new Date(pushCursorIso).getTime();
      if (!onRemote) {
        if (dirtyParent) streaksNeedsParentPushDirty += 1;
        else streaksNeedsParentPushClean += 1;
        continue;
      }
      if (dirtyParent) streaksWaiting += 1;
      else streaksValid += 1;
      continue;
    }

    if (!onRemote) {
      streaksOrphan += 1;
      orphanStreakIds.push(s.id);
      continue;
    }

    streaksValid += 1;
  }

  logger.log('[SYNC] integrity: classification', {
    attemptIndex,
    events: {
      valid: eventsValid,
      waiting: eventsWaiting,
      needsParentPush_dirtyParent: eventsNeedsParentPushDirty,
      needsParentPush_cleanParent_notOnRemote: eventsNeedsParentPushClean,
      orphan: eventsOrphan,
      skippedTombstoned: eventsSkippedTombstoned,
      skippedInvalidParent: eventsSkippedInvalidParent,
    },
    streaks: {
      valid: streaksValid,
      waiting: streaksWaiting,
      needsParentPush_dirtyParent: streaksNeedsParentPushDirty,
      needsParentPush_cleanParent_notOnRemote: streaksNeedsParentPushClean,
      orphan: streaksOrphan,
      skippedTombstoned: streaksSkippedTombstoned,
      skippedInvalidParent: streaksSkippedInvalidParent,
    },
  });

  const cleanedEvents = orphanEventIds.length;
  const cleanedStreaks = orphanStreakIds.length;
  if (cleanedEvents > 0) await tombstoneLcEvents(userId, orphanEventIds);
  if (cleanedStreaks > 0) await tombstoneLcStreaks(userId, orphanStreakIds);

  if (cleanedEvents + cleanedStreaks > 0) {
    logger.warn('[SYNC] integrity: tombstoned orphan dirty rows', {
      attemptIndex,
      cleanedEventsCount: cleanedEvents,
      cleanedStreaksCount: cleanedStreaks,
      sampleEventIds: orphanEventIds.slice(0, 5),
      sampleStreakIds: orphanStreakIds.slice(0, 5),
    });
  } else {
    logger.log('[SYNC] integrity: no orphan rows tombstoned', { attemptIndex });
  }
}

/**
 * After counters are upserted and we have a merged `confirmedRemoteActiveParentIds`, tombstone dirty
 * children (events, streaks, badges) whose parent is still not confirmed **and** there is no active
 * local lc_counters row. Same rules as events/streaks — never tombstone when local parent is active.
 */
export async function postUpsertOrphanChildCleanup(opts: {
  userId: string;
  confirmedRemoteActiveParentIds: ReadonlySet<string>;
  events: CounterEvent[];
  streaks: CounterStreak[];
  badges: MarkBadge[];
}): Promise<{ tombstonedEvents: number; tombstonedStreaks: number; tombstonedBadges: number }> {
  const { userId, confirmedRemoteActiveParentIds, events, streaks, badges } = opts;

  const parentsNotConfirmed = new Set<string>();
  for (const e of events) {
    const pid = eventParentId(e as CounterEvent);
    if (pid && !confirmedRemoteActiveParentIds.has(pid)) parentsNotConfirmed.add(pid);
  }
  for (const s of streaks) {
    const pid = streakParentId(s as CounterStreak);
    if (pid && !confirmedRemoteActiveParentIds.has(pid)) parentsNotConfirmed.add(pid);
  }
  for (const b of badges) {
    const pid = badgeParentId(b as MarkBadge);
    if (pid && !confirmedRemoteActiveParentIds.has(pid)) parentsNotConfirmed.add(pid);
  }
  if (parentsNotConfirmed.size === 0) {
    return { tombstonedEvents: 0, tombstonedStreaks: 0, tombstonedBadges: 0 };
  }

  const ids = [...parentsNotConfirmed];
  const localMap = new Map<string, { deleted_at: string | null }>();
  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const ph = slice.map(() => '?').join(',');
    const rows = await query<{ id: string; deleted_at: string | null }>(
      `SELECT id, deleted_at FROM lc_counters WHERE user_id = ? AND id IN (${ph})`,
      [userId, ...slice],
    );
    for (const r of rows) {
      localMap.set(r.id, r);
    }
  }

  const orphanEventIds: string[] = [];
  for (const e of events) {
    const pid = eventParentId(e as CounterEvent);
    if (!pid || confirmedRemoteActiveParentIds.has(pid)) continue;
    const loc = localMap.get(pid);
    if (loc && counterIsActiveLocal(loc.deleted_at)) continue;
    orphanEventIds.push(e.id);
  }

  const orphanStreakIds: string[] = [];
  for (const s of streaks) {
    const pid = streakParentId(s as CounterStreak);
    if (!pid || confirmedRemoteActiveParentIds.has(pid)) continue;
    const loc = localMap.get(pid);
    if (loc && counterIsActiveLocal(loc.deleted_at)) continue;
    orphanStreakIds.push(s.id);
  }

  const orphanBadgeIds: string[] = [];
  for (const b of badges) {
    const pid = badgeParentId(b as MarkBadge);
    if (!pid || confirmedRemoteActiveParentIds.has(pid)) continue;
    const loc = localMap.get(pid);
    if (loc && counterIsActiveLocal(loc.deleted_at)) continue;
    orphanBadgeIds.push(b.id);
  }

  if (orphanEventIds.length > 0) await tombstoneLcEvents(userId, orphanEventIds);
  if (orphanStreakIds.length > 0) await tombstoneLcStreaks(userId, orphanStreakIds);
  if (orphanBadgeIds.length > 0) await tombstoneLcBadges(userId, orphanBadgeIds);

  if (orphanEventIds.length > 0) {
    const tomb = new Set(orphanEventIds);
    const next = events.filter((e) => !tomb.has(e.id));
    events.length = 0;
    events.push(...next);
  }
  if (orphanStreakIds.length > 0) {
    const tomb = new Set(orphanStreakIds);
    const next = streaks.filter((s) => !tomb.has(s.id));
    streaks.length = 0;
    streaks.push(...next);
  }
  if (orphanBadgeIds.length > 0) {
    const tomb = new Set(orphanBadgeIds);
    const next = badges.filter((b) => !tomb.has(b.id));
    badges.length = 0;
    badges.push(...next);
  }

  if (orphanEventIds.length + orphanStreakIds.length + orphanBadgeIds.length > 0) {
    logger.warn('[SYNC] post-upsert orphan cleanup (confirmed-parent set)', {
      tombstonedEvents: orphanEventIds.length,
      tombstonedStreaks: orphanStreakIds.length,
      tombstonedBadges: orphanBadgeIds.length,
      sampleEventIds: orphanEventIds.slice(0, 5),
      sampleStreakIds: orphanStreakIds.slice(0, 5),
      sampleBadgeIds: orphanBadgeIds.slice(0, 5),
    });
  }

  return {
    tombstonedEvents: orphanEventIds.length,
    tombstonedStreaks: orphanStreakIds.length,
    tombstonedBadges: orphanBadgeIds.length,
  };
}
