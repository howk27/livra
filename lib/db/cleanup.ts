import { query, execute, queryFirst } from './index';
import { Mark } from '../../types';
import { logger } from '../utils/logger';

/**
 * Cleans up duplicate marks from the database
 * Removes duplicates by:
 * 1. Same ID (keep most recent based on updated_at)
 * 2. Same name + user_id (keep most recent, mark others as deleted)
 * 
 * @param userId - Optional user ID to clean up marks for a specific user
 * @returns Object with stats about the cleanup
 */
export async function cleanupDuplicateMarks(userId?: string): Promise<{
  duplicatesByID: number;
  duplicatesByName: number;
  deletedMarks: string[];
  errors: string[];
}> {
  const result = {
    duplicatesByID: 0,
    duplicatesByName: 0,
    deletedMarks: [] as string[],
    errors: [] as string[],
  };

  try {
    // Step 1: Get all marks
    const allMarks = userId
      ? await query<Mark>('SELECT * FROM lc_counters WHERE user_id = ?', [userId])
      : await query<Mark>('SELECT * FROM lc_counters');
    
    // Step 2: Find and mark as deleted duplicate marks with same name + user_id
    // Keep the most recent one (by updated_at), mark others as deleted
    const marksByNameAndUser = new Map<string, Mark[]>();
    for (const mark of allMarks) {
      // Only check non-deleted marks
      if (mark.deleted_at) continue;
      
      const key = `${mark.user_id || ''}:${mark.name.toLowerCase()}`;
      if (!marksByNameAndUser.has(key)) {
        marksByNameAndUser.set(key, []);
      }
      marksByNameAndUser.get(key)!.push(mark);
    }
    
    // Find duplicates by name + user_id
    for (const [key, marks] of marksByNameAndUser.entries()) {
      if (marks.length > 1) {
        // Sort by updated_at descending to get most recent first
        marks.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        const keepMark = marks[0];
        const duplicates = marks.slice(1);
        
        // Mark duplicates as deleted
        const now = new Date().toISOString();
        for (const duplicate of duplicates) {
          try {
            // Only mark as deleted if not already deleted
            if (!duplicate.deleted_at) {
              await execute(
                'UPDATE lc_counters SET deleted_at = ?, updated_at = ? WHERE id = ?',
                [now, now, duplicate.id]
              );
              result.duplicatesByName++;
              result.deletedMarks.push(duplicate.id);
              logger.log(`[CLEANUP] Marked duplicate as deleted: ${duplicate.id} (${duplicate.name}) - keeping ${keepMark.id}`);
            }
          } catch (error) {
            result.errors.push(`Failed to mark duplicate ${duplicate.id} as deleted: ${error}`);
          }
        }
      }
    }
    
    logger.log(`[CLEANUP] Cleanup complete: ${result.duplicatesByID} duplicate IDs removed, ${result.duplicatesByName} duplicate names marked as deleted`);
    return result;
  } catch (error) {
    result.errors.push(`Cleanup failed: ${error}`);
    logger.error('[CLEANUP] Error during cleanup:', error);
    return result;
  }
}

/**
 * Permanently removes all marks marked as deleted from the database
 * WARNING: This is irreversible!
 * 
 * @param userId - Optional user ID to clean up marks for a specific user
 * @returns Number of marks permanently deleted
 */
export async function permanentlyDeleteMarks(userId?: string): Promise<number> {
  try {
    const sql = userId
      ? 'DELETE FROM lc_counters WHERE deleted_at IS NOT NULL AND user_id = ?'
      : 'DELETE FROM lc_counters WHERE deleted_at IS NOT NULL';
    const params = userId ? [userId] : [];
    
    const result = await execute(sql, params);
    const deletedCount = typeof result === 'object' && 'rowsAffected' in result ? result.rowsAffected : 0;
    
    logger.log(`[CLEANUP] Permanently deleted ${deletedCount} mark(s)`);
    return deletedCount || 0;
  } catch (error) {
    logger.error('[CLEANUP] Error permanently deleting marks:', error);
    throw error;
  }
}

// Export as cleanupDuplicateCounters for backwards compatibility
export const cleanupDuplicateCounters = cleanupDuplicateMarks;

/**
 * Cleans up orphaned streaks and badges from the database
 * Removes records that:
 * 1. Have null/undefined/invalid counter_id (mark_id)
 * 2. Reference counters that don't exist or are deleted
 * 
 * @param userId - Optional user ID to clean up for a specific user
 * @returns Object with stats about the cleanup
 */
export async function cleanupOrphanedStreaksAndBadges(userId?: string): Promise<{
  deletedStreaks: number;
  deletedBadges: number;
  errors: string[];
}> {
  const result = {
    deletedStreaks: 0,
    deletedBadges: 0,
    errors: [] as string[],
  };

  try {
    const { query, execute } = await import('./index');
    const now = new Date().toISOString();

    // Step 1: Get all existing counter IDs (non-deleted)
    const validCounters = userId
      ? await query<{ id: string }>('SELECT id FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL', [userId])
      : await query<{ id: string }>('SELECT id FROM lc_counters WHERE deleted_at IS NULL');
    
    const validCounterIds = new Set(validCounters.map(c => c.id));

    // Step 2: Clean up orphaned streaks
    try {
      // Get all streaks
      const allStreaks = userId
        ? await query<{ id: string; counter_id: string }>('SELECT id, counter_id FROM lc_streaks WHERE user_id = ?', [userId])
        : await query<{ id: string; counter_id: string }>('SELECT id, counter_id FROM lc_streaks');
      
      // Find orphaned streaks (invalid counter_id or counter doesn't exist)
      const orphanedStreaks = allStreaks.filter(s => 
        !s.counter_id || 
        typeof s.counter_id !== 'string' || 
        s.counter_id.trim() === '' ||
        !validCounterIds.has(s.counter_id)
      );

      // Mark orphaned streaks as deleted
      for (const streak of orphanedStreaks) {
        try {
          await execute(
            'UPDATE lc_streaks SET deleted_at = ?, updated_at = ? WHERE id = ?',
            [now, now, streak.id]
          );
          result.deletedStreaks++;
        } catch (error) {
          result.errors.push(`Failed to delete orphaned streak ${streak.id}: ${error}`);
        }
      }

      if (orphanedStreaks.length > 0) {
        logger.log(`[CLEANUP] Marked ${orphanedStreaks.length} orphaned streak(s) as deleted`);
      }
    } catch (error) {
      result.errors.push(`Error cleaning up streaks: ${error}`);
      logger.error('[CLEANUP] Error cleaning up orphaned streaks:', error);
    }

    // Step 3: Clean up orphaned badges
    try {
      // Get all badges
      const allBadges = userId
        ? await query<{ id: string; counter_id: string; badge_code: string }>('SELECT id, counter_id, badge_code FROM lc_badges WHERE user_id = ?', [userId])
        : await query<{ id: string; counter_id: string; badge_code: string }>('SELECT id, counter_id, badge_code FROM lc_badges');
      
      // Find orphaned badges (invalid counter_id, missing badge_code, or counter doesn't exist)
      const orphanedBadges = allBadges.filter(b => 
        !b.counter_id || 
        typeof b.counter_id !== 'string' || 
        b.counter_id.trim() === '' ||
        !b.badge_code ||
        typeof b.badge_code !== 'string' ||
        b.badge_code.trim() === '' ||
        !validCounterIds.has(b.counter_id)
      );

      // Permanently delete orphaned badges (not just mark as deleted)
      for (const badge of orphanedBadges) {
        try {
          await execute(
            'DELETE FROM lc_badges WHERE id = ?',
            [badge.id]
          );
          result.deletedBadges++;
        } catch (error) {
          result.errors.push(`Failed to permanently delete orphaned badge ${badge.id}: ${error}`);
        }
      }

      if (orphanedBadges.length > 0) {
        logger.log(`[CLEANUP] Permanently deleted ${orphanedBadges.length} orphaned badge(s)`);
      }
    } catch (error) {
      result.errors.push(`Error cleaning up badges: ${error}`);
      logger.error('[CLEANUP] Error cleaning up orphaned badges:', error);
    }

    if (result.deletedStreaks > 0 || result.deletedBadges > 0) {
      logger.log(`[CLEANUP] Cleanup complete: ${result.deletedStreaks} orphaned streak(s), ${result.deletedBadges} orphaned badge(s) marked as deleted`);
    }

    return result;
  } catch (error) {
    result.errors.push(`Cleanup failed: ${error}`);
    logger.error('[CLEANUP] Error during orphaned streaks/badges cleanup:', error);
    return result;
  }
}

/**
 * Cleans up orphaned events from the database
 * Removes events that:
 * 1. Have null/undefined/invalid counter_id
 * 2. Reference counters that don't exist or are deleted
 * 
 * @param userId - Optional user ID to clean up for a specific user
 * @returns Object with stats about the cleanup
 */
export async function cleanupOrphanedEvents(userId?: string): Promise<{
  deletedEvents: number;
  errors: string[];
}> {
  const result = {
    deletedEvents: 0,
    errors: [] as string[],
  };

  try {
    const { query, execute } = await import('./index');
    const now = new Date().toISOString();

    // Step 1: Get all existing counter IDs (non-deleted)
    const validCounters = userId
      ? await query<{ id: string }>('SELECT id FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL', [userId])
      : await query<{ id: string }>('SELECT id FROM lc_counters WHERE deleted_at IS NULL');
    
    const validCounterIds = new Set(validCounters.map(c => c.id));

    // Step 2: Clean up orphaned events
    try {
      // Get all events
      const allEvents = userId
        ? await query<{ id: string; counter_id: string }>('SELECT id, counter_id FROM lc_events WHERE user_id = ?', [userId])
        : await query<{ id: string; counter_id: string }>('SELECT id, counter_id FROM lc_events');
      
      // Find orphaned events (invalid counter_id or counter doesn't exist)
      const orphanedEvents = allEvents.filter(e => 
        !e.counter_id || 
        typeof e.counter_id !== 'string' || 
        e.counter_id.trim() === '' ||
        !validCounterIds.has(e.counter_id)
      );

      // Mark orphaned events as deleted
      for (const event of orphanedEvents) {
        try {
          await execute(
            'UPDATE lc_events SET deleted_at = ?, updated_at = ? WHERE id = ?',
            [now, now, event.id]
          );
          result.deletedEvents++;
        } catch (error) {
          result.errors.push(`Failed to delete orphaned event ${event.id}: ${error}`);
        }
      }

      if (orphanedEvents.length > 0) {
        logger.log(`[CLEANUP] Marked ${orphanedEvents.length} orphaned event(s) as deleted`);
      }
    } catch (error) {
      result.errors.push(`Error cleaning up events: ${error}`);
      logger.error('[CLEANUP] Error cleaning up orphaned events:', error);
    }

    if (result.deletedEvents > 0) {
      logger.log(`[CLEANUP] Cleanup complete: ${result.deletedEvents} orphaned event(s) marked as deleted`);
    }

    return result;
  } catch (error) {
    result.errors.push(`Cleanup failed: ${error}`);
    logger.error('[CLEANUP] Error during orphaned events cleanup:', error);
    return result;
  }
}

