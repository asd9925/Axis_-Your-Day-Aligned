
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS completed_occurrence_dates TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS color_recurring TEXT NOT NULL DEFAULT '#7C6AA8';
