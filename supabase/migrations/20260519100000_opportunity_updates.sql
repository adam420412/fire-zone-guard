CREATE TABLE IF NOT EXISTS public.opportunity_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.sales_opportunities(id) ON DELETE CASCADE,
  author_id uuid,
  author_name text DEFAULT '',
  type text NOT NULL DEFAULT 'note',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_opp_updates_opp ON public.opportunity_updates(opportunity_id);
CREATE INDEX idx_opp_updates_created ON public.opportunity_updates(created_at DESC);

ALTER TABLE public.opportunity_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all" ON public.opportunity_updates FOR ALL USING (is_super_admin());
CREATE POLICY "authenticated_read" ON public.opportunity_updates FOR SELECT TO authenticated USING (true);
