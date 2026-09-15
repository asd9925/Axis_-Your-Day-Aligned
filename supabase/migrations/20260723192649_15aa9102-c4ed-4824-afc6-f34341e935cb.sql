
CREATE TABLE public.user_rhythm (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wake_time TEXT,
  winddown_time TEXT,
  focus_start TEXT,
  focus_end TEXT,
  movement_time TEXT,
  journaling_time TEXT,
  chore_anchors TEXT,
  prefers_times BOOLEAN NOT NULL DEFAULT true,
  keep_free_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_rhythm TO authenticated;
GRANT ALL ON public.user_rhythm TO service_role;
ALTER TABLE public.user_rhythm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages own rhythm" ON public.user_rhythm
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_rhythm_updated_at BEFORE UPDATE ON public.user_rhythm
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_qualified_date DATE,
  stage INTEGER NOT NULL DEFAULT 0,
  max_stage INTEGER NOT NULL DEFAULT 0,
  variant TEXT NOT NULL DEFAULT 'flower',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_streaks TO authenticated;
GRANT ALL ON public.user_streaks TO service_role;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages own streaks" ON public.user_streaks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_streaks_updated_at BEFORE UPDATE ON public.user_streaks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
