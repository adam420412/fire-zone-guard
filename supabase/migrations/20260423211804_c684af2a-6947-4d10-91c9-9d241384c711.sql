-- 1. Wzbogacenie tabeli employee_development_plans
DO $$ BEGIN
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS first_name TEXT;
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS last_name  TEXT;
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE public.employee_development_plans
        ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL;
    ALTER TABLE public.employee_development_plans
        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS employment_date DATE;
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE public.employee_development_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN undefined_table THEN
    CREATE TABLE public.employee_development_plans (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        first_name TEXT, last_name TEXT, email TEXT, phone TEXT, position TEXT,
        building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
        company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
        employment_date DATE, notes TEXT,
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

-- 2. user_id powinno być nullable
DO $$ BEGIN
    ALTER TABLE public.employee_development_plans ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. CHECK na progres
DO $$ BEGIN
    ALTER TABLE public.employee_development_plans
        ADD CONSTRAINT employee_dev_plans_progress_chk
        CHECK (onboarding_progress IS NULL OR (onboarding_progress BETWEEN 0 AND 100));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Indeksy
CREATE INDEX IF NOT EXISTS idx_employee_dev_plans_building ON public.employee_development_plans (building_id);
CREATE INDEX IF NOT EXISTS idx_employee_dev_plans_company  ON public.employee_development_plans (company_id);
CREATE INDEX IF NOT EXISTS idx_employee_dev_plans_status   ON public.employee_development_plans (training_status);
CREATE INDEX IF NOT EXISTS idx_employee_dev_plans_active   ON public.employee_development_plans (is_active);

-- 5. Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_employee_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_employee_dev_plans_updated_at ON public.employee_development_plans;
CREATE TRIGGER trg_employee_dev_plans_updated_at
BEFORE UPDATE ON public.employee_development_plans
FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();

-- 6. RLS
ALTER TABLE public.employee_development_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_trainings         ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname, tablename FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('employee_development_plans','employee_trainings')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, policy_record.tablename);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.is_hr_manager() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r TEXT;
BEGIN
    SELECT role::text INTO r FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
    IF r IN ('super_admin','admin','coordinator','inspektor') THEN RETURN TRUE; END IF;
    RETURN FALSE;
END;
$$;

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

CREATE POLICY "trn_hr_all" ON public.employee_trainings
    FOR ALL USING (public.is_hr_manager()) WITH CHECK (public.is_hr_manager());

CREATE POLICY "trn_self_read" ON public.employee_trainings
    FOR SELECT USING (
        user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    );

-- 7. Widok
CREATE OR REPLACE VIEW public.employees_with_details
WITH (security_invoker=on) AS
SELECT
    e.id, e.user_id, e.first_name, e.last_name,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), p.name, 'Pracownik') AS full_name,
    COALESCE(e.email, p.email) AS email,
    e.phone, e.position, e.building_id,
    b.name AS building_name,
    e.company_id, e.employment_date, e.start_date, e.notes, e.status, e.is_active,
    e.onboarding_progress, e.training_status, e.health_exam_valid_until,
    e.created_at, e.updated_at
FROM public.employee_development_plans e
LEFT JOIN public.profiles  p ON p.id = e.user_id
LEFT JOIN public.buildings b ON b.id = e.building_id;

GRANT SELECT ON public.employees_with_details TO authenticated;
GRANT SELECT ON public.employees_with_details TO anon;