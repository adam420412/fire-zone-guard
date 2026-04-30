ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.sales_opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_quotes_task_id ON public.quotes(task_id);
CREATE INDEX IF NOT EXISTS idx_quotes_building_id ON public.quotes(building_id);
CREATE INDEX IF NOT EXISTS idx_quotes_opportunity_id ON public.quotes(opportunity_id);

CREATE OR REPLACE FUNCTION public.sync_quote_to_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'wyslana' AND (OLD.status IS DISTINCT FROM 'wyslana') AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;
  IF NEW.status = 'zaakceptowana' AND (OLD.status IS DISTINCT FROM 'zaakceptowana') AND NEW.accepted_at IS NULL THEN
    NEW.accepted_at := now();
  END IF;
  IF NEW.status = 'odrzucona' AND (OLD.status IS DISTINCT FROM 'odrzucona') AND NEW.rejected_at IS NULL THEN
    NEW.rejected_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_quote_to_task ON public.quotes;
CREATE TRIGGER trg_sync_quote_to_task
BEFORE UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.sync_quote_to_task();