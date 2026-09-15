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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_user_connections: {
        Row: {
          account_email: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      break_logs: {
        Row: {
          activity: string
          id: string
          taken_at: string
          user_id: string
        }
        Insert: {
          activity: string
          id?: string
          taken_at?: string
          user_id: string
        }
        Update: {
          activity?: string
          id?: string
          taken_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dream_vision: {
        Row: {
          created_at: string
          life_areas: Json
          reflection_prompt_seen_date: string | null
          updated_at: string
          user_id: string
          vision_statement: string | null
        }
        Insert: {
          created_at?: string
          life_areas?: Json
          reflection_prompt_seen_date?: string | null
          updated_at?: string
          user_id: string
          vision_statement?: string | null
        }
        Update: {
          created_at?: string
          life_areas?: Json
          reflection_prompt_seen_date?: string | null
          updated_at?: string
          user_id?: string
          vision_statement?: string | null
        }
        Relationships: []
      }
      dreams: {
        Row: {
          category: string
          color: string | null
          created_at: string
          horizon: string
          id: string
          status: string
          title: string
          updated_at: string
          user_id: string
          why: string | null
        }
        Insert: {
          category?: string
          color?: string | null
          created_at?: string
          horizon?: string
          id?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
          why?: string | null
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          horizon?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          why?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          category: string | null
          completed_at: string | null
          completed_occurrence_dates: string[]
          created_at: string
          dream_id: string | null
          ends_at: string
          google_calendar_id: string | null
          google_etag: string | null
          google_event_id: string | null
          google_updated_at: string | null
          id: string
          is_important: boolean
          location: string | null
          notes: string | null
          recurrence_exception_dates: string[]
          recurrence_parent_id: string | null
          recurrence_rule: Json | null
          source: string | null
          starts_at: string
          task_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          completed_occurrence_dates?: string[]
          created_at?: string
          dream_id?: string | null
          ends_at: string
          google_calendar_id?: string | null
          google_etag?: string | null
          google_event_id?: string | null
          google_updated_at?: string | null
          id?: string
          is_important?: boolean
          location?: string | null
          notes?: string | null
          recurrence_exception_dates?: string[]
          recurrence_parent_id?: string | null
          recurrence_rule?: Json | null
          source?: string | null
          starts_at: string
          task_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          completed_occurrence_dates?: string[]
          created_at?: string
          dream_id?: string | null
          ends_at?: string
          google_calendar_id?: string | null
          google_etag?: string | null
          google_event_id?: string | null
          google_updated_at?: string | null
          id?: string
          is_important?: boolean
          location?: string | null
          notes?: string | null
          recurrence_exception_dates?: string[]
          recurrence_parent_id?: string | null
          recurrence_rule?: Json | null
          source?: string | null
          starts_at?: string
          task_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_dream_id_fkey"
            columns: ["dream_id"]
            isOneToOne: false
            referencedRelation: "dreams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_steps: {
        Row: {
          cadence: string
          created_at: string
          goal_id: string
          id: string
          is_ai_suggested: boolean
          position: number
          preferred_time: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cadence?: string
          created_at?: string
          goal_id: string
          id?: string
          is_ai_suggested?: boolean
          position?: number
          preferred_time?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cadence?: string
          created_at?: string
          goal_id?: string
          id?: string
          is_ai_suggested?: boolean
          position?: number
          preferred_time?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_steps_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          cadence: string
          created_at: string
          dream_id: string | null
          id: string
          notes: string | null
          status: string
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cadence?: string
          created_at?: string
          dream_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cadence?: string
          created_at?: string
          dream_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_dream_id_fkey"
            columns: ["dream_id"]
            isOneToOne: false
            referencedRelation: "dreams"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_logs: {
        Row: {
          created_at: string
          habit_id: string
          id: string
          log_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          habit_id: string
          id?: string
          log_date?: string
          user_id: string
        }
        Update: {
          created_at?: string
          habit_id?: string
          id?: string
          log_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          cadence: string
          color: string | null
          created_at: string
          dream_id: string | null
          id: string
          kind: string
          position: number
          title: string
          user_id: string
        }
        Insert: {
          cadence?: string
          color?: string | null
          created_at?: string
          dream_id?: string | null
          id?: string
          kind?: string
          position?: number
          title: string
          user_id: string
        }
        Update: {
          cadence?: string
          color?: string | null
          created_at?: string
          dream_id?: string | null
          id?: string
          kind?: string
          position?: number
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habits_dream_id_fkey"
            columns: ["dream_id"]
            isOneToOne: false
            referencedRelation: "dreams"
            referencedColumns: ["id"]
          },
        ]
      }
      objective_day_logs: {
        Row: {
          completed_at: string
          created_at: string
          id: string
          log_date: string
          objective_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          id?: string
          log_date: string
          objective_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          id?: string
          log_date?: string
          objective_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "objective_day_logs_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      objectives: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          position: number
          repeat_daily: boolean
          scope: string
          scope_date: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          repeat_daily?: boolean
          scope: string
          scope_date: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          repeat_daily?: boolean
          scope?: string
          scope_date?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auto_complete_parent: boolean | null
          color_habits: string | null
          color_later: string | null
          color_recurring: string
          color_today: string | null
          created_at: string
          display_name: string | null
          google_last_synced_at: string | null
          google_sync_calendar_id: string | null
          google_sync_enabled: boolean
          google_sync_token: string | null
          id: string
          nudge_interval_min: number | null
          onboarding_completed_at: string | null
          parked_cutoff_days: number
          quiet_end: string | null
          quiet_start: string | null
          tier: string
          timezone: string | null
          unlocked_features: string[]
          updated_at: string
        }
        Insert: {
          auto_complete_parent?: boolean | null
          color_habits?: string | null
          color_later?: string | null
          color_recurring?: string
          color_today?: string | null
          created_at?: string
          display_name?: string | null
          google_last_synced_at?: string | null
          google_sync_calendar_id?: string | null
          google_sync_enabled?: boolean
          google_sync_token?: string | null
          id: string
          nudge_interval_min?: number | null
          onboarding_completed_at?: string | null
          parked_cutoff_days?: number
          quiet_end?: string | null
          quiet_start?: string | null
          tier?: string
          timezone?: string | null
          unlocked_features?: string[]
          updated_at?: string
        }
        Update: {
          auto_complete_parent?: boolean | null
          color_habits?: string | null
          color_later?: string | null
          color_recurring?: string
          color_today?: string | null
          created_at?: string
          display_name?: string | null
          google_last_synced_at?: string | null
          google_sync_calendar_id?: string | null
          google_sync_enabled?: boolean
          google_sync_token?: string | null
          id?: string
          nudge_interval_min?: number | null
          onboarding_completed_at?: string | null
          parked_cutoff_days?: number
          quiet_end?: string | null
          quiet_start?: string | null
          tier?: string
          timezone?: string | null
          unlocked_features?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          bucket: string
          completed_at: string | null
          created_at: string
          dream_id: string | null
          due_time: string | null
          first_parked_at: string | null
          goal_step_id: string | null
          id: string
          notes: string | null
          parent_id: string | null
          parked_snoozed_until: string | null
          position: number
          task_date: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bucket?: string
          completed_at?: string | null
          created_at?: string
          dream_id?: string | null
          due_time?: string | null
          first_parked_at?: string | null
          goal_step_id?: string | null
          id?: string
          notes?: string | null
          parent_id?: string | null
          parked_snoozed_until?: string | null
          position?: number
          task_date?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bucket?: string
          completed_at?: string | null
          created_at?: string
          dream_id?: string | null
          due_time?: string | null
          first_parked_at?: string | null
          goal_step_id?: string | null
          id?: string
          notes?: string | null
          parent_id?: string | null
          parked_snoozed_until?: string | null
          position?: number
          task_date?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_dream_id_fkey"
            columns: ["dream_id"]
            isOneToOne: false
            referencedRelation: "dreams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_goal_step_id_fkey"
            columns: ["goal_step_id"]
            isOneToOne: false
            referencedRelation: "goal_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_rhythm: {
        Row: {
          chore_anchors: string | null
          created_at: string
          focus_end: string | null
          focus_start: string | null
          journaling_time: string | null
          keep_free_windows: Json
          movement_time: string | null
          notes: string | null
          prefers_times: boolean
          updated_at: string
          user_id: string
          wake_time: string | null
          winddown_time: string | null
        }
        Insert: {
          chore_anchors?: string | null
          created_at?: string
          focus_end?: string | null
          focus_start?: string | null
          journaling_time?: string | null
          keep_free_windows?: Json
          movement_time?: string | null
          notes?: string | null
          prefers_times?: boolean
          updated_at?: string
          user_id: string
          wake_time?: string | null
          winddown_time?: string | null
        }
        Update: {
          chore_anchors?: string | null
          created_at?: string
          focus_end?: string | null
          focus_start?: string | null
          journaling_time?: string | null
          keep_free_windows?: Json
          movement_time?: string | null
          notes?: string | null
          prefers_times?: boolean
          updated_at?: string
          user_id?: string
          wake_time?: string | null
          winddown_time?: string | null
        }
        Relationships: []
      }
      user_streaks: {
        Row: {
          created_at: string
          current_streak: number
          last_qualified_date: string | null
          longest_streak: number
          max_stage: number
          stage: number
          updated_at: string
          user_id: string
          variant: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          last_qualified_date?: string | null
          longest_streak?: number
          max_stage?: number
          stage?: number
          updated_at?: string
          user_id: string
          variant?: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          last_qualified_date?: string | null
          longest_streak?: number
          max_stage?: number
          stage?: number
          updated_at?: string
          user_id?: string
          variant?: string
        }
        Relationships: []
      }
      vision_board_items: {
        Row: {
          area_key: string | null
          caption: string | null
          created_at: string
          id: string
          image_path: string | null
          kind: string
          position: number
          text_content: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          area_key?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          kind: string
          position?: number
          text_content?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          area_key?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          kind?: string
          position?: number
          text_content?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
