-- MIGRACJA V4: Bezpieczeństwo Row Level Security (RLS)

-- UWAGA: Ten skrypt zabezpiecza bazę danych, upewniając się, że:
-- 1. Użytkownicy widzą tylko to, co należy do ich `company_id`.
-- 2. Klienci logują się bez dostępu do cudzych danych.

-- Włącz RLS na wszystkich ważnych tabelach
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- FUNKCJA POMOCNICZA: Sprawdzanie czy użytkownik należy do company_id (superadmina też puszczamy)
-- Używamy SECURITY DEFINER, ale obchodzimy polityki, czytając bezpośrednio, aby uniknąć pętli
CREATE OR REPLACE FUNCTION auth.user_company_id() RETURNS uuid AS $$
  DECLARE
    cid uuid;
  BEGIN
    SELECT company_id INTO cid FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN cid;
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION auth.user_role() RETURNS text AS $$
  DECLARE
    r text;
  BEGIN
    SELECT role INTO r FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN r;
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- =========================================================================
-- PROFILES (Każdy widzi innych użytkowników z tej samej firmy, a superadmin wszystkich)
-- =========================================================================
CREATE POLICY "Users can see profiles of same company" ON public.profiles FOR SELECT
USING (
  company_id = auth.user_company_id() OR auth.user_role() = 'super_admin' OR auth.uid() = id
);
CREATE POLICY "Superadmin and Admins can update profiles" ON public.profiles FOR UPDATE
USING (
  auth.user_role() IN ('super_admin', 'admin') AND (company_id = auth.user_company_id() OR auth.user_role() = 'super_admin')
);

-- =========================================================================
-- BUILDINGS
-- =========================================================================
CREATE POLICY "View buildings from same company" ON public.buildings FOR SELECT
USING (
  company_id = auth.user_company_id() OR auth.user_role() = 'super_admin'
);
CREATE POLICY "Manage buildings" ON public.buildings FOR ALL
USING (
  auth.user_role() IN ('super_admin', 'admin', 'coordinator') AND (company_id = auth.user_company_id() OR auth.user_role() = 'super_admin')
);

-- =========================================================================
-- TASKS (Tickety Usterki)
-- =========================================================================
CREATE POLICY "View tasks from same company" ON public.tasks FOR SELECT
USING (
  company_id = auth.user_company_id() OR auth.user_role() = 'super_admin'
);
CREATE POLICY "Insert tasks (clients and employees)" ON public.tasks FOR INSERT
WITH CHECK (
  company_id = auth.user_company_id() OR auth.user_role() = 'super_admin'
);
CREATE POLICY "Update tasks (employees)" ON public.tasks FOR UPDATE
USING (
  auth.user_role() IN ('super_admin', 'admin', 'coordinator', 'technician') AND (company_id = auth.user_company_id() OR auth.user_role() = 'super_admin')
);
CREATE POLICY "Delete tasks (admins)" ON public.tasks FOR DELETE
USING (
  auth.user_role() IN ('super_admin', 'admin') AND (company_id = auth.user_company_id() OR auth.user_role() = 'super_admin')
);

-- =========================================================================
-- PROTOCOLS AND AUDITS
-- =========================================================================
CREATE POLICY "View docs from same company" ON public.protocols FOR SELECT
USING (company_id = auth.user_company_id() OR auth.user_role() = 'super_admin');
CREATE POLICY "Manage docs" ON public.protocols FOR ALL
USING (auth.user_role() IN ('super_admin', 'admin', 'coordinator', 'technician') AND (company_id = auth.user_company_id() OR auth.user_role() = 'super_admin'));

CREATE POLICY "View audits from same company" ON public.audits FOR SELECT
USING (company_id = auth.user_company_id() OR auth.user_role() = 'super_admin');
CREATE POLICY "Manage audits" ON public.audits FOR ALL
USING (auth.user_role() IN ('super_admin', 'admin', 'coordinator', 'technician') AND (company_id = auth.user_company_id() OR auth.user_role() = 'super_admin'));

-- =========================================================================
-- HR & MEETINGS
-- =========================================================================
CREATE POLICY "HR access" ON public.employee_trainings FOR ALL
USING (auth.user_role() IN ('super_admin', 'admin', 'coordinator') AND (auth.user_role() = 'super_admin')); -- HR mainly super_admin/admin

CREATE POLICY "Meetings access" ON public.meetings FOR ALL
USING (company_id = auth.user_company_id() OR auth.user_role() = 'super_admin');

-- Gotowe! Powyższe reguły to "złota zasada" izolacji tenantów (firm) w bazie danych Supabase.
