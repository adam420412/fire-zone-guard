
ALTER TABLE public.sales_opportunities
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title text;

CREATE INDEX IF NOT EXISTS idx_sales_opps_assignee ON public.sales_opportunities(assignee_id);
CREATE INDEX IF NOT EXISTS idx_sales_opps_follow_up ON public.sales_opportunities(follow_up_at);
CREATE INDEX IF NOT EXISTS idx_sales_opps_building ON public.sales_opportunities(building_id);
CREATE INDEX IF NOT EXISTS idx_sales_opps_task ON public.sales_opportunities(task_id);
