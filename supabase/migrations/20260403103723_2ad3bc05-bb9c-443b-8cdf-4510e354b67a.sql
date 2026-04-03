-- Add address and NIP to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address text DEFAULT '';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS nip text DEFAULT '';

-- Contacts table
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text DEFAULT '',
  phone text DEFAULT '',
  position text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.contacts FOR ALL USING (is_super_admin());
CREATE POLICY "company_read" ON public.contacts FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

-- Services catalog
CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  unit_price numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'szt.',
  category text DEFAULT 'Ogólne',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin_all" ON public.services FOR ALL USING (is_super_admin());

-- Quotes
CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  quote_number text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'wersja robocza',
  valid_until date,
  notes text DEFAULT '',
  total numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.quotes FOR ALL USING (is_super_admin());
CREATE POLICY "company_read" ON public.quotes FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

-- Quote items
CREATE TABLE IF NOT EXISTS public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES public.quotes(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.quote_items FOR ALL USING (is_super_admin());
CREATE POLICY "company_read" ON public.quote_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.company_id = get_user_company_id(auth.uid()))
);

-- Seed example services
INSERT INTO public.services (name, description, unit_price, unit, category) VALUES
  ('Przegląd gaśnic', 'Przegląd i legalizacja gaśnic proszkowych/CO2', 35, 'szt.', 'Przeglądy'),
  ('Przegląd hydrantów wewnętrznych', 'Pomiar wydajności i ciśnienia hydrantów DN25/DN52', 85, 'szt.', 'Przeglądy'),
  ('Przegląd systemu SAP', 'Przegląd i konserwacja systemu sygnalizacji alarmu pożarowego', 1200, 'obiekt', 'Systemy'),
  ('Próba ewakuacyjna', 'Organizacja i nadzór nad próbną ewakuacją obiektu', 2500, 'obiekt', 'Szkolenia'),
  ('Szkolenie PPOŻ pracowników', 'Szkolenie z ochrony przeciwpożarowej dla pracowników', 150, 'os.', 'Szkolenia'),
  ('Opracowanie IBP', 'Opracowanie Instrukcji Bezpieczeństwa Pożarowego', 3500, 'obiekt', 'Dokumentacja'),
  ('Aktualizacja IBP', 'Aktualizacja istniejącej Instrukcji Bezpieczeństwa Pożarowego', 1800, 'obiekt', 'Dokumentacja'),
  ('Audyt PPOŻ obiektu', 'Kompleksowy audyt bezpieczeństwa pożarowego obiektu', 4500, 'obiekt', 'Audyty')
ON CONFLICT DO NOTHING;