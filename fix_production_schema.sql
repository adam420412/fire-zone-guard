-- ==============================================================================
-- FIRE ZONE GUARD V2 - CONSOLIDATED SCHEMA FIX (Lovable/Supabase)
-- ==============================================================================
-- Ten skrypt tworzy brakujące tabele, kolumny i polityki bezpieczeństwa,
-- które są wymagane przez wersję V2 aplikacji.

-- 1. Brakujące TYPY ENUM (jeśli nie istnieją)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type') THEN
        CREATE TYPE public.task_type AS ENUM ('usterka', 'przegląd', 'szkolenie', 'ewakuacja', 'konsultacja', 'przebudowa', 'audyt', 'porada');
    END IF;
    -- Dodajemy brakujące wartości do istniejących enumów jeśli potrzeba
    -- (ALTER TYPE ... ADD VALUE IF NOT EXISTS wymaga PostgreSQL 12+)
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. NOWE TABELE (Wszystkie moduły V2)

-- HR & Pracownicy
CREATE TABLE IF NOT EXISTS public.employee_development_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'aktywny',
    start_date DATE DEFAULT CURRENT_DATE,
    position TEXT,
    onboarding_progress INTEGER DEFAULT 0,
    training_status TEXT DEFAULT 'w trakcie',
    health_exam_valid_until DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employee_trainings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    training_name TEXT NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    is_required BOOLEAN DEFAULT true,
    document_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Spotkania
CREATE TABLE IF NOT EXISTS public.meetings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
    organizer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    meeting_date TIMESTAMP WITH TIME ZONE NOT NULL,
    attendees TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Audyty i Protokoły
CREATE TABLE IF NOT EXISTS public.audits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    auditor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'w przygotowaniu',
    performed_at DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_checklists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    item_name TEXT NOT NULL,
    is_compliant BOOLEAN DEFAULT false,
    remarks TEXT,
    photo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.service_protocols (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    inspector_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'wersja robocza',
    performed_at DATE NOT NULL,
    next_inspection_due DATE,
    overall_result TEXT DEFAULT 'pozytywny',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Pomiary
CREATE TABLE IF NOT EXISTS public.hydrant_measurements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    protocol_id UUID NOT NULL REFERENCES public.service_protocols(id) ON DELETE CASCADE,
    hydrant_number TEXT NOT NULL,
    type TEXT NOT NULL,
    dn_diameter INTEGER NOT NULL,
    static_pressure_mpa DECIMAL(5,2),
    dynamic_pressure_mpa DECIMAL(5,2),
    flow_rate_dm3s DECIMAL(6,2),
    is_compliant BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Subzadania i Przypomnienia
CREATE TABLE IF NOT EXISTS public.subtasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Nowe',
    assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    deadline DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.task_reminders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    subtask_id UUID REFERENCES public.subtasks(id) ON DELETE CASCADE,
    remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
    recipient_email TEXT NOT NULL,
    message TEXT,
    sent BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT task_or_subtask CHECK (task_id IS NOT NULL OR subtask_id IS NOT NULL)
);

-- Zarządzanie Urządzeniami (Jeśli brak)
CREATE TABLE IF NOT EXISTS public.device_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_interval_days integer NOT NULL DEFAULT 365,
  description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  device_type_id uuid NOT NULL REFERENCES public.device_types(id),
  name text NOT NULL,
  manufacturer text DEFAULT '',
  model text DEFAULT '',
  serial_number text DEFAULT '',
  location_in_building text DEFAULT '',
  next_service_date date,
  status text NOT NULL DEFAULT 'aktywne',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. AKTUALIZACJA KOLUMN W ISTNIEJĄCYCH TABELACH
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS repair_price NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL;

-- 4. FUNKCJE POMOCNICZE DLA RLS (V4)
CREATE OR REPLACE FUNCTION auth.user_company_id() RETURNS uuid AS $$
  BEGIN
    RETURN (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1);
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.user_role() RETURNS text AS $$
  BEGIN
    RETURN (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1);
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. WŁĄCZENIE RLS
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hydrant_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_development_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- 6. POLITYKI BEZPIECZEŃSTWA (Idempotentne)
DO $$ BEGIN
    -- AUDITS
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'View audits same company') THEN
        CREATE POLICY "View audits same company" ON public.audits FOR SELECT USING (building_id IN (SELECT id FROM buildings WHERE company_id = auth.user_company_id()) OR auth.user_role() = 'super_admin');
    END IF;
    
    -- PROTOCOLS
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'View protocols same company') THEN
        CREATE POLICY "View protocols same company" ON public.service_protocols FOR SELECT USING (building_id IN (SELECT id FROM buildings WHERE company_id = auth.user_company_id()) OR auth.user_role() = 'super_admin');
    END IF;

    -- DEVICES
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'View devices same company') THEN
        CREATE POLICY "View devices same company" ON public.devices FOR SELECT USING (building_id IN (SELECT id FROM buildings WHERE company_id = auth.user_company_id()) OR auth.user_role() = 'super_admin');
    END IF;
    
    -- SUBTASKS
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Access subtasks company') THEN
        CREATE POLICY "Access subtasks company" ON public.subtasks FOR ALL USING (task_id IN (SELECT id FROM tasks WHERE company_id = auth.user_company_id()) OR auth.user_role() = 'super_admin');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 7. SEED PODSTAWOWYCH DANYCH (Device Types)
INSERT INTO public.device_types (name, service_interval_days) 
SELECT 'Gaśnica', 365 WHERE NOT EXISTS (SELECT 1 FROM public.device_types WHERE name = 'Gaśnica');
INSERT INTO public.device_types (name, service_interval_days) 
SELECT 'Hydrant', 365 WHERE NOT EXISTS (SELECT 1 FROM public.device_types WHERE name = 'Hydrant');
INSERT INTO public.device_types (name, service_interval_days) 
SELECT 'System SAP', 365 WHERE NOT EXISTS (SELECT 1 FROM public.device_types WHERE name = 'System SAP');

-- GOTOWE
