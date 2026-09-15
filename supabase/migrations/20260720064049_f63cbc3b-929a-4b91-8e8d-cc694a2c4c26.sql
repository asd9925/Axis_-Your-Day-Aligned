
-- Dreams table
CREATE TABLE public.dreams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  why text,
  category text NOT NULL DEFAULT 'growth',
  horizon text NOT NULL DEFAULT '90d',
  status text NOT NULL DEFAULT 'active',
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dreams TO authenticated;
GRANT ALL ON public.dreams TO service_role;

ALTER TABLE public.dreams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own dreams" ON public.dreams
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER dreams_set_updated_at
  BEFORE UPDATE ON public.dreams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX dreams_user_idx ON public.dreams(user_id, status);

-- Link dreams into the rest of the system
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS dream_id uuid REFERENCES public.dreams(id) ON DELETE SET NULL;
ALTER TABLE public.habits ADD COLUMN IF NOT EXISTS dream_id uuid REFERENCES public.dreams(id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS dream_id uuid REFERENCES public.dreams(id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS dream_id uuid REFERENCES public.dreams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_dream_idx ON public.tasks(dream_id);
CREATE INDEX IF NOT EXISTS habits_dream_idx ON public.habits(dream_id);
CREATE INDEX IF NOT EXISTS events_dream_idx ON public.events(dream_id);
CREATE INDEX IF NOT EXISTS goals_dream_idx ON public.goals(dream_id);
