
-- goals
CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  target_date DATE,
  cadence TEXT NOT NULL DEFAULT 'daily',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals" ON public.goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER goals_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- goal_steps
CREATE TABLE public.goal_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'daily',
  preferred_time TIME,
  position INTEGER NOT NULL DEFAULT 0,
  is_ai_suggested BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_steps TO authenticated;
GRANT ALL ON public.goal_steps TO service_role;
ALTER TABLE public.goal_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goal steps" ON public.goal_steps FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER goal_steps_updated_at BEFORE UPDATE ON public.goal_steps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- tasks additions
ALTER TABLE public.tasks
  ADD COLUMN goal_step_id UUID REFERENCES public.goal_steps(id) ON DELETE SET NULL,
  ADD COLUMN first_parked_at TIMESTAMPTZ,
  ADD COLUMN parked_snoozed_until DATE;

-- initial back-fill: existing "later" bucket tasks get first_parked_at = created_at
UPDATE public.tasks SET first_parked_at = created_at WHERE bucket = 'later' AND first_parked_at IS NULL;

-- trigger to maintain first_parked_at
CREATE OR REPLACE FUNCTION public.tasks_parked_tracker()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.bucket = 'later' AND NEW.first_parked_at IS NULL THEN
      NEW.first_parked_at := now();
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
      NEW.first_parked_at := NULL;
      NEW.parked_snoozed_until := NULL;
    ELSIF NEW.bucket = 'later' AND OLD.bucket <> 'later' THEN
      NEW.first_parked_at := now();
      NEW.parked_snoozed_until := NULL;
    ELSIF NEW.bucket <> 'later' AND OLD.bucket = 'later' THEN
      NEW.first_parked_at := NULL;
      NEW.parked_snoozed_until := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tasks_parked_tracker
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_parked_tracker();

-- events additions
ALTER TABLE public.events ADD COLUMN is_important BOOLEAN NOT NULL DEFAULT false;

-- profiles additions
ALTER TABLE public.profiles ADD COLUMN parked_cutoff_days INTEGER NOT NULL DEFAULT 14;
