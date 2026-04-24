-- =============================================================================
-- Iteracja 6 — Książka adresowa per obiekt + kategorie dokumentów + storage
-- + seed cyklicznych zadań biurowych
--
-- Per spec PDF (str. 6-7 — "wymagane dane"):
--   • Książka adresowa, osoby funkcyjne (z @ i tel + odpowiedzialność)
--   • Dokumentacja projektowa, Protokoły z poprzednich lat, IBP + plany
--     ewakuacyjne, terminy przeglądów + producenci, DTR dla BOZ
--
-- + seed Terminarz biurowy (str. 5):
--   Ubezpieczenie firmy + samochody (BMW, Dodge), renegocjacje umów
--   (Bolechowo Wspólnota GOO, Hotel HP Park Poznań).
-- =============================================================================

-- ---- 1. building_contacts -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.building_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id     UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  role            TEXT NOT NULL,                  -- np. "Inspektor BHP", "Zarządca", "Konserwator"
  responsibility  TEXT,                           -- za co odpowiada w obiekcie
  email           TEXT,
  phone           TEXT,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE, -- główny kontakt obiektu (max 1)
  is_emergency    BOOLEAN NOT NULL DEFAULT FALSE, -- kontakt awaryjny (24/7)
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bc_building       ON public.building_contacts (building_id);
CREATE INDEX IF NOT EXISTS idx_bc_primary        ON public.building_contacts (building_id) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_bc_emergency      ON public.building_contacts (building_id) WHERE is_emergency = TRUE;

ALTER TABLE public.building_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bc_super_admin_all" ON public.building_contacts;
CREATE POLICY "bc_super_admin_all" ON public.building_contacts
  FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS "bc_company_read" ON public.building_contacts;
CREATE POLICY "bc_company_read" ON public.building_contacts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.buildings b
      WHERE b.id = building_contacts.building_id
        AND b.company_id = public.get_user_company_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "bc_admin_manage" ON public.building_contacts;
CREATE POLICY "bc_admin_manage" ON public.building_contacts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.buildings b
      WHERE b.id = building_contacts.building_id
        AND public.is_company_admin(b.company_id)
    )
  );

-- updated_at trigger (use existing helper if present)
DROP TRIGGER IF EXISTS trg_bc_updated_at ON public.building_contacts;
CREATE TRIGGER trg_bc_updated_at
  BEFORE UPDATE ON public.building_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();

COMMENT ON TABLE public.building_contacts IS
  'Osoby funkcyjne per obiekt: zarządca, inspektor BHP, konserwator etc. (spec PDF str. 6).';

-- ---- 2. building_documents.category ---------------------------------------
ALTER TABLE public.building_documents
  ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IN (
      'IBP',                    -- Instrukcja Bezpieczeństwa Pożarowego
      'plan_ewakuacji',
      'dokumentacja_projektowa',
      'protokol_archive',       -- Protokoły z lat poprzednich
      'DTR',                    -- Dokumentacja Techniczno-Ruchowa (BOZ)
      'certyfikat',
      'umowa',
      'inne'
    ));

ALTER TABLE public.building_documents ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE public.building_documents ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_bd_category ON public.building_documents (category);

COMMENT ON COLUMN public.building_documents.category IS
  'Kategoria dokumentu — używana w UI biblioteki obiektu (filtr + ikona).';

-- ---- 3. Storage bucket + polityki dla SLA photos ---------------------------
INSERT INTO storage.buckets (id, name, public)
SELECT 'sla-photos', 'sla-photos', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'sla-photos');

DROP POLICY IF EXISTS "SLA photos public upload"   ON storage.objects;
DROP POLICY IF EXISTS "SLA photos auth read"       ON storage.objects;
DROP POLICY IF EXISTS "SLA photos auth manage"     ON storage.objects;

-- Public formularz /zgloszenie potrzebuje móc wrzucać zdjęcia bez sesji
CREATE POLICY "SLA photos public upload" ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'sla-photos');

CREATE POLICY "SLA photos auth read" ON storage.objects
  FOR SELECT USING (bucket_id = 'sla-photos' AND auth.role() = 'authenticated');

CREATE POLICY "SLA photos auth manage" ON storage.objects
  FOR ALL USING (bucket_id = 'sla-photos' AND auth.role() = 'authenticated');

-- ---- 4. Seed Terminarz biurowy (recurring_events) --------------------------
-- Wymaga obecności tabeli recurring_events (Faza 3). Bezpieczny insert przez
-- ON CONFLICT DO NOTHING na unikalnym tytule + dacie.
DO $iter6$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'recurring_events') THEN

    -- Ubezpieczenie firmy
    INSERT INTO public.recurring_events (type, title, description, due_date, recurrence_rule, reminder_days_before)
    VALUES
      ('insurance',         'Ubezpieczenie OC firmy — odnowienie',
       'Roczna polisa OC działalności gospodarczej. Sprawdzić zakres + sumę gwarancyjną.',
       '2026-12-01', 'FREQ=YEARLY', ARRAY[60,30,7,1]),

      ('insurance',         'Ubezpieczenie samochodu BMW (OC + AC)',
       'Polisa OC/AC dla pojazdu firmowego BMW. Renegocjować z brokerem 30 dni przed.',
       '2026-09-15', 'FREQ=YEARLY', ARRAY[45,14,3]),

      ('insurance',         'Ubezpieczenie samochodu Dodge (OC + AC)',
       'Polisa OC/AC dla pojazdu firmowego Dodge. Renegocjować z brokerem 30 dni przed.',
       '2026-11-20', 'FREQ=YEARLY', ARRAY[45,14,3]),

      ('contract_renewal',  'Renegocjacja umowy — Bolechowo Wspólnota Mieszkaniowa GOO',
       'Roczna renegocjacja umowy na obsługę ppoż. Wspólnoty Mieszkaniowej w Bolechowie.',
       '2026-10-01', 'FREQ=YEARLY', ARRAY[60,30,14,3]),

      ('contract_renewal',  'Renegocjacja umowy — Hotel HP Park Poznań',
       'Roczna renegocjacja umowy z Hotelem HP Park Poznań na pełną obsługę ppoż. obiektu.',
       '2026-08-15', 'FREQ=YEARLY', ARRAY[60,30,14,3])
    ON CONFLICT DO NOTHING;
  END IF;
END
$iter6$;
