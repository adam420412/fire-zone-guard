
-- Device types for categorization
CREATE TABLE public.device_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_interval_days integer NOT NULL DEFAULT 365,
  description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.device_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON public.device_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin_all" ON public.device_types FOR ALL USING (is_super_admin());

-- Devices per building
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  device_type_id uuid NOT NULL REFERENCES public.device_types(id),
  name text NOT NULL,
  manufacturer text DEFAULT '',
  model text DEFAULT '',
  serial_number text DEFAULT '',
  location_in_building text DEFAULT '',
  installed_at date,
  last_service_date date,
  next_service_date date,
  status text NOT NULL DEFAULT 'aktywne',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.devices FOR ALL USING (is_super_admin());
CREATE POLICY "admin_company" ON public.devices FOR ALL USING (
  EXISTS (SELECT 1 FROM buildings b WHERE b.id = devices.building_id AND is_company_admin(b.company_id))
);
CREATE POLICY "employee_read" ON public.devices FOR SELECT USING (
  EXISTS (SELECT 1 FROM buildings b WHERE b.id = devices.building_id AND b.company_id = get_user_company_id(auth.uid()))
);
CREATE POLICY "client_read" ON public.devices FOR SELECT USING (
  has_role(auth.uid(), 'client') AND EXISTS (SELECT 1 FROM buildings b WHERE b.id = devices.building_id AND b.company_id = get_user_company_id(auth.uid()))
);

-- Global task templates
CREATE TABLE public.task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  type task_type NOT NULL DEFAULT 'przegląd',
  priority task_priority NOT NULL DEFAULT 'średni',
  sla_hours integer NOT NULL DEFAULT 72,
  recurrence_days integer DEFAULT 365,
  is_global boolean NOT NULL DEFAULT true,
  building_id uuid REFERENCES public.buildings(id) ON DELETE CASCADE,
  device_type_id uuid REFERENCES public.device_types(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON public.task_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin_all" ON public.task_templates FOR ALL USING (is_super_admin());
CREATE POLICY "admin_manage" ON public.task_templates FOR ALL USING (
  is_global = false AND building_id IS NOT NULL AND EXISTS (SELECT 1 FROM buildings b WHERE b.id = task_templates.building_id AND is_company_admin(b.company_id))
);

-- Device service history
CREATE TABLE public.device_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id),
  performed_at date NOT NULL DEFAULT CURRENT_DATE,
  performed_by uuid,
  result text NOT NULL DEFAULT 'sprawny',
  notes text DEFAULT '',
  next_service_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.device_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.device_services FOR ALL USING (is_super_admin());
CREATE POLICY "company_read" ON public.device_services FOR SELECT USING (
  EXISTS (SELECT 1 FROM devices d JOIN buildings b ON b.id = d.building_id WHERE d.id = device_services.device_id AND b.company_id = get_user_company_id(auth.uid()))
);
CREATE POLICY "admin_manage" ON public.device_services FOR ALL USING (
  EXISTS (SELECT 1 FROM devices d JOIN buildings b ON b.id = d.building_id WHERE d.id = device_services.device_id AND is_company_admin(b.company_id))
);

-- Seed common device types
INSERT INTO public.device_types (name, service_interval_days, description) VALUES
  ('Gaśnica proszkowa', 365, 'Gaśnica proszkowa ABC – przegląd roczny'),
  ('Gaśnica CO2', 365, 'Gaśnica śniegowa CO2 – przegląd roczny'),
  ('Hydrant wewnętrzny', 365, 'Hydrant wewnętrzny DN25/DN52 – przegląd roczny'),
  ('Hydrant zewnętrzny', 365, 'Hydrant zewnętrzny – przegląd roczny'),
  ('Czujka dymu', 365, 'Czujka optyczna/jonizacyjna – test roczny'),
  ('Czujka temperatury', 365, 'Czujka temperatury – test roczny'),
  ('Centrala SAP', 365, 'Centrala sygnalizacji alarmu pożarowego'),
  ('ROP (ręczny ostrzegacz)', 365, 'Ręczny ostrzegacz pożarowy – test roczny'),
  ('Klapa dymowa', 365, 'Klapa oddymiająca – przegląd roczny'),
  ('Drzwi przeciwpożarowe', 365, 'Drzwi EI30/EI60 – kontrola roczna'),
  ('Oświetlenie awaryjne', 365, 'Oprawy oświetlenia ewakuacyjnego – test roczny'),
  ('Instalacja tryskaczowa', 365, 'System tryskaczy – przegląd roczny'),
  ('Przeciwpożarowy wyłącznik prądu', 365, 'PWP – test roczny');

-- Seed global task templates
INSERT INTO public.task_templates (name, description, type, priority, sla_hours, recurrence_days, is_global, device_type_id) VALUES
  ('Przegląd gaśnic', 'Roczny przegląd gaśnic zgodnie z PN-EN 3', 'przegląd', 'średni', 168, 365, true, (SELECT id FROM device_types WHERE name = 'Gaśnica proszkowa')),
  ('Przegląd hydrantów wewnętrznych', 'Próba ciśnieniowa i pomiar wydajności', 'przegląd', 'średni', 168, 365, true, (SELECT id FROM device_types WHERE name = 'Hydrant wewnętrzny')),
  ('Test systemu SAP', 'Pełny test centrali i czujek', 'przegląd', 'wysoki', 72, 365, true, (SELECT id FROM device_types WHERE name = 'Centrala SAP')),
  ('Kontrola drzwi ppoż', 'Sprawdzenie samozamykaczy i uszczelek', 'przegląd', 'średni', 168, 365, true, (SELECT id FROM device_types WHERE name = 'Drzwi przeciwpożarowe')),
  ('Test oświetlenia awaryjnego', 'Test autonomii baterii i widoczności', 'przegląd', 'średni', 168, 365, true, (SELECT id FROM device_types WHERE name = 'Oświetlenie awaryjne')),
  ('Próba ewakuacji', 'Ćwiczenia ewakuacyjne obiektu', 'ewakuacja', 'wysoki', 72, 365, true, NULL),
  ('Audyt PPOŻ', 'Roczny audyt zgodności z przepisami', 'audyt', 'wysoki', 168, 365, true, NULL),
  ('Szkolenie PPOŻ pracowników', 'Szkolenie z zakresu ochrony PPOŻ', 'szkolenie', 'średni', 168, 365, true, NULL);
