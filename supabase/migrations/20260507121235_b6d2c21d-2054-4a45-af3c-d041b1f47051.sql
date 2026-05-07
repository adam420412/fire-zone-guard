
CREATE TABLE IF NOT EXISTS public.company_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  position text,
  phone text,
  email text,
  notes text,
  is_primary boolean NOT NULL DEFAULT false,
  is_emergency boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_contacts_company ON public.company_contacts(company_id);

ALTER TABLE public.company_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_contacts_read ON public.company_contacts FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin());

CREATE POLICY company_contacts_admin_all ON public.company_contacts FOR ALL
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE TRIGGER trg_company_contacts_updated_at
  BEFORE UPDATE ON public.company_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.company_contact_buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.company_contacts(id) ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, building_id)
);

CREATE INDEX IF NOT EXISTS idx_ccb_contact ON public.company_contact_buildings(contact_id);
CREATE INDEX IF NOT EXISTS idx_ccb_building ON public.company_contact_buildings(building_id);

ALTER TABLE public.company_contact_buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ccb_read ON public.company_contact_buildings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.company_contacts cc
    WHERE cc.id = company_contact_buildings.contact_id
      AND (cc.company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin())
  ));

CREATE POLICY ccb_admin_all ON public.company_contact_buildings FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.company_contacts cc
    WHERE cc.id = company_contact_buildings.contact_id
      AND public.is_company_admin(cc.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.company_contacts cc
    WHERE cc.id = company_contact_buildings.contact_id
      AND public.is_company_admin(cc.company_id)
  ));
