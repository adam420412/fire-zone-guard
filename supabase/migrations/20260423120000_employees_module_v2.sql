-- ==============================================================================
-- Fire Zone Guard V2 - Pełny moduł "Zespół i Szkolenia"
-- ==============================================================================
-- Cele migracji:
--   1. Pozwolić zarządzać pracownikami niezależnie od kont w auth.users
--      (kartoteka HR nie wymaga logowania pracownika do systemu).
--   2. Wzbogacić tabelę employee_development_plans o realne dane kadrowe:
--      imię, nazwisko, email, telefon, obiekt, data zatrudnienia, status, notatki.
--   3. Włączyć Row Level Security w taki sposób, by Super Admin / Admin /
--      Koordynator mieli pełny CRUD, a zwykły pracownik widział własną kartę.
--   4. Dodać delete_policy (poprzedni schemat ich nie posiadał).
--   5. Wystawić "employees_with_details" view dla wygodnych zapytań front-endu.
-- ==============================================================================

-- 1. Wzbogacenie tabeli employee_development_plans
DO $$ BEGIN
    -- Imię/nazwisko bezpośrednio na karcie pracownika
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS first_name TEXT;
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS last_name  TEXT;
    -- Kontakt (kadry kontaktują się także z pracownikami bez konta w systemie)
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS phone TEXT;
    -- Powiązania
    ALTER TABLE public.employee_development_plans
        ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL;
    ALTER TABLE public.employee_development_plans
        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
    -- Dane kadrowe / soft delete
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS employment_date DATE;
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN undefined_table THEN
    -- Jeśli tabela jeszcze nie istnieje - utwórz ją od podstaw
    CREATE TABLE public.employee_development_plans (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        phone TEXT,
        position TEXT,
        building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
        company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
        employment_date DATE,
        notes TEXT,
        status TEXT DEFAULT 'aktywny',
        is_active BOOLEAN NOT NULL DEFAULT true,
        start_date DATE DEFAULT CURRENT_DATE,
        onboarding_progress INTEGER DEFAULT 0,
        training_status TEXT DEFAULT 'Brak',
        health_exam_valid_until DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
END $$;

-- 2. user_id powinno być nullable - pracownik może istnieć bez konta auth
DO $$ BEGIN
    ALTER TABLE public.employee_development_plans ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Sprawdzenie sensownego progresu onboardingu
DO $$ BEGIN
    ALTER TABLE public.employee_development_plans
        ADD CONSTRAINT employee_dev_plans_progress_chk
        CHECK (onboarding_progress IS NULL OR (onboarding_progress BETWEEN 0 AND 100));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Indeksy (filtry po obiekcie / firmie / statusie szkolenia są częste)
CREATE INDEX IF NOT EXISTS idx_employee_dev_plans_building ON public.employee_development_plans (building_id);
CREATE INDEX IF NOT EXISTS idx_employee_dev_plans_company  ON public.employee_development_plans (company_id);
CREATE INDEX IF NOT EXISTS idx_employee_dev_plans_status   ON public.employee_development_plans (training_status);
CREATE INDEX IF NOT EXISTS idx_employee_dev_plans_active   ON public.employee_development_plans (is_active);

-- 5. Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_employee_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employee_dev_plans_updated_at ON public.employee_development_plans;
CREATE TRIGGER trg_employee_dev_plans_updated_at
BEFORE UPDATE ON public.employee_development_plans
FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();

-- 6. RLS - bezpieczne polityki bez "wisielców"
ALTER TABLE public.employee_development_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_trainings         ENABLE ROW LEVEL SECURITY;

-- Czyścimy stare polityki (idempotentnie), żeby uniknąć konfliktów nazw
DO $$
DECLARE policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('employee_development_plans','employee_trainings')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
            policy_record.policyname,
            CASE WHEN policy_record.policyname ILIKE '%training%' THEN 'employee_trainings' ELSE 'employee_development_plans' END
        );
    END LOOP;
END $$;

-- Helper: czy bieżący użytkownik jest super_adminem / managerem HR
CREATE OR REPLACE FUNCTION public.is_hr_manager() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r TEXT;
BEGIN
    SELECT role INTO r FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
    IF r IN ('super_admin','admin','coordinator','inspektor') THEN
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$;

-- employee_development_plans: pełny CRUD dla HR, odczyt własnej karty dla pracownika
CREATE POLICY "edp_hr_all" ON public.employee_development_plans
    FOR ALL USING (public.is_hr_manager()) WITH CHECK (public.is_hr_manager());

CREATE POLICY "edp_self_read" ON public.employee_development_plans
    FOR SELECT USING (
        user_id IS NOT NULL AND user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    );

CREATE POLICY "edp_company_read" ON public.employee_development_plans
    FOR SELECT USING (
        company_id IS NOT NULL AND company_id IN (
            SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
        )
    );

-- employee_trainings: HR pełny CRUD, użytkownik widzi swoje szkolenia
CREATE POLICY "trn_hr_all" ON public.employee_trainings
    FOR ALL USING (public.is_hr_manager()) WITH CHECK (public.is_hr_manager());

CREATE POLICY "trn_self_read" ON public.employee_trainings
    FOR SELECT USING (
        user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    );

-- 7. Widok do listy pracowników (łączy buildings + profiles dla wygody UI)
CREATE OR REPLACE VIEW public.employees_with_details AS
SELECT
    e.id,
    e.user_id,
    e.first_name,
    e.last_name,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), p.name, 'Pracownik') AS full_name,
    COALESCE(e.email, p.email)                         AS email,
    e.phone,
    e.position,
    e.building_id,
    b.name                                             AS building_name,
    e.company_id,
    e.employment_date,
    e.start_date,
    e.notes,
    e.status,
    e.is_active,
    e.onboarding_progress,
    e.training_status,
    e.health_exam_valid_until,
    e.created_at,
    e.updated_at
FROM public.employee_development_plans e
LEFT JOIN public.profiles  p ON p.id = e.user_id
LEFT JOIN public.buildings b ON b.id = e.building_id;

-- Widok dziedziczy uprawnienia z tabeli źródłowej, więc RLS jest egzekwowane.
GRANT SELECT ON public.employees_with_details TO authenticated;
GRANT SELECT ON public.employees_with_details TO anon;

-- ==============================================================================
-- KONIEC MIGRACJI 20260423
-- ==============================================================================
