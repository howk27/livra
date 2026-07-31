// lib/data/types.ts
//
// M9 Phase 1 — the ONLY type source for the new online-first data layer (`lib/data/`).
//
// The `Database` block below is GENERATED VERBATIM from the live schema via the
// Supabase MCP (`generate_typescript_types`, project `jhsxeibhxrvqrgkadyfk`,
// 2026-07-29). Do not hand-edit it — regenerate and paste. It exists so a column
// that is dropped or renamed on the server becomes a `tsc` error here, instead of
// a silent runtime 400 like the `dailyTarget` pull and the six dropped cadence
// columns cost this project twice.
//
// REGENERATED 2026-07-30 for `goal_notes.deleted_at` (M9 Phase 3, migration
// 20260730_goal_notes_deleted_at.sql). The generator was run in full and its output
// DIFFED against this file by comparing every table's column set to
// information_schema — all 23 tables matched live except that one added column, so
// the three lines below are the generator's own output, not a hand guess. That diff
// is worth re-running rather than trusting a paste: it is the check that would have
// caught the `dailyTarget` drift years earlier than the API log did.
//
// App-facing row types are DERIVED from that block (never re-typed by hand) below
// the generated section.
//
// NOTE (reconciliation with the hand-written `types/` models, Phase 1 Task 1 Step 3):
// the old system's `types/index.ts` / `types/goal.ts` disagree with the live schema
// in ways worth knowing — they are NOT edited in this phase (they belong to the old
// system) but the disagreements are real findings:
//   • The DB is more permissive than the app claimed: marks.unit / total /
//     enable_streak / sort_index / created_at / updated_at, mark_events.amount /
//     created_at / updated_at, and goals.milestones_fired are all NULLABLE server-side
//     while the hand-written types mark them required. This layer honors the nullability.
//   • The hand-written `Mark` carries local-only fields (goal_value, goal_period,
//     schedule_type, schedule_days, skip_tokens_*, health_kit_*) that do NOT exist on
//     public.marks — they live only in local SQLite. `Goal` carries target_date
//     (deprecated) and linked_mark_ids (projected from goal_mark_links, not a column).
//   • The DB does not constrain enums: goals.status, goals.tier, goals.frequency and
//     mark_events.event_type are plain `string` server-side.

// ─────────────────────────────────────────────────────────────────────────────
// GENERATED — do not edit by hand. Source: Supabase `generate_typescript_types`
// project jhsxeibhxrvqrgkadyfk, 2026-07-29. Regenerate to update.
// ─────────────────────────────────────────────────────────────────────────────

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_generation_events: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_goal_packages: {
        Row: {
          confirmed: boolean
          created_at: string
          goal_text: string
          goal_text_normalized: string
          id: string
          package_json: Json
          user_id: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          goal_text: string
          goal_text_normalized: string
          id?: string
          package_json: Json
          user_id: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          goal_text?: string
          goal_text_normalized?: string
          id?: string
          package_json?: Json
          user_id?: string
        }
        Relationships: []
      }
      counter_badges: {
        Row: {
          badge_code: string
          counter_id: string
          created_at: string
          deleted_at: string | null
          earned_at: string | null
          id: string
          last_progressed_at: string | null
          progress_value: number
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          badge_code: string
          counter_id: string
          created_at?: string
          deleted_at?: string | null
          earned_at?: string | null
          id: string
          last_progressed_at?: string | null
          progress_value?: number
          target_value: number
          updated_at?: string
          user_id: string
        }
        Update: {
          badge_code?: string
          counter_id?: string
          created_at?: string
          deleted_at?: string | null
          earned_at?: string | null
          id?: string
          last_progressed_at?: string | null
          progress_value?: number
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counter_badges_counter_id_fkey1"
            columns: ["counter_id"]
            isOneToOne: false
            referencedRelation: "counters"
            referencedColumns: ["id"]
          },
        ]
      }
      counter_events: {
        Row: {
          amount: number
          counter_id: string
          created_at: string
          deleted_at: string | null
          event_type: string
          id: string
          meta: Json | null
          occurred_at: string
          occurred_local_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          counter_id: string
          created_at?: string
          deleted_at?: string | null
          event_type: string
          id: string
          meta?: Json | null
          occurred_at: string
          occurred_local_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          counter_id?: string
          created_at?: string
          deleted_at?: string | null
          event_type?: string
          id?: string
          meta?: Json | null
          occurred_at?: string
          occurred_local_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counter_events_counter_id_fkey1"
            columns: ["counter_id"]
            isOneToOne: false
            referencedRelation: "counters"
            referencedColumns: ["id"]
          },
        ]
      }
      counter_streaks: {
        Row: {
          counter_id: string
          created_at: string
          current_streak: number
          deleted_at: string | null
          id: string
          last_increment_date: string | null
          longest_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          counter_id: string
          created_at?: string
          current_streak?: number
          deleted_at?: string | null
          id: string
          last_increment_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          counter_id?: string
          created_at?: string
          current_streak?: number
          deleted_at?: string | null
          id?: string
          last_increment_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counter_streaks_counter_id_fkey1"
            columns: ["counter_id"]
            isOneToOne: false
            referencedRelation: "counters"
            referencedColumns: ["id"]
          },
        ]
      }
      counters: {
        Row: {
          color: string | null
          created_at: string
          dailyTarget: number | null
          deleted_at: string | null
          emoji: string | null
          enable_streak: boolean
          gate_type: string | null
          gated: boolean | null
          id: string
          last_activity_date: string | null
          max_per_day: number | null
          min_interval_minutes: number | null
          name: string
          sort_index: number
          total: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          dailyTarget?: number | null
          deleted_at?: string | null
          emoji?: string | null
          enable_streak?: boolean
          gate_type?: string | null
          gated?: boolean | null
          id: string
          last_activity_date?: string | null
          max_per_day?: number | null
          min_interval_minutes?: number | null
          name: string
          sort_index?: number
          total?: number
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          dailyTarget?: number | null
          deleted_at?: string | null
          emoji?: string | null
          enable_streak?: boolean
          gate_type?: string | null
          gated?: boolean | null
          id?: string
          last_activity_date?: string | null
          max_per_day?: number | null
          min_interval_minutes?: number | null
          name?: string
          sort_index?: number
          total?: number
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goal_mark_links: {
        Row: {
          created_at: string
          deleted_at: string | null
          goal_id: string
          id: string
          mark_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          goal_id: string
          id: string
          mark_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          goal_id?: string
          id?: string
          mark_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_mark_links_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_mark_links_mark_id_fkey"
            columns: ["mark_id"]
            isOneToOne: false
            referencedRelation: "marks"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_notes: {
        Row: {
          created_at: string
          deleted_at: string | null
          goal_id: string
          id: string
          local_date: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          goal_id: string
          id?: string
          local_date: string
          text?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          goal_id?: string
          id?: string
          local_date?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_notes_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          banked_momentum_days: number | null
          color: string | null
          completed_at: string | null
          created_at: string
          current_mark_count: number
          deadline_date: string | null
          deleted_at: string | null
          description: string | null
          frequency: string | null
          icon: string | null
          id: string
          milestones_fired: Json | null
          sort_index: number
          status: string
          target_mark_count: number | null
          tier: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          banked_momentum_days?: number | null
          color?: string | null
          completed_at?: string | null
          created_at?: string
          current_mark_count?: number
          deadline_date?: string | null
          deleted_at?: string | null
          description?: string | null
          frequency?: string | null
          icon?: string | null
          id: string
          milestones_fired?: Json | null
          sort_index?: number
          status?: string
          target_mark_count?: number | null
          tier?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          banked_momentum_days?: number | null
          color?: string | null
          completed_at?: string | null
          created_at?: string
          current_mark_count?: number
          deadline_date?: string | null
          deleted_at?: string | null
          description?: string | null
          frequency?: string | null
          icon?: string | null
          id?: string
          milestones_fired?: Json | null
          sort_index?: number
          status?: string
          target_mark_count?: number | null
          tier?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      iap_transactions: {
        Row: {
          created_at: string
          environment: string | null
          id: number
          original_transaction_id: string | null
          platform: string
          product_id: string
          purchased_at: string | null
          transaction_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          environment?: string | null
          id?: number
          original_transaction_id?: string | null
          platform: string
          product_id: string
          purchased_at?: string | null
          transaction_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          environment?: string | null
          id?: number
          original_transaction_id?: string | null
          platform?: string
          product_id?: string
          purchased_at?: string | null
          transaction_id?: string
          user_id?: string
        }
        Relationships: []
      }
      lc_badges: {
        Row: {
          badge_code: string
          counter_id: string
          created_at: string
          deleted_at: string | null
          earned_at: string | null
          id: string
          last_progressed_at: string | null
          progress_value: number | null
          target_value: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          badge_code: string
          counter_id: string
          created_at: string
          deleted_at?: string | null
          earned_at?: string | null
          id: string
          last_progressed_at?: string | null
          progress_value?: number | null
          target_value: number
          updated_at: string
          user_id?: string | null
        }
        Update: {
          badge_code?: string
          counter_id?: string
          created_at?: string
          deleted_at?: string | null
          earned_at?: string | null
          id?: string
          last_progressed_at?: string | null
          progress_value?: number | null
          target_value?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lc_badges_counter_id_fkey"
            columns: ["counter_id"]
            isOneToOne: false
            referencedRelation: "lc_counters"
            referencedColumns: ["id"]
          },
        ]
      }
      lc_counters: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          emoji: string | null
          enable_streak: number | null
          id: string
          last_activity_date: string | null
          name: string
          sort_index: number | null
          total: number | null
          unit: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at: string
          deleted_at?: string | null
          emoji?: string | null
          enable_streak?: number | null
          id: string
          last_activity_date?: string | null
          name: string
          sort_index?: number | null
          total?: number | null
          unit?: string | null
          updated_at: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          emoji?: string | null
          enable_streak?: number | null
          id?: string
          last_activity_date?: string | null
          name?: string
          sort_index?: number | null
          total?: number | null
          unit?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      lc_events: {
        Row: {
          amount: number | null
          counter_id: string
          created_at: string
          deleted_at: string | null
          event_type: string
          id: string
          meta: string | null
          occurred_at: string
          occurred_local_date: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          counter_id: string
          created_at: string
          deleted_at?: string | null
          event_type: string
          id: string
          meta?: string | null
          occurred_at: string
          occurred_local_date: string
          updated_at: string
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          counter_id?: string
          created_at?: string
          deleted_at?: string | null
          event_type?: string
          id?: string
          meta?: string | null
          occurred_at?: string
          occurred_local_date?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lc_events_counter_id_fkey"
            columns: ["counter_id"]
            isOneToOne: false
            referencedRelation: "lc_counters"
            referencedColumns: ["id"]
          },
        ]
      }
      lc_meta: {
        Row: {
          key: string
          value: string | null
        }
        Insert: {
          key: string
          value?: string | null
        }
        Update: {
          key?: string
          value?: string | null
        }
        Relationships: []
      }
      lc_streaks: {
        Row: {
          counter_id: string
          created_at: string
          current_streak: number | null
          deleted_at: string | null
          id: string
          last_increment_date: string | null
          longest_streak: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          counter_id: string
          created_at: string
          current_streak?: number | null
          deleted_at?: string | null
          id: string
          last_increment_date?: string | null
          longest_streak?: number | null
          updated_at: string
          user_id?: string | null
        }
        Update: {
          counter_id?: string
          created_at?: string
          current_streak?: number | null
          deleted_at?: string | null
          id?: string
          last_increment_date?: string | null
          longest_streak?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lc_streaks_counter_id_fkey"
            columns: ["counter_id"]
            isOneToOne: false
            referencedRelation: "lc_counters"
            referencedColumns: ["id"]
          },
        ]
      }
      mark_badges: {
        Row: {
          badge_code: string
          created_at: string
          deleted_at: string | null
          earned_at: string | null
          id: string
          last_progressed_at: string | null
          mark_id: string
          progress_value: number
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          badge_code: string
          created_at?: string
          deleted_at?: string | null
          earned_at?: string | null
          id?: string
          last_progressed_at?: string | null
          mark_id: string
          progress_value?: number
          target_value: number
          updated_at?: string
          user_id: string
        }
        Update: {
          badge_code?: string
          created_at?: string
          deleted_at?: string | null
          earned_at?: string | null
          id?: string
          last_progressed_at?: string | null
          mark_id?: string
          progress_value?: number
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counter_badges_counter_id_fkey"
            columns: ["mark_id"]
            isOneToOne: false
            referencedRelation: "marks"
            referencedColumns: ["id"]
          },
        ]
      }
      mark_events: {
        Row: {
          amount: number | null
          created_at: string | null
          deleted_at: string | null
          event_type: string
          id: string
          mark_id: string
          meta: Json | null
          occurred_at: string
          occurred_local_date: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          deleted_at?: string | null
          event_type: string
          id?: string
          mark_id: string
          meta?: Json | null
          occurred_at?: string
          occurred_local_date: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          deleted_at?: string | null
          event_type?: string
          id?: string
          mark_id?: string
          meta?: Json | null
          occurred_at?: string
          occurred_local_date?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counter_events_counter_id_fkey"
            columns: ["mark_id"]
            isOneToOne: false
            referencedRelation: "marks"
            referencedColumns: ["id"]
          },
        ]
      }
      mark_notes: {
        Row: {
          created_at: string
          date: string
          id: string
          mark_id: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          mark_id: string
          text?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          mark_id?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mark_streaks: {
        Row: {
          created_at: string | null
          current_streak: number | null
          deleted_at: string | null
          id: string
          last_increment_date: string | null
          longest_streak: number | null
          mark_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_streak?: number | null
          deleted_at?: string | null
          id?: string
          last_increment_date?: string | null
          longest_streak?: number | null
          mark_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_streak?: number | null
          deleted_at?: string | null
          id?: string
          last_increment_date?: string | null
          longest_streak?: number | null
          mark_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counter_streaks_counter_id_fkey"
            columns: ["mark_id"]
            isOneToOne: false
            referencedRelation: "marks"
            referencedColumns: ["id"]
          },
        ]
      }
      marks: {
        Row: {
          color: string | null
          created_at: string | null
          dailyTarget: number | null
          deleted_at: string | null
          emoji: string | null
          enable_streak: boolean | null
          frequency_kind: string | null
          frequency_max: number | null
          frequency_min: number | null
          frequency_recommended: number | null
          goal_id: string | null
          id: string
          last_activity_date: string | null
          maintenance_of: string | null
          name: string
          sort_index: number | null
          total: number | null
          unit: string | null
          updated_at: string | null
          user_id: string
          weekly_target: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          dailyTarget?: number | null
          deleted_at?: string | null
          emoji?: string | null
          enable_streak?: boolean | null
          frequency_kind?: string | null
          frequency_max?: number | null
          frequency_min?: number | null
          frequency_recommended?: number | null
          goal_id?: string | null
          id?: string
          last_activity_date?: string | null
          maintenance_of?: string | null
          name: string
          sort_index?: number | null
          total?: number | null
          unit?: string | null
          updated_at?: string | null
          user_id: string
          weekly_target?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          dailyTarget?: number | null
          deleted_at?: string | null
          emoji?: string | null
          enable_streak?: boolean | null
          frequency_kind?: string | null
          frequency_max?: number | null
          frequency_min?: number | null
          frequency_recommended?: number | null
          goal_id?: string | null
          id?: string
          last_activity_date?: string | null
          maintenance_of?: string | null
          name?: string
          sort_index?: number | null
          total?: number | null
          unit?: string | null
          updated_at?: string | null
          user_id?: string
          weekly_target?: number | null
        }
        Relationships: []
      }
      marks_cadence_backfill_20260727: {
        Row: {
          captured_at: string
          frequency_kind: string | null
          frequency_max: number | null
          frequency_min: number | null
          frequency_recommended: number | null
          mark_id: string
          name: string | null
          weekly_target: number | null
        }
        Insert: {
          captured_at?: string
          frequency_kind?: string | null
          frequency_max?: number | null
          frequency_min?: number | null
          frequency_recommended?: number | null
          mark_id: string
          name?: string | null
          weekly_target?: number | null
        }
        Update: {
          captured_at?: string
          frequency_kind?: string | null
          frequency_max?: number | null
          frequency_min?: number | null
          frequency_recommended?: number | null
          mark_id?: string
          name?: string | null
          weekly_target?: number | null
        }
        Relationships: []
      }
      marks_goal_id_snapshot_20260728: {
        Row: {
          captured_at: string
          deleted_at: string | null
          goal_id: string | null
          mark_id: string
          mark_name: string | null
          user_id: string | null
        }
        Insert: {
          captured_at?: string
          deleted_at?: string | null
          goal_id?: string | null
          mark_id: string
          mark_name?: string | null
          user_id?: string | null
        }
        Update: {
          captured_at?: string
          deleted_at?: string | null
          goal_id?: string | null
          mark_id?: string
          mark_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_uses_count: number
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email_verified_at: string | null
          full_name: string | null
          iap_last_transaction_id: string | null
          id: string
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          onboarding_focus_area: string | null
          pro_expires_at: string | null
          pro_original_transaction_id: string | null
          pro_product_id: string | null
          pro_status: string | null
          pro_unlocked: boolean | null
          pro_unlocked_at: string | null
        }
        Insert: {
          ai_uses_count?: number
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email_verified_at?: string | null
          full_name?: string | null
          iap_last_transaction_id?: string | null
          id: string
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_focus_area?: string | null
          pro_expires_at?: string | null
          pro_original_transaction_id?: string | null
          pro_product_id?: string | null
          pro_status?: string | null
          pro_unlocked?: boolean | null
          pro_unlocked_at?: string | null
        }
        Update: {
          ai_uses_count?: number
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email_verified_at?: string | null
          full_name?: string | null
          iap_last_transaction_id?: string | null
          id?: string
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_focus_area?: string | null
          pro_expires_at?: string | null
          pro_original_transaction_id?: string | null
          pro_product_id?: string | null
          pro_status?: string | null
          pro_unlocked?: boolean | null
          pro_unlocked_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_ai_generation_slot: {
        Args: {
          p_daily_limit?: number
          p_hourly_limit?: number
          p_user: string
        }
        Returns: Json
      }
      consume_free_ai_use: { Args: { p_user_id: string }; Returns: boolean }
      delete_auth_user: {
        Args: { user_id_to_delete: string }
        Returns: undefined
      }
      get_avatar_url: { Args: { user_id_param: string }; Returns: string }
      increment_ai_uses_count: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      livra_count_other_active_goals: {
        Args: { p_id: string; p_user: string }
        Returns: number
      }
      livra_count_other_active_marks: {
        Args: { p_id: string; p_user: string }
        Returns: number
      }
      livra_count_other_marks_for_goal: {
        Args: { p_goal: string; p_id: string; p_user: string }
        Returns: number
      }
      livra_is_pro: { Args: { p_user: string }; Returns: boolean }
      refund_free_ai_use: { Args: { p_user_id: string }; Returns: undefined }
      update_own_profile: {
        Args: {
          avatar_url_param?: string
          display_name_param?: string
          full_name_param?: string
          onboarding_completed_param?: boolean
        }
        Returns: undefined
      }
      update_pro_status: {
        Args: {
          p_expires_at?: string
          p_original_transaction_id?: string
          p_pro_unlocked?: boolean
          p_product_id?: string
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      verify_rls_policies: {
        Args: never
        Returns: {
          policy_count: number
          rls_enabled: boolean
          status: string
          table_name: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// END GENERATED
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// App-facing row types — DERIVED from the generated `Database` above.
// Never hand-write a column list here; a schema change must flow through the
// generated block and surface as a `tsc` error at the call site.
// ─────────────────────────────────────────────────────────────────────────────

/** A row exactly as `public.<table>` returns it (nullability included). */
export type GoalRow = Tables<"goals">;
export type MarkRow = Tables<"marks">;
export type MarkEventRow = Tables<"mark_events">;
export type GoalNoteRow = Tables<"goal_notes">;
export type GoalMarkLinkRow = Tables<"goal_mark_links">;

// The app talks in these names. They are aliases of the DB rows on purpose: the
// read layer returns exactly what the server holds, and any transform belongs to
// a caller, not to the type. (Phase 3 may introduce richer domain types once the
// write path and outbox exist; Phase 1 stays faithful to the row.)
export type Goal = GoalRow;
export type Mark = MarkRow;
export type CheckIn = MarkEventRow;
export type GoalNote = GoalNoteRow;
export type GoalMarkLink = GoalMarkLinkRow;
