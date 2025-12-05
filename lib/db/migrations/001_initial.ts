export const migration001 = `
-- Counters table
CREATE TABLE IF NOT EXISTS lc_counters (
  id TEXT PRIMARY KEY,
  user_id TEXT,
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

-- Events table
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

-- Streaks table
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

-- Badges table
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

-- Meta table for app state
CREATE TABLE IF NOT EXISTS lc_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_counters_user ON lc_counters(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_counter ON lc_events(counter_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_date ON lc_events(occurred_local_date);
CREATE INDEX IF NOT EXISTS idx_streaks_counter ON lc_streaks(counter_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_badges_counter ON lc_badges(counter_id) WHERE deleted_at IS NULL;
`;

