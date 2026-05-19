-- Building device category inventory (Etap 1 - wybór kategorii ppoż obecnych w obiekcie)
CREATE TABLE IF NOT EXISTS public.building_device_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL,
  category_code text NOT NULL,
  is_present boolean NOT NULL DEFAULT false,
  notes text,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, category_code)
);

CREATE INDEX IF NOT EXISTS idx_bdc_building ON public.building_device_categories(building_id);

ALTER TABLE public.building_device_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY bdc_company_read ON public.building_device_categories
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.buildings b
            WHERE b.id = building_device_categories.building_id
              AND b.company_id = public.get_user_company_id(auth.uid()))
  );

CREATE POLICY bdc_admin_manage ON public.building_device_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.buildings b
            WHERE b.id = building_device_categories.building_id
              AND public.is_company_admin(b.company_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.buildings b
            WHERE b.id = building_device_categories.building_id
              AND public.is_company_admin(b.company_id))
  );

CREATE POLICY bdc_super_admin_all ON public.building_device_categories
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TRIGGER trg_bdc_updated_at
  BEFORE UPDATE ON public.building_device_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add extra device-level fields if missing (rich inventory)
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS production_year integer,
  ADD COLUMN IF NOT EXISTS warranty_until date;
