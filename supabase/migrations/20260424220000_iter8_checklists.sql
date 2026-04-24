-- =============================================================================
-- Iteracja 8 — Moduł "Audyty / Checklisty"
--
-- Wymóg z briefu: każdy audyt ppoż., przegląd sprzętu i każda inna kontrola
-- ma być w formie odklikiwalnej listy. Inspektor wchodzi do obiektu, wybiera
-- szablon, ma listę punktów do sprawdzenia, odklikuje OK/NIE_OK/N/A,
-- ewentualnie dodaje notatkę i zdjęcia, na końcu finalizuje. System:
--   - tworzy zadanie typu 'usterka' w Kanbanie dla każdego NIE_OK,
--   - generuje PDF protokołu (client-side, jspdf).
--
-- Encje:
--   checklist_templates       — wielokrotnego użytku szablony (admin lub system)
--   checklist_template_items  — punkty szablonu pogrupowane sekcjami
--   checklist_runs            — instancja: konkretny audyt na konkretnym obiekcie
--   checklist_run_items       — snapshot template_item per run + status + zdjęcia
-- =============================================================================

-- ---- 1. SZABLONY -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,           -- np. 'audyt_pelny_ppoz'
  name          TEXT NOT NULL,
  description   TEXT,
  scope         TEXT NOT NULL DEFAULT 'audyt'
    CHECK (scope IN ('audyt', 'sprzet', 'bhp', 'inne')),
  device_category TEXT,                          -- powiązanie z DEVICE_CATEGORIES (G/H/SSP/...) opcjonalne
  is_system     BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = wbudowany, nie do usunięcia
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE, -- NULL = systemowy globalny
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_scope     ON public.checklist_templates (scope);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_company   ON public.checklist_templates (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checklist_templates_active    ON public.checklist_templates (is_active) WHERE is_active = TRUE;

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ct_super_admin_all" ON public.checklist_templates;
CREATE POLICY "ct_super_admin_all" ON public.checklist_templates
  FOR ALL USING (public.is_super_admin());

-- Każdy zalogowany użytkownik widzi: szablony systemowe + szablony swojej firmy.
DROP POLICY IF EXISTS "ct_read_all_authn" ON public.checklist_templates;
CREATE POLICY "ct_read_all_authn" ON public.checklist_templates
  FOR SELECT USING (
    auth.role() = 'authenticated' AND (
      company_id IS NULL OR company_id = public.get_user_company_id(auth.uid())
    )
  );

-- Adminowie firmy mogą tworzyć/edytować szablony swojej firmy (nie systemowych).
DROP POLICY IF EXISTS "ct_admin_manage" ON public.checklist_templates;
CREATE POLICY "ct_admin_manage" ON public.checklist_templates
  FOR ALL USING (
    is_system = FALSE AND
    company_id IS NOT NULL AND
    public.is_company_admin(company_id)
  );

-- ---- 2. PUNKTY SZABLONU ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_template_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 100,
  section         TEXT,                          -- np. "Drogi ewakuacyjne"
  label           TEXT NOT NULL,                 -- "Czy drzwi domykają się samoczynnie?"
  description     TEXT,                          -- dodatkowy kontekst, ref. do normy
  default_severity TEXT NOT NULL DEFAULT 'średni'
    CHECK (default_severity IN ('niski', 'średni', 'wysoki', 'krytyczny')),
  requires_photo  BOOLEAN NOT NULL DEFAULT FALSE,
  requires_note_on_fail BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_template_items_tpl ON public.checklist_template_items (template_id, sort_order);

ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cti_super_admin_all" ON public.checklist_template_items;
CREATE POLICY "cti_super_admin_all" ON public.checklist_template_items
  FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS "cti_read_via_template" ON public.checklist_template_items;
CREATE POLICY "cti_read_via_template" ON public.checklist_template_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.checklist_templates t
      WHERE t.id = checklist_template_items.template_id
        AND (t.company_id IS NULL OR t.company_id = public.get_user_company_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "cti_admin_manage" ON public.checklist_template_items;
CREATE POLICY "cti_admin_manage" ON public.checklist_template_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.checklist_templates t
      WHERE t.id = checklist_template_items.template_id
        AND t.is_system = FALSE
        AND t.company_id IS NOT NULL
        AND public.is_company_admin(t.company_id)
    )
  );

-- ---- 3. URUCHOMIENIA (RUNS) ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE RESTRICT,
  template_code   TEXT NOT NULL,                 -- snapshot na wypadek kasowania szablonu
  template_name   TEXT NOT NULL,                 -- snapshot
  building_id     UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  company_id      UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  performed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performer_name  TEXT,                          -- snapshot na wypadek kasowania profilu
  status          TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  summary         TEXT,                          -- 1-2 zdania podsumowania
  protocol_url    TEXT,                          -- link do PDF (po finalizacji)
  notes           TEXT,                          -- notatki ogólne audytora
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_runs_company   ON public.checklist_runs (company_id);
CREATE INDEX IF NOT EXISTS idx_checklist_runs_building  ON public.checklist_runs (building_id);
CREATE INDEX IF NOT EXISTS idx_checklist_runs_template  ON public.checklist_runs (template_id);
CREATE INDEX IF NOT EXISTS idx_checklist_runs_status    ON public.checklist_runs (status);
CREATE INDEX IF NOT EXISTS idx_checklist_runs_started   ON public.checklist_runs (started_at DESC);

ALTER TABLE public.checklist_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cr_super_admin_all" ON public.checklist_runs;
CREATE POLICY "cr_super_admin_all" ON public.checklist_runs
  FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS "cr_company_read" ON public.checklist_runs;
CREATE POLICY "cr_company_read" ON public.checklist_runs
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "cr_company_insert" ON public.checklist_runs;
CREATE POLICY "cr_company_insert" ON public.checklist_runs
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND
    company_id = public.get_user_company_id(auth.uid())
  );

-- Update / delete: tylko admin firmy, lub osoba która rozpoczęła
DROP POLICY IF EXISTS "cr_perform_or_admin_update" ON public.checklist_runs;
CREATE POLICY "cr_perform_or_admin_update" ON public.checklist_runs
  FOR UPDATE USING (
    performed_by = auth.uid() OR public.is_company_admin(company_id)
  );

DROP POLICY IF EXISTS "cr_admin_delete" ON public.checklist_runs;
CREATE POLICY "cr_admin_delete" ON public.checklist_runs
  FOR DELETE USING (public.is_company_admin(company_id));

-- ---- 4. POJEDYNCZE PUNKTY URUCHOMIENIA ------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_run_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID NOT NULL REFERENCES public.checklist_runs(id) ON DELETE CASCADE,
  template_item_id    UUID REFERENCES public.checklist_template_items(id) ON DELETE SET NULL,
  sort_order          INTEGER NOT NULL DEFAULT 100,
  section             TEXT,
  label               TEXT NOT NULL,             -- snapshot
  description         TEXT,
  default_severity    TEXT NOT NULL DEFAULT 'średni',
  requires_photo      BOOLEAN NOT NULL DEFAULT FALSE,
  requires_note_on_fail BOOLEAN NOT NULL DEFAULT TRUE,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ok', 'nie_ok', 'na')),
  note                TEXT,
  photo_urls          TEXT[] NOT NULL DEFAULT '{}',
  task_id             UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  completed_at        TIMESTAMPTZ,
  completed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_run_items_run    ON public.checklist_run_items (run_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_checklist_run_items_status ON public.checklist_run_items (run_id, status);
CREATE INDEX IF NOT EXISTS idx_checklist_run_items_task   ON public.checklist_run_items (task_id) WHERE task_id IS NOT NULL;

ALTER TABLE public.checklist_run_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cri_super_admin_all" ON public.checklist_run_items;
CREATE POLICY "cri_super_admin_all" ON public.checklist_run_items
  FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS "cri_via_run" ON public.checklist_run_items;
CREATE POLICY "cri_via_run" ON public.checklist_run_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.checklist_runs r
      WHERE r.id = checklist_run_items.run_id
        AND (r.company_id = public.get_user_company_id(auth.uid())
             OR r.performed_by = auth.uid())
    )
  );

-- ---- updated_at triggers ---------------------------------------------------
DROP TRIGGER IF EXISTS trg_ct_updated_at ON public.checklist_templates;
CREATE TRIGGER trg_ct_updated_at
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();

DROP TRIGGER IF EXISTS trg_cr_updated_at ON public.checklist_runs;
CREATE TRIGGER trg_cr_updated_at
  BEFORE UPDATE ON public.checklist_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();

DROP TRIGGER IF EXISTS trg_cri_updated_at ON public.checklist_run_items;
CREATE TRIGGER trg_cri_updated_at
  BEFORE UPDATE ON public.checklist_run_items
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();

-- ---- 5. STORAGE BUCKET dla zdjęć z audytu ---------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('audit-photos', 'audit-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "audit_photos_authn_insert" ON storage.objects;
CREATE POLICY "audit_photos_authn_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'audit-photos' AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "audit_photos_authn_read" ON storage.objects;
CREATE POLICY "audit_photos_authn_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'audit-photos' AND auth.role() IN ('authenticated', 'anon')
  );

DROP POLICY IF EXISTS "audit_photos_authn_all" ON storage.objects;
CREATE POLICY "audit_photos_authn_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'audit-photos' AND auth.role() = 'authenticated'
  );

-- ---- 6. STORAGE BUCKET dla PDF protokołów audytu --------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('audit-protocols', 'audit-protocols', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "audit_pdf_authn_insert" ON storage.objects;
CREATE POLICY "audit_pdf_authn_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'audit-protocols' AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "audit_pdf_anon_read" ON storage.objects;
CREATE POLICY "audit_pdf_anon_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'audit-protocols' AND auth.role() IN ('authenticated', 'anon')
  );

-- =============================================================================
-- SEED — 6 standardowych szablonów (is_system = TRUE, company_id = NULL)
-- =============================================================================

-- 1. AUDYT PEŁNY PPOŻ. BUDYNKU
WITH t AS (
  INSERT INTO public.checklist_templates
    (code, name, description, scope, is_system, is_active)
  VALUES
    ('audyt_pelny_ppoz',
     'Audyt pełny ppoż. obiektu',
     'Pełny przegląd zgodności obiektu z rozporządzeniem MSWiA. Inspektor obchodzi obiekt sekcja po sekcji.',
     'audyt', TRUE, TRUE)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
  RETURNING id
)
INSERT INTO public.checklist_template_items
  (template_id, sort_order, section, label, default_severity, requires_photo, requires_note_on_fail)
SELECT t.id, x.ord, x.section, x.label, x.sev, x.req_photo, x.req_note FROM t,
(VALUES
  -- DOKUMENTACJA
  (10,  'Dokumentacja', 'IBP — Instrukcja Bezpieczeństwa Pożarowego (aktualna, ≤ 2 lat)', 'krytyczny', FALSE, TRUE),
  (20,  'Dokumentacja', 'Plany ewakuacyjne wywieszone na każdej kondygnacji', 'wysoki', TRUE, TRUE),
  (30,  'Dokumentacja', 'Aktualne protokoły z badań instalacji elektrycznej i odgromowej', 'wysoki', FALSE, TRUE),
  (40,  'Dokumentacja', 'Dziennik szkoleń pracowników z zakresu ppoż.', 'średni', FALSE, TRUE),
  -- DROGI EWAKUACYJNE
  (50,  'Drogi ewakuacyjne', 'Drogi ewakuacyjne wolne od przeszkód i zatarasowania', 'krytyczny', TRUE, TRUE),
  (60,  'Drogi ewakuacyjne', 'Oznakowanie kierunkowe ewakuacji widoczne i czytelne', 'wysoki', TRUE, TRUE),
  (70,  'Drogi ewakuacyjne', 'Drzwi ewakuacyjne otwierają się bez klucza, otwierane od wewnątrz', 'krytyczny', TRUE, TRUE),
  -- GAŚNICE
  (80,  'Gaśnice', 'Gaśnice we właściwych miejscach, dostępne, oznakowane', 'wysoki', TRUE, TRUE),
  (90,  'Gaśnice', 'Aktualna data legalizacji (≤ 1 rok)', 'wysoki', TRUE, TRUE),
  (100, 'Gaśnice', 'Plomby nienaruszone, manometry w zielonej strefie', 'wysoki', TRUE, TRUE),
  -- HYDRANTY
  (110, 'Hydranty', 'Szafki hydrantowe oznakowane, zamykane, dostępne', 'wysoki', TRUE, TRUE),
  (120, 'Hydranty', 'Wąż w komplecie, prądownica obecna, plomba OK', 'wysoki', TRUE, TRUE),
  (130, 'Hydranty', 'Aktualny protokół 5-letniej próby ciśnieniowej', 'wysoki', FALSE, TRUE),
  -- SSP / DSO
  (140, 'SSP / DSO', 'Centrala SSP w trybie dozoru (brak alarmów / awarii)', 'krytyczny', TRUE, TRUE),
  (150, 'SSP / DSO', 'ROP-y dostępne i oznakowane na drogach ewakuacyjnych', 'wysoki', TRUE, TRUE),
  (160, 'SSP / DSO', 'Aktualne protokoły kwartalne / roczne SSP', 'wysoki', FALSE, TRUE),
  -- OŚWIETLENIE
  (170, 'Oświetlenie awaryjne', 'Oprawy świecą po teście, czas pracy ≥ 1h', 'wysoki', TRUE, TRUE),
  (180, 'Oświetlenie awaryjne', 'Oprawy ewakuacyjne oznakowane (E22), widoczne', 'średni', TRUE, TRUE),
  -- DRZWI / KLAPY
  (190, 'Drzwi ppoż.', 'Drzwi EI30/EI60 domykają się samoczynnie, uszczelka OK', 'wysoki', TRUE, TRUE),
  (200, 'Klapy / oddymianie', 'Klapy oddymiające otwierają się przy próbie (lub raport ≤ 1 rok)', 'wysoki', FALSE, TRUE)
) AS x(ord, section, label, sev, req_photo, req_note);

-- 2. PRZEGLĄD GAŚNIC (półroczny)
WITH t AS (
  INSERT INTO public.checklist_templates
    (code, name, description, scope, device_category, is_system)
  VALUES
    ('przeglad_gasnic',
     'Półroczny przegląd gaśnic',
     'Czynności konserwacyjne wymagane co 6 miesięcy zgodnie z PN-EN 671.',
     'sprzet', 'G', TRUE)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.checklist_template_items
  (template_id, sort_order, section, label, default_severity, requires_photo, requires_note_on_fail)
SELECT t.id, x.ord, x.section, x.label, x.sev, x.req_photo, x.req_note FROM t,
(VALUES
  (10, 'Lokalizacja', 'Gaśnica we właściwym miejscu zgodnym z planem rozmieszczenia', 'średni', FALSE, TRUE),
  (20, 'Lokalizacja', 'Dostęp do gaśnicy nie jest zatarasowany', 'wysoki', TRUE, TRUE),
  (30, 'Lokalizacja', 'Oznakowanie F-001 widoczne, czytelne', 'średni', TRUE, TRUE),
  (40, 'Stan techn.', 'Manometr w zielonej strefie (ciśnienie OK)', 'wysoki', TRUE, TRUE),
  (50, 'Stan techn.', 'Plomba zabezpieczająca nienaruszona', 'wysoki', TRUE, TRUE),
  (60, 'Stan techn.', 'Korpus bez śladów korozji, wgnieceń, uszkodzeń', 'wysoki', TRUE, TRUE),
  (70, 'Stan techn.', 'Etykieta czytelna, data produkcji widoczna', 'średni', TRUE, TRUE),
  (80, 'Legalizacja', 'Aktualna data ostatniej legalizacji (≤ 1 rok)', 'wysoki', TRUE, TRUE),
  (90, 'Mocowanie', 'Wieszak / podstawa stabilna, gaśnica nieprzewracająca się', 'średni', FALSE, TRUE)
) AS x(ord, section, label, sev, req_photo, req_note);

-- 3. PRZEGLĄD HYDRANTÓW (roczny)
WITH t AS (
  INSERT INTO public.checklist_templates
    (code, name, description, scope, device_category, is_system)
  VALUES
    ('przeglad_hydrantow',
     'Roczny przegląd hydrantów wewnętrznych',
     'Przegląd zgodnie z PN-EN 671-3. Pełna próba ciśnieniowa co 5 lat.',
     'sprzet', 'H', TRUE)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.checklist_template_items
  (template_id, sort_order, section, label, default_severity, requires_photo, requires_note_on_fail)
SELECT t.id, x.ord, x.section, x.label, x.sev, x.req_photo, x.req_note FROM t,
(VALUES
  (10, 'Szafka', 'Szafka oznakowana znakiem F-002, widoczna, dostępna', 'średni', TRUE, TRUE),
  (20, 'Szafka', 'Drzwiczki otwierają się bez problemów, plomba OK', 'wysoki', TRUE, TRUE),
  (30, 'Wyposażenie', 'Wąż w komplecie (zwinięty / na zwijadle), bez uszkodzeń', 'wysoki', TRUE, TRUE),
  (40, 'Wyposażenie', 'Prądownica obecna, wszystkie pozycje strumienia działają', 'wysoki', TRUE, TRUE),
  (50, 'Wyposażenie', 'Zawór hydrantowy daje się ręcznie otworzyć', 'wysoki', FALSE, TRUE),
  (60, 'Sprawność', 'Po otwarciu zaworu ciśnienie ≥ 0.2 MPa, wydajność OK', 'krytyczny', FALSE, TRUE),
  (70, 'Sprawność', 'Brak wycieków na połączeniach po otwarciu', 'wysoki', TRUE, TRUE),
  (80, 'Próba', 'Aktualna 5-letnia próba ciśnieniowa węża', 'wysoki', FALSE, TRUE)
) AS x(ord, section, label, sev, req_photo, req_note);

-- 4. KWARTALNY TEST SSP
WITH t AS (
  INSERT INTO public.checklist_templates
    (code, name, description, scope, device_category, is_system)
  VALUES
    ('test_ssp_kwartalny',
     'Kwartalny test SSP',
     'Czynności obsługowe co 3 miesiące zgodnie z PKN-CEN/TS 54-14.',
     'sprzet', 'SSP', TRUE)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.checklist_template_items
  (template_id, sort_order, section, label, default_severity, requires_photo, requires_note_on_fail)
SELECT t.id, x.ord, x.section, x.label, x.sev, x.req_photo, x.req_note FROM t,
(VALUES
  (10, 'Centrala', 'Centrala w trybie dozoru — brak czerwonych lampek', 'krytyczny', TRUE, TRUE),
  (20, 'Centrala', 'Kontrolki zasilania głównego i rezerwowego świecą zielono', 'wysoki', TRUE, TRUE),
  (30, 'Centrala', 'Pamięć zdarzeń wydrukowana / sprawdzona, brak nieobsłużonych alarmów', 'średni', FALSE, TRUE),
  (40, 'Akumulatory', 'Akumulatory rezerwowe ≤ 4 lata, napięcie ≥ nominalne', 'wysoki', TRUE, TRUE),
  (50, 'ROP-y', 'Test wybranych ROP-ów — sygnał poprawnie dochodzi do centrali', 'wysoki', FALSE, TRUE),
  (60, 'Czujki', 'Test jednej czujki dymu z każdej strefy (dymówka)', 'wysoki', FALSE, TRUE),
  (70, 'Sygnalizacja', 'Sygnalizatory akustyczne i optyczne aktywne podczas alarmu', 'wysoki', FALSE, TRUE),
  (80, 'Powiązania', 'Sygnał alarmu I/II stopnia poprawnie przesyłany do PSP / DSO / wentylacji', 'krytyczny', FALSE, TRUE)
) AS x(ord, section, label, sev, req_photo, req_note);

-- 5. PRZEGLĄD DRZWI PPOŻ.
WITH t AS (
  INSERT INTO public.checklist_templates
    (code, name, description, scope, device_category, is_system)
  VALUES
    ('przeglad_drzwi_ppoz',
     'Roczny przegląd drzwi ppoż. (EI30/EI60)',
     'Sprawdzenie funkcjonalności drzwi przeciwpożarowych.',
     'sprzet', 'DRZWI', TRUE)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.checklist_template_items
  (template_id, sort_order, section, label, default_severity, requires_photo, requires_note_on_fail)
SELECT t.id, x.ord, x.section, x.label, x.sev, x.req_photo, x.req_note FROM t,
(VALUES
  (10, 'Stan ogólny', 'Tabliczka znamionowa producenta widoczna, klasa odporności OK', 'średni', TRUE, TRUE),
  (20, 'Stan ogólny', 'Brak uszkodzeń mechanicznych skrzydła (wgniecenia, dziury)', 'wysoki', TRUE, TRUE),
  (30, 'Samozamykacz', 'Samozamykacz domyka drzwi pełnym ruchem do zamka', 'krytyczny', TRUE, TRUE),
  (40, 'Samozamykacz', 'Brak wycieków oleju z samozamykacza', 'średni', TRUE, TRUE),
  (50, 'Uszczelki', 'Uszczelka pęczniejąca (ogniochronna) zamontowana, bez uszkodzeń', 'wysoki', TRUE, TRUE),
  (60, 'Uszczelki', 'Uszczelka dymoszczelna w dolnej krawędzi sprawna', 'średni', TRUE, TRUE),
  (70, 'Okucia', 'Klamka, zamek, zawiasy działają płynnie, bez luzów', 'średni', FALSE, TRUE),
  (80, 'Funkcja', 'Drzwi nie są blokowane (klin, hak), zwalniają się po alarmie SSP (jeśli powiązane)', 'krytyczny', TRUE, TRUE)
) AS x(ord, section, label, sev, req_photo, req_note);

-- 6. TEST OŚWIETLENIA AWARYJNEGO (półroczny)
WITH t AS (
  INSERT INTO public.checklist_templates
    (code, name, description, scope, device_category, is_system)
  VALUES
    ('test_oswietlenia_awar',
     'Półroczny test oświetlenia awaryjnego',
     'Test funkcjonalny zgodnie z PN-EN 50172.',
     'sprzet', 'OS_AWAR', TRUE)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.checklist_template_items
  (template_id, sort_order, section, label, default_severity, requires_photo, requires_note_on_fail)
SELECT t.id, x.ord, x.section, x.label, x.sev, x.req_photo, x.req_note FROM t,
(VALUES
  (10, 'Oprawy', 'Wszystkie oprawy świecą po odłączeniu zasilania głównego', 'wysoki', TRUE, TRUE),
  (20, 'Oprawy', 'Czas pracy awaryjnej ≥ 1h (rzeczywisty test)', 'wysoki', FALSE, TRUE),
  (30, 'Znaki', 'Znaki ewakuacyjne (E22) świecą równomiernie, czytelne', 'wysoki', TRUE, TRUE),
  (40, 'Znaki', 'Znaki na właściwych pozycjach (drogi ewakuacyjne, wyjścia)', 'średni', TRUE, TRUE),
  (50, 'Akumulatory', 'Akumulatory bez śladów wycieków, obudowa OK', 'średni', TRUE, TRUE),
  (60, 'Akumulatory', 'Wiek akumulatorów ≤ 4 lata', 'średni', FALSE, TRUE),
  (70, 'Wpis', 'Wpis do dziennika oświetlenia awaryjnego', 'niski', FALSE, TRUE)
) AS x(ord, section, label, sev, req_photo, req_note);

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE public.checklist_templates IS
  'Iter 8: szablony list kontrolnych ppoż. (audyty, przeglądy sprzętu, BHP).';
COMMENT ON TABLE public.checklist_template_items IS
  'Iter 8: punkty szablonów listy kontrolnej. Snapshot kopiowany do checklist_run_items przy starcie.';
COMMENT ON TABLE public.checklist_runs IS
  'Iter 8: konkretne uruchomienie audytu/przeglądu na obiekcie.';
COMMENT ON TABLE public.checklist_run_items IS
  'Iter 8: pojedynczy punkt audytu z wynikiem (OK/NIE_OK/N/A) + foto + notatka + auto-task.';
