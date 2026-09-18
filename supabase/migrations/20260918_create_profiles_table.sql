-- Migration: create profiles table
-- Run this in Supabase SQL editor for the project that your app is using.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  color_today text,
  color_later text,
  color_habits text,
  color_recurring text DEFAULT '#7C6AA8',
  nudge_interval_min integer,
  quiet_start text,
  quiet_end text,
  auto_complete_parent boolean DEFAULT true,
  parked_cutoff_days integer DEFAULT 14,
  tier text DEFAULT 'free',
  unlocked_features text[] DEFAULT ARRAY[]::text[],
  onboarding_completed_at timestamptz,
  google_sync_enabled boolean DEFAULT false,
  google_sync_token text,
  google_sync_calendar_id text,
  google_last_synced_at timestamptz,
  timezone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Optional: trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE PROCEDURE public.update_updated_at_column();
