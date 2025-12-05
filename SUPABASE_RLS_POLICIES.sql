-- Row Level Security (RLS) Policies for Livra App
-- Execute these SQL statements in your Supabase SQL Editor to enable RLS and secure your data

-- ============================================================================
-- 1. Enable Row Level Security on all tables
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_badges ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Profiles Table Policies
-- ============================================================================

-- Policy: Users can only view their own profile
CREATE POLICY "users_can_view_own_profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "users_can_insert_own_profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "users_can_update_own_profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: Users can delete their own profile
CREATE POLICY "users_can_delete_own_profile"
  ON profiles
  FOR DELETE
  USING (auth.uid() = id);

-- ============================================================================
-- 3. Counters Table Policies
-- ============================================================================

-- Policy: Users can only view their own counters
CREATE POLICY "users_can_view_own_counters"
  ON counters
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own counters
CREATE POLICY "users_can_insert_own_counters"
  ON counters
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own counters
CREATE POLICY "users_can_update_own_counters"
  ON counters
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own counters
CREATE POLICY "users_can_delete_own_counters"
  ON counters
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. Counter Events Table Policies
-- ============================================================================

-- Policy: Users can only view events for their own counters
CREATE POLICY "users_can_view_own_events"
  ON counter_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_events.counter_id
      AND counters.user_id = auth.uid()
    )
  );

-- Policy: Users can insert events for their own counters
CREATE POLICY "users_can_insert_own_events"
  ON counter_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_events.counter_id
      AND counters.user_id = auth.uid()
    )
    AND counter_events.user_id = auth.uid()
  );

-- Policy: Users can update events for their own counters
CREATE POLICY "users_can_update_own_events"
  ON counter_events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_events.counter_id
      AND counters.user_id = auth.uid()
    )
    AND counter_events.user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_events.counter_id
      AND counters.user_id = auth.uid()
    )
    AND counter_events.user_id = auth.uid()
  );

-- Policy: Users can delete events for their own counters
CREATE POLICY "users_can_delete_own_events"
  ON counter_events
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_events.counter_id
      AND counters.user_id = auth.uid()
    )
    AND counter_events.user_id = auth.uid()
  );

-- ============================================================================
-- 5. Counter Streaks Table Policies
-- ============================================================================

-- Policy: Users can only view streaks for their own counters
CREATE POLICY "users_can_view_own_streaks"
  ON counter_streaks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_streaks.counter_id
      AND counters.user_id = auth.uid()
    )
  );

-- Policy: Users can insert streaks for their own counters
CREATE POLICY "users_can_insert_own_streaks"
  ON counter_streaks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_streaks.counter_id
      AND counters.user_id = auth.uid()
    )
    AND counter_streaks.user_id = auth.uid()
  );

-- Policy: Users can update streaks for their own counters
CREATE POLICY "users_can_update_own_streaks"
  ON counter_streaks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_streaks.counter_id
      AND counters.user_id = auth.uid()
    )
    AND counter_streaks.user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_streaks.counter_id
      AND counters.user_id = auth.uid()
    )
    AND counter_streaks.user_id = auth.uid()
  );

-- Policy: Users can delete streaks for their own counters
CREATE POLICY "users_can_delete_own_streaks"
  ON counter_streaks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_streaks.counter_id
      AND counters.user_id = auth.uid()
    )
    AND counter_streaks.user_id = auth.uid()
  );

-- ============================================================================
-- 6. Counter Badges Table Policies
-- ============================================================================

-- Policy: Users can only view badges for their own counters
CREATE POLICY "users_can_view_own_badges"
  ON counter_badges
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_badges.counter_id
      AND counters.user_id = auth.uid()
    )
  );

-- Policy: Users can insert badges for their own counters
CREATE POLICY "users_can_insert_own_badges"
  ON counter_badges
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_badges.counter_id
      AND counters.user_id = auth.uid()
    )
    AND counter_badges.user_id = auth.uid()
  );

-- Policy: Users can update badges for their own counters
CREATE POLICY "users_can_update_own_badges"
  ON counter_badges
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_badges.counter_id
      AND counters.user_id = auth.uid()
    )
    AND counter_badges.user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_badges.counter_id
      AND counters.user_id = auth.uid()
    )
    AND counter_badges.user_id = auth.uid()
  );

-- Policy: Users can delete badges for their own counters
CREATE POLICY "users_can_delete_own_badges"
  ON counter_badges
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM counters
      WHERE counters.id = counter_badges.counter_id
      AND counters.user_id = auth.uid()
    )
    AND counter_badges.user_id = auth.uid()
  );

-- ============================================================================
-- 7. Verification Steps
-- ============================================================================

-- To verify RLS is working correctly:

-- 1. Test with two different user accounts:
--    a. Sign in as User A
--    b. Create some counters and events
--    c. Sign out and sign in as User B
--    d. Try to query User A's data - you should get empty results

-- 2. Run these queries as authenticated User A:
--    SELECT * FROM counters WHERE user_id = auth.uid(); -- Should return User A's counters
--    SELECT * FROM counters WHERE user_id = '<USER_B_UUID>'; -- Should return empty (RLS blocks it)

-- 3. Test insert policy:
--    -- As User A, try to insert a counter with user_id = User B's UUID
--    INSERT INTO counters (id, user_id, name, ...) VALUES (..., '<USER_B_UUID>', ...);
--    -- This should fail due to RLS policy

-- 4. Check that RLS is enabled:
--    SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('profiles', 'counters', 'counter_events', 'counter_streaks', 'counter_badges');
--    -- rowsecurity should be 't' (true) for all tables

-- ============================================================================
-- 8. Troubleshooting
-- ============================================================================

-- If policies are not working:
-- 1. Verify RLS is enabled: ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
-- 2. Check existing policies: SELECT * FROM pg_policies WHERE tablename = '<table_name>';
-- 3. Drop and recreate policies if needed:
--    DROP POLICY IF EXISTS "policy_name" ON <table_name>;
-- 4. Ensure user is authenticated: SELECT auth.uid();

-- To temporarily disable RLS for testing (NOT RECOMMENDED FOR PRODUCTION):
-- ALTER TABLE <table_name> DISABLE ROW LEVEL SECURITY;

