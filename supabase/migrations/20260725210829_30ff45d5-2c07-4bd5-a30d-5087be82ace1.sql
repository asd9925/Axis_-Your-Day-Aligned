ALTER TABLE public.objectives ADD COLUMN IF NOT EXISTS repeat_daily boolean NOT NULL DEFAULT false;

CREATE TABLE public.objective_day_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (objective_id, log_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objective_day_logs TO authenticated;
GRANT ALL ON public.objective_day_logs TO service_role;

ALTER TABLE public.objective_day_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own objective day logs"
  ON public.objective_day_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_objective_day_logs_user_date
  ON public.objective_day_logs (user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_objective_day_logs_objective
  ON public.objective_day_logs (objective_id);