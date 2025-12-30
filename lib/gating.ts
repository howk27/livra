import { Mark, MarkEvent } from '../types';
import { formatDate } from './date';
import { logger } from './utils/logger';

export type GateType = 'ONCE_PER_DAY' | 'MIN_INTERVAL_MINUTES';

export interface GatingConfig {
  gated: boolean;
  gate_type?: GateType | null;
  min_interval_minutes?: number | null;
  max_per_day?: number | null;
}

export interface GatingResult {
  allowed: boolean;
  reason?: string;
  remainingMinutes?: number;
}

/**
 * Get default gating configuration based on mark name
 * Applies name-based defaults for common marks (Gym, Meditation, Sleep)
 */
export function getDefaultGatingConfig(markName: string): Partial<GatingConfig> {
  const nameLower = markName.toLowerCase();
  
  // Gym/Workout/Exercise: Once per day
  if (nameLower.includes('gym') || nameLower.includes('workout') || nameLower.includes('exercise')) {
    return {
      gated: true,
      gate_type: 'ONCE_PER_DAY',
      min_interval_minutes: null,
      max_per_day: null,
    };
  }
  
  // Meditation: Minimum 30 minutes between increments
  if (nameLower.includes('meditation') || nameLower.includes('meditate')) {
    return {
      gated: true,
      gate_type: 'MIN_INTERVAL_MINUTES',
      min_interval_minutes: 30,
      max_per_day: null,
    };
  }
  
  // Sleep/Bedtime/Rest: Once per day
  if (nameLower.includes('sleep') || nameLower.includes('bedtime') || nameLower.includes('rest')) {
    return {
      gated: true,
      gate_type: 'ONCE_PER_DAY',
      min_interval_minutes: null,
      max_per_day: null,
    };
  }
  
  // No default gating for other marks
  return {
    gated: false,
    gate_type: null,
    min_interval_minutes: null,
    max_per_day: null,
  };
}

/**
 * Get the last completion time (most recent increment event)
 */
export function getLastCompletionTime(events: MarkEvent[], markId: string): Date | null {
  const incrementEvents = events.filter(
    (e) => e.mark_id === markId && 
           e.event_type === 'increment' && 
           !e.deleted_at
  );
  
  if (incrementEvents.length === 0) {
    return null;
  }
  
  // Sort by occurred_at descending and get the most recent
  const sorted = incrementEvents.sort((a, b) => 
    new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
  );
  
  return new Date(sorted[0].occurred_at);
}

/**
 * Count completions (increments) for a mark today
 */
export function getCompletionsToday(events: MarkEvent[], markId: string, today: string): number {
  return events.filter(
    (e) => e.mark_id === markId &&
           e.event_type === 'increment' &&
           e.occurred_local_date === today &&
           !e.deleted_at
  ).length;
}

/**
 * Calculate remaining minutes until next allowed increment
 */
export function calculateRemainingMinutes(lastTime: Date, minIntervalMinutes: number): number {
  const now = new Date();
  const elapsedMinutes = Math.floor((now.getTime() - lastTime.getTime()) / (1000 * 60));
  const remaining = minIntervalMinutes - elapsedMinutes;
  return Math.max(0, remaining);
}

/**
 * Check if an increment is allowed based on gating rules
 */
export function checkGatingRules(
  mark: Mark,
  userId: string,
  events: MarkEvent[],
  now: Date = new Date()
): GatingResult {
  // If mark is not gated, allow increment
  if (!mark.gated) {
    return { allowed: true };
  }
  
  const gateType = mark.gate_type;
  const today = formatDate(now);
  
  // Get last completion time
  const lastCompletionTime = getLastCompletionTime(events, mark.id);
  
  // Get completions today
  const completionsToday = getCompletionsToday(events, mark.id, today);
  
  // Check max_per_day limit (if set)
  if (mark.max_per_day !== null && mark.max_per_day !== undefined) {
    if (completionsToday >= mark.max_per_day) {
      return {
        allowed: false,
        reason: `You've reached the maximum of ${mark.max_per_day} logs per day.`,
      };
    }
  }
  
  // Check ONCE_PER_DAY gate type
  if (gateType === 'ONCE_PER_DAY') {
    if (completionsToday > 0) {
      return {
        allowed: false,
        reason: 'You can only log this mark once per day. Try again tomorrow.',
      };
    }
    return { allowed: true };
  }
  
  // Check MIN_INTERVAL_MINUTES gate type
  if (gateType === 'MIN_INTERVAL_MINUTES') {
    const minInterval = mark.min_interval_minutes;
    
    if (minInterval === null || minInterval === undefined || minInterval <= 0) {
      // Invalid configuration - allow increment but log warning
      logger.warn(`[Gating] Invalid min_interval_minutes for mark ${mark.id}, allowing increment`);
      return { allowed: true };
    }
    
    // If no previous completion, allow
    if (!lastCompletionTime) {
      return { allowed: true };
    }
    
    // Calculate elapsed time
    const elapsedMinutes = Math.floor((now.getTime() - lastCompletionTime.getTime()) / (1000 * 60));
    
    if (elapsedMinutes < minInterval) {
      const remainingMinutes = minInterval - elapsedMinutes;
      return {
        allowed: false,
        reason: `You can log this again in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.`,
        remainingMinutes,
      };
    }
    
    return { allowed: true };
  }
  
  // Unknown gate type - allow increment but log warning
  if (gateType) {
    logger.warn(`[Gating] Unknown gate_type "${gateType}" for mark ${mark.id}, allowing increment`);
  }
  
  return { allowed: true };
}

