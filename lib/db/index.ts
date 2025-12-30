// Database implementation using AsyncStorage
// Note: This is the current production implementation. The app uses AsyncStorage-backed
// storage for local data persistence. Migration to expo-sqlite for improved performance
// and SQL query capabilities is a future enhancement but not required for current release.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

interface MockResult {
  insertId?: number;
  rowsAffected: number;
}

interface MockDatabase {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, params?: any[]) => Promise<MockResult>;
  getAllAsync: <T>(sql: string, params?: any[]) => Promise<T[]>;
  getFirstAsync: <T>(sql: string, params?: any[]) => Promise<T | null>;
  withTransactionAsync: <T>(callback: (db: MockDatabase) => Promise<T>) => Promise<T>;
}

// Storage keys for AsyncStorage
const STORAGE_KEYS = {
  counters: '@livra_db_counters',
  events: '@livra_db_events',
  streaks: '@livra_db_streaks',
  badges: '@livra_db_badges',
  meta: '@livra_db_meta',
};

// In-memory storage for development (backed by AsyncStorage)
const storage = new Map<string, any[]>();
const meta = new Map<string, string>();

// UUID validation to prevent storing placeholder/local data
const isValidUUID = (str: string): boolean =>
  typeof str === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

// Load data from AsyncStorage on initialization
const loadFromStorage = async (): Promise<void> => {
  try {
    const countersJson = await AsyncStorage.getItem(STORAGE_KEYS.counters);
    if (countersJson) {
      storage.set('counters', JSON.parse(countersJson));
    }
    
    const eventsJson = await AsyncStorage.getItem(STORAGE_KEYS.events);
    if (eventsJson) {
      storage.set('events', JSON.parse(eventsJson));
    }
    
    const streaksJson = await AsyncStorage.getItem(STORAGE_KEYS.streaks);
    if (streaksJson) {
      storage.set('streaks', JSON.parse(streaksJson));
    }
    
    const badgesJson = await AsyncStorage.getItem(STORAGE_KEYS.badges);
    if (badgesJson) {
      storage.set('badges', JSON.parse(badgesJson));
    }
    
    const metaJson = await AsyncStorage.getItem(STORAGE_KEYS.meta);
    if (metaJson) {
      const metaData = JSON.parse(metaJson);
      Object.entries(metaData).forEach(([key, value]) => {
        meta.set(key, value as string);
      });
    }
  } catch (error) {
    logger.error('[DB] Error loading from AsyncStorage:', error);
  }
};

// Save data to AsyncStorage
const saveToStorage = async (key: string, data: any[]): Promise<void> => {
  try {
    const storageKey = STORAGE_KEYS[key as keyof typeof STORAGE_KEYS];
    if (storageKey) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(data));
    }
  } catch (error) {
    logger.error(`[DB] Error saving ${key} to AsyncStorage:`, error);
  }
};

// Save meta to AsyncStorage
const saveMetaToStorage = async (): Promise<void> => {
  try {
    const metaData: Record<string, string> = {};
    meta.forEach((value, key) => {
      metaData[key] = value;
    });
    await AsyncStorage.setItem(STORAGE_KEYS.meta, JSON.stringify(metaData));
  } catch (error) {
    logger.error('[DB] Error saving meta to AsyncStorage:', error);
  }
};

// Mock database implementation
const createMockDb = (): MockDatabase => ({
  execAsync: async (sql: string) => {
    // Initialize tables if needed
    if (sql.includes('lc_counters') && !storage.has('counters')) {
      storage.set('counters', []);
    }
    if (sql.includes('lc_events') && !storage.has('events')) {
      storage.set('events', []);
    }
    if (sql.includes('lc_streaks') && !storage.has('streaks')) {
      storage.set('streaks', []);
    }
    if (sql.includes('lc_badges') && !storage.has('badges')) {
      storage.set('badges', []);
    }
    if (sql.includes('lc_meta') && !storage.has('meta')) {
      storage.set('meta', []);
    }
  },
  
  runAsync: async (sql: string, params: any[] = []): Promise<MockResult> => {
    // INSERT INTO lc_counters
    if (sql.includes('INSERT INTO lc_counters')) {
      // Block inserts with invalid user IDs (e.g., "local-user") to avoid polluting sync
      if (!isValidUUID(params[1])) {
        logger.warn('[DB] Skipping counter insert due to invalid user_id', { user_id: params[1], name: params[2] });
        return { rowsAffected: 0 };
      }

      const counters = storage.get('counters') || [];
      let newCounter: any;
      
      if (params.length === 15) {
        // Full insert with gating fields (from addMark in countersSlice.ts)
        // SQL: INSERT INTO lc_counters (id, user_id, name, emoji, color, unit, enable_streak, 
        //      sort_index, total, created_at, updated_at, gated, gate_type, min_interval_minutes, max_per_day)
        newCounter = {
          id: params[0],
          user_id: params[1],
          name: params[2],
          emoji: params[3],
          color: params[4],
          unit: params[5],
          enable_streak: params[6],
          sort_index: params[7],
          total: params[8],
          created_at: params[9],
          updated_at: params[10],
          gated: params[11],
          gate_type: params[12],
          min_interval_minutes: params[13],
          max_per_day: params[14],
          last_activity_date: null,
          deleted_at: null,
        };
        logger.log(`[DB] Inserted counter ${params[0]} (${params[2]}) with gating fields`);
      } else if (params.length === 13) {
        // Insert from sync with last_activity_date and deleted_at (from mergeCounter in useSync.ts)
        // SQL: INSERT INTO lc_counters (id, user_id, name, emoji, color, unit, enable_streak,
        //      sort_index, total, last_activity_date, deleted_at, created_at, updated_at)
        newCounter = {
          id: params[0],
          user_id: params[1],
          name: params[2],
          emoji: params[3],
          color: params[4],
          unit: params[5],
          enable_streak: params[6],
          sort_index: params[7],
          total: params[8],
          last_activity_date: params[9],
          deleted_at: params[10],
          created_at: params[11],
          updated_at: params[12],
          gated: null,
          gate_type: null,
          min_interval_minutes: null,
          max_per_day: null,
        };
        logger.log(`[DB] Inserted counter ${params[0]} (${params[2]}) from sync`);
      } else {
        // Legacy insert without gating fields (11 params)
        newCounter = {
          id: params[0],
          user_id: params[1],
          name: params[2],
          emoji: params[3],
          color: params[4],
          unit: params[5],
          enable_streak: params[6],
          sort_index: params[7],
          total: params[8],
          created_at: params[9],
          updated_at: params[10],
          last_activity_date: null,
          deleted_at: null,
          gated: null,
          gate_type: null,
          min_interval_minutes: null,
          max_per_day: null,
        };
        logger.log(`[DB] Inserted counter ${params[0]} (${params[2]}) (legacy, ${params.length} params)`);
      }
      
      counters.push(newCounter);
      storage.set('counters', counters);
      await saveToStorage('counters', counters);
      return { insertId: counters.length - 1, rowsAffected: 1 };
    }
    
    // UPDATE lc_counters
    if (sql.includes('UPDATE lc_counters')) {
      const counters = storage.get('counters') || [];
      
      // Check if this is a soft delete (only 3 params: deleted_at, updated_at, id)
      const isSoftDelete = params.length === 3 && sql.includes('deleted_at');
      
      if (isSoftDelete) {
        // Soft delete: UPDATE lc_counters SET deleted_at = ?, updated_at = ? WHERE id = ?
        const id = params[2]; // WHERE id = ? is last param
        const index = counters.findIndex(c => c.id === id);
        if (index !== -1) {
          const deletedAt = params[0];
          const updatedAt = params[1];
          counters[index] = {
            ...counters[index],
            deleted_at: deletedAt,
            updated_at: updatedAt,
          };
          storage.set('counters', counters);
          await saveToStorage('counters', counters);
          logger.log(`[DB] Soft deleted counter ${id}, deleted_at: ${deletedAt}`);
          return { rowsAffected: 1 };
        }
        logger.error(`[DB] Counter ${id} not found for soft delete`);
        return { rowsAffected: 0 };
      } else {
        // Regular update: UPDATE lc_counters SET name = ?, emoji = ?, ... WHERE id = ?
        const index = counters.findIndex(c => c.id === params[params.length - 1]); // WHERE id = ? is last param
        if (index !== -1) {
          // Handle different UPDATE patterns
          if (params.length === 14) {
            // CRITICAL: Full update with all fields INCLUDING gating fields
            // SQL: UPDATE lc_counters SET name = ?, emoji = ?, color = ?, unit = ?, enable_streak = ?,
            //      sort_index = ?, total = ?, last_activity_date = ?, updated_at = ?,
            //      gated = ?, gate_type = ?, min_interval_minutes = ?, max_per_day = ? WHERE id = ?
            counters[index] = {
              ...counters[index],
              name: params[0],
              emoji: params[1],
              color: params[2],
              unit: params[3],
              enable_streak: params[4],
              sort_index: params[5],
              total: params[6],
              last_activity_date: params[7],
              updated_at: params[8],
              gated: params[9],
              gate_type: params[10],
              min_interval_minutes: params[11],
              max_per_day: params[12],
            };
            logger.log(`[DB] Updated counter ${params[13]} with total: ${params[6]}`);
          } else if (params.length === 10) {
            // Legacy update with all fields (no gating)
            counters[index] = {
              ...counters[index],
              name: params[0],
              emoji: params[1],
              color: params[2],
              unit: params[3],
              enable_streak: params[4],
              sort_index: params[5],
              total: params[6],
              last_activity_date: params[7],
              updated_at: params[8],
            };
            logger.log(`[DB] Updated counter ${params[9]} with total: ${params[6]} (legacy)`);
          } else if (params.length === 2 && sql.includes('total')) {
            // Simple total update: UPDATE lc_counters SET total = ? WHERE id = ?
            counters[index] = {
              ...counters[index],
              total: params[0],
              updated_at: new Date().toISOString(),
            };
            logger.log(`[DB] Updated counter ${params[1]} total to: ${params[0]}`);
          } else {
            // Generic update - parse the SQL to understand what's being updated
            // This handles edge cases and ensures we never silently fail
            const existing = counters[index];
            const updated = { ...existing };
            
            // Try to extract field names from SQL and match with params
            // SQL format: UPDATE lc_counters SET field1 = ?, field2 = ?, ... WHERE id = ?
            const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
            if (setMatch) {
              const assignments = setMatch[1].split(',').map(s => s.trim());
              assignments.forEach((assignment, i) => {
                if (i < params.length - 1) { // Last param is the id
                  const fieldMatch = assignment.match(/^(\w+)\s*=/);
                  if (fieldMatch) {
                    const fieldName = fieldMatch[1];
                    (updated as any)[fieldName] = params[i];
                  }
                }
              });
              updated.updated_at = new Date().toISOString();
            }
            
            counters[index] = updated;
            logger.log(`[DB] Updated counter ${params[params.length - 1]} (generic handler, ${params.length} params)`);
          }
          storage.set('counters', counters);
          await saveToStorage('counters', counters);
          return { rowsAffected: 1 };
        }
        return { rowsAffected: 0 };
      }
    }
    
    // INSERT INTO lc_events
    if (sql.includes('INSERT INTO lc_events')) {
      if (!isValidUUID(params[1])) {
        logger.warn('[DB] Skipping event insert due to invalid user_id', { user_id: params[1], eventId: params[0] });
        return { rowsAffected: 0 };
      }
      if (!isValidUUID(params[2])) {
        logger.warn('[DB] Skipping event insert due to invalid counter_id', { counter_id: params[2], eventId: params[0] });
        return { rowsAffected: 0 };
      }

      const events = storage.get('events') || [];
      const newEvent = {
        id: params[0],
        user_id: params[1],
        counter_id: params[2],
        event_type: params[3],
        amount: params[4],
        occurred_at: params[5],
        occurred_local_date: params[6],
        meta: params[7],
        created_at: params[8],
        updated_at: params[9],
        deleted_at: null,
      };
      events.push(newEvent);
      storage.set('events', events);
      await saveToStorage('events', events);
      return { insertId: events.length - 1, rowsAffected: 1 };
    }
    
    // UPDATE lc_events (for soft delete)
    if (sql.includes('UPDATE lc_events')) {
      const events = storage.get('events') || [];
      const index = events.findIndex(e => e.id === params[2]); // WHERE id = ? is last param
      if (index !== -1) {
        events[index] = { ...events[index], deleted_at: params[0], updated_at: params[1] };
        storage.set('events', events);
        await saveToStorage('events', events);
        return { rowsAffected: 1 };
      }
      return { rowsAffected: 0 };
    }
    
    // INSERT INTO lc_streaks
    if (sql.includes('INSERT INTO lc_streaks')) {
      const streaks = storage.get('streaks') || [];
      // Check if includes deleted_at (from sync) or not (from useStreaks)
      const hasDeletedAt = params.length === 9;
      
      const newStreak = {
        id: params[0],
        user_id: params[1],
        counter_id: params[2],
        current_streak: params[3],
        longest_streak: params[4],
        last_increment_date: params[5],
        created_at: params[hasDeletedAt ? 7 : 6],
        updated_at: params[hasDeletedAt ? 8 : 7],
        deleted_at: hasDeletedAt ? params[6] : null,
      };
      streaks.push(newStreak);
      storage.set('streaks', streaks);
      await saveToStorage('streaks', streaks);
      return { insertId: streaks.length - 1, rowsAffected: 1 };
    }
    
    // INSERT INTO lc_badges
    if (sql.includes('INSERT INTO lc_badges')) {
      const badges = storage.get('badges') || [];
      const hasDeletedAt = params.length === 11;
      const newBadge = {
        id: params[0],
        user_id: params[1],
        counter_id: params[2],
        badge_code: params[3],
        progress_value: params[4],
        target_value: params[5],
        earned_at: params[6],
        last_progressed_at: params[7],
        deleted_at: hasDeletedAt ? params[8] : null,
        created_at: params[hasDeletedAt ? 9 : 8],
        updated_at: params[hasDeletedAt ? 10 : 9],
      };
      badges.push(newBadge);
      storage.set('badges', badges);
      await saveToStorage('badges', badges);
      return { insertId: badges.length - 1, rowsAffected: 1 };
    }

    // UPDATE lc_badges
    if (sql.includes('UPDATE lc_badges')) {
      const badges = storage.get('badges') || [];
      const hasDeletedAt = sql.includes('deleted_at = ?');
      const index = badges.findIndex((b) => b.id === params[hasDeletedAt ? 7 : 6]);
      if (index !== -1) {
        badges[index] = {
          ...badges[index],
          progress_value: params[0],
          target_value: params[1],
          earned_at: params[2],
          last_progressed_at: params[3],
          deleted_at: hasDeletedAt ? params[4] : badges[index].deleted_at,
          updated_at: params[hasDeletedAt ? 5 : 4],
        };
        storage.set('badges', badges);
        await saveToStorage('badges', badges);
        return { rowsAffected: 1 };
      }
      return { rowsAffected: 0 };
    }

    if (sql.includes('INSERT INTO lc_meta') || sql.includes('REPLACE INTO lc_meta')) {
      const key = params[0];
      const value = params[1];
      const metaRows = storage.get('meta') || [];
      const existingIndex = metaRows.findIndex((entry) => entry.key === key);
      if (existingIndex !== -1) {
        metaRows[existingIndex] = { key, value };
      } else {
        metaRows.push({ key, value });
      }
      storage.set('meta', metaRows);
      meta.set(key, value);
      await saveMetaToStorage();
      return { rowsAffected: 1 };
    }

    if (sql.includes('UPDATE lc_meta')) {
      const value = params[0];
      const key = params[1];
      const metaRows = storage.get('meta') || [];
      const existingIndex = metaRows.findIndex((entry) => entry.key === key);
      if (existingIndex !== -1) {
        metaRows[existingIndex] = { key, value };
        storage.set('meta', metaRows);
        meta.set(key, value);
        await saveMetaToStorage();
        return { rowsAffected: 1 };
      }
      return { rowsAffected: 0 };
    }

    // UPDATE lc_streaks
    if (sql.includes('UPDATE lc_streaks')) {
      const streaks = storage.get('streaks') || [];
      const hasDeletedAt = params.length === 6 && sql.includes('deleted_at');
      const index = streaks.findIndex(s => s.id === params[hasDeletedAt ? 5 : 4]); // WHERE id = ? is last param
      if (index !== -1) {
        if (hasDeletedAt) {
          streaks[index] = {
            ...streaks[index],
            current_streak: params[0],
            longest_streak: params[1],
            last_increment_date: params[2],
            deleted_at: params[3],
            updated_at: params[4],
          };
        } else {
          streaks[index] = {
            ...streaks[index],
            current_streak: params[0],
            longest_streak: params[1],
            last_increment_date: params[2],
            updated_at: params[3],
          };
        }
        storage.set('streaks', streaks);
        await saveToStorage('streaks', streaks);
        return { rowsAffected: 1 };
      }
      return { rowsAffected: 0 };
    }
    
    return { rowsAffected: 0 };
  },
  
  getAllAsync: async <T>(sql: string, params: any[] = []): Promise<T[]> => {
    if (sql.includes('FROM lc_counters')) {
      let counters = storage.get('counters') || [];
      
      // Filter by user_id if provided
      if (sql.includes('user_id = ?') && params.length > 0) {
        const userId = params[0];
        counters = counters.filter(c => c.user_id === userId);
      }
      
      // Filter by updated_at if in WHERE clause (for sync)
      if (sql.includes('updated_at > ?')) {
        // updated_at param is typically after user_id
        const updatedAtParamIndex = sql.includes('user_id = ?') ? 1 : 0;
        const timestamp = params[updatedAtParamIndex];
        if (timestamp) {
          counters = counters.filter(c => {
            try {
              return new Date(c.updated_at).getTime() > new Date(timestamp).getTime();
            } catch {
              return true; // Include if we can't parse dates
            }
          });
        }
      }
      
      // If querying for deleted_at IS NOT NULL, include deleted counters
      if (sql.includes('deleted_at IS NOT NULL')) {
        counters = counters.filter(c => c.deleted_at);
      } else if (sql.includes('deleted_at IS NULL')) {
        // If querying for deleted_at IS NULL, exclude deleted counters
        counters = counters.filter(c => !c.deleted_at);
      } else {
        // Default: filter out deleted counters
        counters = counters.filter(c => !c.deleted_at);
      }
      
      // Handle ORDER BY
      if (sql.includes('ORDER BY')) {
        if (sql.includes('ORDER BY sort_index, created_at')) {
          counters.sort((a, b) => {
            const sortDiff = (a.sort_index || 0) - (b.sort_index || 0);
            if (sortDiff !== 0) return sortDiff;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          });
        } else if (sql.includes('ORDER BY sort_index')) {
          counters.sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
        } else if (sql.includes('ORDER BY created_at')) {
          counters.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        }
      }
      
      return counters as T[];
    }
    
    if (sql.includes('FROM lc_events')) {
      let events = storage.get('events') || [];
      // CRITICAL: Add mark_id field to all events for compatibility
      // Events are stored with counter_id, but sync code expects mark_id
      // This ensures both field names are available
      let eventsWithMarkId = events.map(e => ({
        ...e,
        mark_id: e.counter_id || e.mark_id, // Ensure mark_id is set from counter_id
      }));
      
      // Filter by id if in WHERE clause (for single event lookup)
      if (sql.includes('WHERE id = ?')) {
        const eventId = params[0];
        eventsWithMarkId = eventsWithMarkId.filter(e => e.id === eventId);
      }
      
      // Filter by user_id if in WHERE clause
      if (sql.includes('user_id = ?') && params.length > 0) {
        // user_id position depends on whether id is also in the query
        const userIdParamIndex = sql.includes('WHERE id = ?') ? 1 : 0;
        const userId = params[userIdParamIndex];
        if (userId) {
          eventsWithMarkId = eventsWithMarkId.filter(e => e.user_id === userId);
        }
      }
      
      // Filter by counter_id if in WHERE clause
      if (sql.includes('counter_id = ?')) {
        // Find the position of counter_id param
        let counterIdParamIndex = 0;
        if (sql.includes('WHERE id = ?')) counterIdParamIndex++;
        if (sql.includes('user_id = ?')) counterIdParamIndex++;
        if (params[counterIdParamIndex]) {
          const counterId = params[counterIdParamIndex];
          eventsWithMarkId = eventsWithMarkId.filter(e => e.counter_id === counterId);
        }
      }
      
      // Filter by updated_at if in WHERE clause (for sync)
      if (sql.includes('updated_at > ?')) {
        // Find updated_at param position
        let updatedAtParamIndex = 0;
        if (sql.includes('WHERE id = ?')) updatedAtParamIndex++;
        if (sql.includes('user_id = ?')) updatedAtParamIndex++;
        const timestamp = params[updatedAtParamIndex];
        if (timestamp) {
          eventsWithMarkId = eventsWithMarkId.filter(e => {
            try {
              return new Date(e.updated_at).getTime() > new Date(timestamp).getTime();
            } catch {
              return true; // Include if we can't parse dates
            }
          });
        }
      }
      
      // Filter by occurred_local_date if in WHERE clause
      if (sql.includes('occurred_local_date = ?')) {
        // Find the occurred_local_date param position
        let paramIndex = 0;
        if (sql.includes('WHERE id = ?')) paramIndex++;
        if (sql.includes('user_id = ?')) paramIndex++;
        if (sql.includes('counter_id = ?')) paramIndex++;
        if (params[paramIndex]) {
          const date = params[paramIndex];
          eventsWithMarkId = eventsWithMarkId.filter(e => e.occurred_local_date === date);
        }
      }
      
      // Filter by event_type if in WHERE clause
      if (sql.includes("event_type = ?") || sql.includes("event_type = 'increment'")) {
        if (sql.includes("event_type = 'increment'")) {
          eventsWithMarkId = eventsWithMarkId.filter(e => e.event_type === 'increment');
        } else {
          // Find event_type param position
          let paramIndex = 0;
          if (sql.includes('WHERE id = ?')) paramIndex++;
          if (sql.includes('user_id = ?')) paramIndex++;
          if (sql.includes('counter_id = ?')) paramIndex++;
          if (params[paramIndex]) {
            eventsWithMarkId = eventsWithMarkId.filter(e => e.event_type === params[paramIndex]);
          }
        }
      }
      
      // If querying for deleted_at IS NOT NULL, include deleted events
      if (sql.includes('deleted_at IS NOT NULL')) {
        return eventsWithMarkId.filter(e => e.deleted_at) as T[];
      }
      // Default: filter out deleted events
      return eventsWithMarkId.filter(e => !e.deleted_at) as T[];
    }
    
    if (sql.includes('FROM lc_streaks')) {
      let streaks = storage.get('streaks') || [];
      
      // Add mark_id for compatibility with local types
      streaks = streaks.map((s: any) => ({
        ...s,
        mark_id: s.counter_id || s.mark_id,
      }));
      
      // Filter by user_id if in WHERE clause
      if (sql.includes('user_id = ?') && params.length > 0) {
        const userId = params[0];
        streaks = streaks.filter((s: any) => s.user_id === userId);
      }
      
      // Filter by updated_at if in WHERE clause (for sync)
      if (sql.includes('updated_at > ?')) {
        const updatedAtParamIndex = sql.includes('user_id = ?') ? 1 : 0;
        const timestamp = params[updatedAtParamIndex];
        if (timestamp) {
          streaks = streaks.filter((s: any) => {
            try {
              return new Date(s.updated_at).getTime() > new Date(timestamp).getTime();
            } catch {
              return true;
            }
          });
        }
      }
      
      // Filter by counter_id if in WHERE clause
      if (sql.includes('counter_id = ?')) {
        let counterIdParamIndex = 0;
        if (sql.includes('user_id = ?')) counterIdParamIndex++;
        if (params[counterIdParamIndex]) {
          const counterId = params[counterIdParamIndex];
          streaks = streaks.filter((s: any) => s.counter_id === counterId);
        }
      }
      
      // If querying for deleted_at IS NOT NULL, include deleted streaks
      if (sql.includes('deleted_at IS NOT NULL')) {
        return streaks.filter((s: any) => s.deleted_at) as T[];
      }
      // Default: filter out deleted streaks
      return streaks.filter((s: any) => !s.deleted_at) as T[];
    }

    if (sql.includes('FROM lc_badges')) {
      let badges = storage.get('badges') || [];
      
      // Add mark_id for compatibility with local types
      badges = badges.map((b: any) => ({
        ...b,
        mark_id: b.counter_id || b.mark_id,
      }));
      
      // Filter by user_id if in WHERE clause
      if (sql.includes('user_id = ?') && params.length > 0) {
        const userId = params[0];
        badges = badges.filter((b: any) => b.user_id === userId);
      }
      
      // Filter by updated_at if in WHERE clause (for sync)
      if (sql.includes('updated_at > ?')) {
        const updatedAtParamIndex = sql.includes('user_id = ?') ? 1 : 0;
        const timestamp = params[updatedAtParamIndex];
        if (timestamp) {
          badges = badges.filter((b: any) => {
            try {
              return new Date(b.updated_at).getTime() > new Date(timestamp).getTime();
            } catch {
              return true;
            }
          });
        }
      }
      
      // Filter by counter_id if in WHERE clause
      if (sql.includes('counter_id = ?')) {
        let counterIdParamIndex = 0;
        if (sql.includes('user_id = ?')) counterIdParamIndex++;
        if (params[counterIdParamIndex]) {
          const counterId = params[counterIdParamIndex];
          badges = badges.filter((b: any) => b.counter_id === counterId);
        }
      }
      
      // If querying for deleted_at IS NOT NULL, include deleted badges
      if (sql.includes('deleted_at IS NOT NULL')) {
        return badges.filter((b: any) => b.deleted_at) as T[];
      }
      // Default: filter out deleted badges
      return badges.filter((b: any) => !b.deleted_at) as T[];
    }
    
    return [];
  },
  
  getFirstAsync: async <T>(sql: string, params: any[] = []): Promise<T | null> => {
    if (sql.includes('FROM lc_meta')) {
      const key = params[0];
      return { value: meta.get(key) || null } as T;
    }
    
    if (sql.includes('FROM lc_counters') && sql.includes('WHERE id = ?')) {
      const counters = storage.get('counters') || [];
      // If querying for deleted_at specifically, don't filter by deleted_at
      // This allows verification queries to work
      if (sql.includes('SELECT deleted_at')) {
        const result = counters.find(c => c.id === params[0]) || null;
        return result as T | null;
      }
      // Otherwise, filter out deleted counters
      const result = counters.find(c => c.id === params[0] && !c.deleted_at) || null;
      return result as T | null;
    }
    
    // Handle queries with user_id and name (for duplicate checking)
    if (sql.includes('FROM lc_counters') && sql.includes('user_id = ?') && sql.includes('LOWER(name) = LOWER(?)')) {
      const counters = storage.get('counters') || [];
      const userId = params[0];
      const name = params[1];
      const result = counters.find(
        c => c.user_id === userId && 
             c.name.toLowerCase() === name.toLowerCase() && 
             !c.deleted_at
      ) || null;
      return result as T | null;
    }
    
    if (sql.includes('FROM lc_events') && sql.includes('WHERE id = ?')) {
      const events = storage.get('events') || [];
      const result = events.find(e => e.id === params[0] && !e.deleted_at);
      if (result) {
        // CRITICAL: Add mark_id for compatibility with sync code
        return { ...result, mark_id: result.counter_id || result.mark_id } as T;
      }
      return null;
    }
    
    if (sql.includes('FROM lc_streaks') && sql.includes('WHERE counter_id = ?')) {
      const streaks = storage.get('streaks') || [];
      const result = streaks.find(s => s.counter_id === params[0] && !s.deleted_at) || null;
      return result as T | null;
    }
    
    if (sql.includes('FROM lc_streaks') && sql.includes('WHERE id = ?')) {
      const streaks = storage.get('streaks') || [];
      const result = streaks.find(s => s.id === params[0] && !s.deleted_at) || null;
      return result as T | null;
    }

    if (sql.includes('FROM lc_badges') && sql.includes('WHERE id = ?')) {
      const badges = storage.get('badges') || [];
      const result = badges.find(b => b.id === params[0] && !b.deleted_at) || null;
      return result as T | null;
    }

    if (sql.includes('FROM lc_badges') && sql.includes('WHERE counter_id = ?')) {
      const badges = storage.get('badges') || [];
      const result = badges.find(b => b.counter_id === params[0] && !b.deleted_at) || null;
      return result as T | null;
    }
    
    return null;
  },
  
  withTransactionAsync: async <T>(callback: (db: MockDatabase) => Promise<T>): Promise<T> => {
    return callback(createMockDb());
  }
});

let db: MockDatabase | null = null;

export const initDatabase = async (): Promise<MockDatabase> => {
  if (db) return db;
  
  // Load existing data from AsyncStorage first
  await loadFromStorage();
  
  db = createMockDb();
  
  // Initialize tables
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS lc_counters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT,
      color TEXT,
      unit TEXT DEFAULT 'sessions',
      enable_streak INTEGER DEFAULT 1,
      sort_index INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      last_activity_date TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS lc_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      counter_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('increment','reset','decrement')),
      amount INTEGER DEFAULT 1,
      occurred_at TEXT NOT NULL,
      occurred_local_date TEXT NOT NULL,
      meta TEXT DEFAULT '{}',
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (counter_id) REFERENCES lc_counters(id) ON DELETE CASCADE
    );
  `);
  
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS lc_streaks (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      counter_id TEXT NOT NULL,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_increment_date TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (counter_id) REFERENCES lc_counters(id) ON DELETE CASCADE
    );
  `);
  
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS lc_badges (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      counter_id TEXT NOT NULL,
      badge_code TEXT NOT NULL,
      progress_value INTEGER DEFAULT 0,
      target_value INTEGER NOT NULL,
      earned_at TEXT,
      last_progressed_at TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (counter_id) REFERENCES lc_counters(id) ON DELETE CASCADE
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS lc_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  
  meta.set('db_version', '1');
  
  return db;
};

export const getDatabase = (): MockDatabase => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

// Helper function to run queries
export const query = async <T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> => {
  const database = getDatabase();
  return await database.getAllAsync<T>(sql, params);
};

export const queryFirst = async <T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> => {
  const database = getDatabase();
  return await database.getFirstAsync<T>(sql, params);
};

export const execute = async (
  sql: string,
  params?: any[]
): Promise<MockResult> => {
  const database = getDatabase();
  return await database.runAsync(sql, params);
};

// Transaction helper
export const transaction = async <T>(
  callback: (tx: MockDatabase) => Promise<T>
): Promise<T> => {
  const database = getDatabase();
  return await database.withTransactionAsync(callback);
};

// Cleanup function to remove badges with invalid user_id (like "local-user")
export const cleanupInvalidBadges = async (): Promise<number> => {
  try {
    const badges = storage.get('badges') || [];
    const initialCount = badges.length;
    
    // Filter out badges with "local-user" or other invalid user_ids
    const validBadges = badges.filter((b) => {
      // Keep badges with valid UUID user_id or null/undefined (will be filtered by sync)
      if (!b.user_id) return false; // Remove badges without user_id
      // Remove badges with "local-user" or other non-UUID user_ids
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(b.user_id);
    });
    
    const removedCount = initialCount - validBadges.length;
    
    if (removedCount > 0) {
      storage.set('badges', validBadges);
      await saveToStorage('badges', validBadges);
      logger.log(`[CLEANUP] Removed ${removedCount} badge(s) with invalid user_id (local-user)`);
    }
    
    return removedCount;
  } catch (error) {
    logger.error('[CLEANUP] Error cleaning up invalid badges:', error);
    return 0;
  }
};

