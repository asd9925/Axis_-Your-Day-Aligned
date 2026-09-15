ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_time time;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS events_task_id_idx ON public.events(task_id);