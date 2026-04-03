
ALTER TABLE public.subtasks ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER PUBLICATION supabase_realtime ADD TABLE public.subtasks;
