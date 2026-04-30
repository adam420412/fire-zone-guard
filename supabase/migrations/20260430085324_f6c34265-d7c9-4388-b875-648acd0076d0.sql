-- Link tasks to sales opportunities and contacts (for conversion flow)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES public.sales_opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_opportunity_id ON public.tasks(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON public.tasks(contact_id);