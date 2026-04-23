ALTER TABLE public.recurring_events
  ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL;

ALTER TABLE public.recurring_events
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.recurring_events
  ADD COLUMN IF NOT EXISTS recurrence_type TEXT;

UPDATE public.recurring_events
SET recurrence_type = type
WHERE recurrence_type IS NULL AND type IS NOT NULL;

ALTER TABLE public.recurring_events
  ALTER COLUMN due_date DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_recurring_events_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.recurrence_type IS NOT NULL AND (NEW.type IS NULL OR NEW.type IS DISTINCT FROM NEW.recurrence_type) THEN
    NEW.type := NEW.recurrence_type;
  ELSIF NEW.type IS NOT NULL AND (NEW.recurrence_type IS NULL OR NEW.recurrence_type IS DISTINCT FROM NEW.type) THEN
    NEW.recurrence_type := NEW.type;
  END IF;

  IF NEW.next_due_date IS NOT NULL AND (NEW.due_date IS NULL OR NEW.due_date IS DISTINCT FROM NEW.next_due_date) THEN
    NEW.due_date := NEW.next_due_date;
  ELSIF NEW.due_date IS NOT NULL AND (NEW.next_due_date IS NULL OR NEW.next_due_date IS DISTINCT FROM NEW.due_date) THEN
    NEW.next_due_date := NEW.due_date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_recurring_events ON public.recurring_events;
CREATE TRIGGER trg_sync_recurring_events
  BEFORE INSERT OR UPDATE ON public.recurring_events
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_recurring_events_columns();

CREATE INDEX IF NOT EXISTS idx_recurring_events_building_id
  ON public.recurring_events(building_id);
CREATE INDEX IF NOT EXISTS idx_recurring_events_company_id
  ON public.recurring_events(company_id);
CREATE INDEX IF NOT EXISTS idx_recurring_events_next_due_date
  ON public.recurring_events(next_due_date);

NOTIFY pgrst, 'reload schema';