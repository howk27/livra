import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Mark } from '../types';
import { execute, query, queryFirst } from '../lib/db';
import { cleanupDuplicateCounters } from '../lib/db/cleanup';
import { logger } from '../lib/utils/logger';

// Custom error class for duplicate marks
export class DuplicateMarkError extends Error {
  constructor(public markName: string) {
    super(`A mark with the name "${markName}" already exists`);
    this.name = 'DuplicateMarkError';
  }
}

// Export as DuplicateCounterError for backwards compatibility
// Use class extension to ensure instanceof works correctly
export class DuplicateCounterError extends DuplicateMarkError {
  constructor(public counterName: string) {
    super(counterName);
    this.name = 'DuplicateCounterError';
    // Also set markName for compatibility
    (this as any).markName = counterName;
  }
}

interface MarksState {
  marks: Mark[];
  loading: boolean;
  error: string | null;
  
  // Actions
  loadMarks: (userId?: string) => Promise<void>;
  addMark: (mark: Omit<Mark, 'id' | 'created_at' | 'updated_at'>) => Promise<Mark>;
  updateMark: (id: string, updates: Partial<Mark>) => Promise<void>;
  deleteMark: (id: string) => Promise<void>;
  incrementTotal: (id: string, amount: number) => Promise<void>;
  getMark: (id: string) => Mark | undefined;
}

export const useMarksStore = create<MarksState>((set, get) => ({
  marks: [],
  loading: false,
  error: null,

  loadMarks: async (userId?: string) => {
    set({ loading: true, error: null });
    try {
      // If userId is provided, filter by user_id; otherwise show all (for local-only users)
      // CRITICAL: Always filter out deleted marks
      const sql = userId
        ? 'SELECT * FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL ORDER BY sort_index, created_at'
        : 'SELECT * FROM lc_counters WHERE deleted_at IS NULL ORDER BY sort_index, created_at';
      const params = userId ? [userId] : [];
      const marks = await query<Mark>(sql, params);
      
      // Double-check: filter out any marks with deleted_at set (defensive programming)
      const activeMarks = marks.filter((m) => !m.deleted_at);
      
      // CRITICAL: Deduplicate by ID - keep the most recent version based on updated_at
      // This prevents duplicate marks from appearing in the store
      const marksMap = new Map<string, Mark>();
      for (const mark of activeMarks) {
        const existing = marksMap.get(mark.id);
        if (!existing || new Date(mark.updated_at) > new Date(existing.updated_at)) {
          marksMap.set(mark.id, mark);
        }
      }
      const uniqueMarks = Array.from(marksMap.values());
      
      // If deduplication removed any marks, log a warning and run cleanup
      if (uniqueMarks.length !== activeMarks.length) {
        logger.warn(`[MarksSlice] Deduplicated ${activeMarks.length - uniqueMarks.length} duplicate mark(s)`);
        // Run cleanup in background to permanently mark duplicates as deleted
        cleanupDuplicateCounters(userId).catch((error) => {
          logger.error('[MarksSlice] Error running cleanup:', error);
        });
      }
      
      set({ marks: uniqueMarks, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  addMark: async (markData) => {
    // Check for duplicate mark name in the store first (faster check)
    const store = get();
    const duplicateInStore = store.marks.find(
      (m) => m.user_id === markData.user_id && 
             m.name.toLowerCase() === markData.name.toLowerCase() &&
             !m.deleted_at
    );

    if (duplicateInStore) {
      throw new DuplicateMarkError(markData.name);
    }

    // Also check the database (in case it's not in the store yet)
    const existingMark = await queryFirst<Mark>(
      'SELECT * FROM lc_counters WHERE user_id = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL',
      [markData.user_id, markData.name]
    );

    if (existingMark) {
      throw new DuplicateMarkError(markData.name);
    }

    const now = new Date().toISOString();
    const mark: Mark = {
      ...markData,
      id: uuidv4(),
      created_at: now,
      updated_at: now,
      total: 0,
    };

    await execute(
      `INSERT INTO lc_counters (
        id, user_id, name, emoji, color, unit, enable_streak, 
        sort_index, total, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mark.id,
        mark.user_id,
        mark.name,
        mark.emoji,
        mark.color,
        mark.unit,
        mark.enable_streak ? 1 : 0,
        mark.sort_index,
        mark.total,
        mark.created_at,
        mark.updated_at,
      ]
    );

    set((state) => ({
      marks: [...state.marks, mark],
    }));

    return mark;
  },

  updateMark: async (id, updates) => {
    const now = new Date().toISOString();
    const mark = get().marks.find((m) => m.id === id);
    if (!mark) return;

    const updated = { ...mark, ...updates, updated_at: now };

    // OPTIMISTIC UPDATE: Update store immediately for instant UI feedback
    set((state) => ({
      marks: state.marks.map((m) => (m.id === id ? updated : m)),
    }));

    // Persist to database in background (don't await to avoid blocking UI)
    execute(
      `UPDATE lc_counters SET 
        name = ?, emoji = ?, color = ?, unit = ?, enable_streak = ?,
        sort_index = ?, total = ?, last_activity_date = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.name,
        updated.emoji,
        updated.color,
        updated.unit,
        updated.enable_streak ? 1 : 0,
        updated.sort_index,
        updated.total,
        updated.last_activity_date,
        updated.updated_at,
        id,
      ]
    ).catch((error) => {
      logger.error('Error persisting mark update to database:', error);
      // On error, revert optimistic update by reloading from database
      const userId = mark.user_id;
      if (userId) {
        get().loadMarks(userId).catch((err) => {
          logger.error('Error reloading marks after failed update:', err);
        });
      }
    });
  },

  deleteMark: async (id) => {
    const now = new Date().toISOString();
    const result = await execute('UPDATE lc_counters SET deleted_at = ?, updated_at = ? WHERE id = ?', [
      now,
      now,
      id,
    ]);

    // Verify the deletion actually happened
    const verify = await queryFirst<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM lc_counters WHERE id = ?',
      [id]
    );

    if (!verify || !verify.deleted_at) {
      logger.error(`[DELETE] Failed to delete mark ${id} - deleted_at is still null`);
      throw new Error('Failed to delete mark. Please try again.');
    }

    set((state) => ({
      marks: state.marks.filter((m) => m.id !== id),
    }));
  },

  incrementTotal: async (id, amount) => {
    const mark = get().marks.find((m) => m.id === id);
    if (!mark) return;

    await get().updateMark(id, { total: mark.total + amount });
  },

  getMark: (id) => {
    return get().marks.find((m) => m.id === id);
  },
}));

// Export as useCountersStore for backwards compatibility
// Maps the "Marks" API to the "Counters" API expected by the rest of the codebase
export const useCountersStore = ((selector?: any) => {
  if (selector) {
    // Used as a hook with selector: useCountersStore((state) => state.counters)
    return useMarksStore((state) => {
      const mappedState = {
        ...state,
        counters: state.marks,
        loadCounters: state.loadMarks,
        addCounter: state.addMark,
        updateCounter: state.updateMark,
        deleteCounter: state.deleteMark,
        incrementTotal: state.incrementTotal,
        getCounter: state.getMark,
      };
      return selector(mappedState);
    });
  } else {
    // Used as a hook without selector: useCountersStore()
    return useMarksStore((state) => ({
      ...state,
      counters: state.marks,
      loadCounters: state.loadMarks,
      addCounter: state.addMark,
      updateCounter: state.updateMark,
      deleteCounter: state.deleteMark,
      incrementTotal: state.incrementTotal,
      getCounter: state.getMark,
    }));
  }
}) as typeof useMarksStore & {
  getState: () => {
    counters: Mark[];
    loading: boolean;
    error: string | null;
    loadCounters: (userId?: string) => Promise<void>;
    addCounter: (counter: Omit<Mark, 'id' | 'created_at' | 'updated_at'>) => Promise<Mark>;
    updateCounter: (id: string, updates: Partial<Mark>) => Promise<void>;
    deleteCounter: (id: string) => Promise<void>;
    incrementTotal: (id: string, amount: number) => Promise<void>;
    getCounter: (id: string) => Mark | undefined;
  };
  setState: (stateOrUpdater: any) => void;
};

// Add getState and setState methods for direct access
(useCountersStore as any).getState = () => {
  const store = useMarksStore.getState();
  return {
    ...store,
    counters: store.marks,
    loadCounters: store.loadMarks,
    addCounter: store.addMark,
    updateCounter: store.updateMark,
    deleteCounter: store.deleteMark,
    incrementTotal: store.incrementTotal,
    getCounter: store.getMark,
  };
};

(useCountersStore as any).setState = (stateOrUpdater: any) => {
  // Handle function updater (like setState(() => ({ ... })))
  if (typeof stateOrUpdater === 'function') {
    const currentState = useMarksStore.getState();
    const mappedCurrentState = {
      ...currentState,
      counters: currentState.marks,
      loadCounters: currentState.loadMarks,
      addCounter: currentState.addMark,
      updateCounter: currentState.updateMark,
      deleteCounter: currentState.deleteMark,
      incrementTotal: currentState.incrementTotal,
      getCounter: currentState.getMark,
    };
    const newState = stateOrUpdater(mappedCurrentState);
    
    // Map back to marks format
    if (newState && typeof newState === 'object') {
      if (newState.counters !== undefined) {
        useMarksStore.setState({ marks: newState.counters });
      } else {
        useMarksStore.setState(newState);
      }
    }
  } else {
    // Handle plain object
    if (stateOrUpdater && stateOrUpdater.counters !== undefined) {
      useMarksStore.setState({ marks: stateOrUpdater.counters });
    } else {
      useMarksStore.setState(stateOrUpdater);
    }
  }
};


