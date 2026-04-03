
CREATE TABLE public.sales_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text DEFAULT '',
  contact_email text DEFAULT '',
  contact_phone text DEFAULT '',
  description text DEFAULT '',
  estimated_value numeric DEFAULT 0,
  source text DEFAULT 'manual',
  status text NOT NULL DEFAULT 'nowy_lead',
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all" ON public.sales_opportunities FOR ALL USING (is_super_admin());
CREATE POLICY "authenticated_read" ON public.sales_opportunities FOR SELECT TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_opportunities;
