
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS recurrence_rule jsonb,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recurrence_exception_dates date[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS events_recurrence_parent_idx ON public.events(recurrence_parent_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','plus','pro')),
  ADD COLUMN IF NOT EXISTS unlocked_features text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
