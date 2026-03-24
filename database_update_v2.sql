-- Migration V2: SharePoint Process Integration
-- Adds support for Audits, Service Protocols, Meetings, and HR (Employee Portal)

-- ==============================================================================
-- 1. HR & Employee Portal (Zarządzanie zespołem)
-- ==============================================================================

-- Employees / Development Plans
CREATE TABLE IF NOT EXISTS public.employee_development_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'aktywny', -- 'aktywny', 'zakończony', 'zawieszony'
    start_date DATE NOT NULL,
    current_position TEXT,
    target_position TEXT,
    goals TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Employee Trainings / Onboarding (Instrukcje dla pracownika)
CREATE TABLE IF NOT EXISTS public.employee_trainings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    training_name TEXT NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    is_required BOOLEAN DEFAULT true,
    document_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ==============================================================================
-- 2. Meetings & Consultations (Spotkania)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.meetings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
    organizer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    meeting_date TIMESTAMP WITH TIME ZONE NOT NULL,
    attendees TEXT, -- Comma separated or JSON representation of external/internal attendees
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Link existing tasks to meetings (Optional)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL;


-- ==============================================================================
-- 3. Fire Safety Audits & Inspections (Audyty PPOŻ / IBP)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    auditor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL, -- 'AUDYT PPOŻ', 'IBP', 'EKSPERTYZA'
    status TEXT DEFAULT 'w przygotowaniu', -- 'w przygotowaniu', 'zakończony'
    performed_at DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Specific audit sections (Checklists)
CREATE TABLE IF NOT EXISTS public.audit_checklists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- np: 'Drogi ewakuacyjne', 'Instalacje'
    item_name TEXT NOT NULL,
    is_compliant BOOLEAN DEFAULT false,
    remarks TEXT,
    photo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);


-- ==============================================================================
-- 4. Service Protocols (Protokoły Serwisowe)
-- ==============================================================================
-- General wrapper for any service protocol
CREATE TABLE IF NOT EXISTS public.service_protocols (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    inspector_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL, -- 'HYDRANTY WEWNĘTRZNE', 'HYDRANTY ZEWNĘTRZNE', 'ZBIORNIKI'
    status TEXT DEFAULT 'wersja robocza', -- 'wersja robocza', 'zatwierdzony'
    performed_at DATE NOT NULL,
    next_inspection_due DATE,
    overall_result TEXT DEFAULT 'pozytywny', -- 'pozytywny', 'negatywny', 'warunkowy'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Specialized measurements for hydrants
CREATE TABLE IF NOT EXISTS public.hydrant_measurements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    protocol_id UUID NOT NULL REFERENCES public.service_protocols(id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    hydrant_number TEXT NOT NULL, -- np. HZ-1, HW-1
    type TEXT NOT NULL, -- 'nadziemny', 'podziemny', 'wewnętrzny'
    dn_diameter INTEGER NOT NULL, -- e.g. 52, 80, 100
    static_pressure_mpa DECIMAL(5,2),
    dynamic_pressure_mpa DECIMAL(5,2),
    flow_rate_dm3s DECIMAL(6,2),
    is_compliant BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Specialized measurements for fire tanks
CREATE TABLE IF NOT EXISTS public.tank_measurements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    protocol_id UUID NOT NULL REFERENCES public.service_protocols(id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    volume_m3 DECIMAL(8,2) NOT NULL,
    is_leak_proof BOOLEAN DEFAULT true,
    corrosion_signs BOOLEAN DEFAULT false,
    valves_operational BOOLEAN DEFAULT true,
    is_compliant BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);


-- ==============================================================================
-- 5. RLS Policies (Security)
-- ==============================================================================
ALTER TABLE public.employee_development_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hydrant_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_measurements ENABLE ROW LEVEL SECURITY;

-- Policies for employee_development_plans
CREATE POLICY "Users can see their own dev plans" ON public.employee_development_plans 
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Super admins and managers can see all dev plans" ON public.employee_development_plans 
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'inspektor'))
);

-- Policies for employee_trainings
CREATE POLICY "Users can see their own trainings" ON public.employee_trainings 
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Super admins and managers manage trainings" ON public.employee_trainings 
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'inspektor'))
);

-- Policies for meetings
CREATE POLICY "Authenticated users can view meetings" ON public.meetings 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Super admins full access to meetings" ON public.meetings 
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- Policies for audits and checklists
CREATE POLICY "Authenticated users can view audits" ON public.audits 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Super admins and inspectors manage audits" ON public.audits 
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'inspektor'))
);

CREATE POLICY "Authenticated users can view audit checklists" ON public.audit_checklists 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Super admins and inspectors manage audit checklists" ON public.audit_checklists 
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'inspektor'))
);

-- Policies for service protocols and measurements
CREATE POLICY "Authenticated users can view protocols" ON public.service_protocols 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Super admins and inspectors manage protocols" ON public.service_protocols 
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'inspektor'))
);

CREATE POLICY "Authenticated users can view hydrant measurements" ON public.hydrant_measurements 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Super admins and inspectors manage hydrant measurements" ON public.hydrant_measurements 
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'inspektor'))
);

CREATE POLICY "Authenticated users can view tank measurements" ON public.tank_measurements 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Super admins and inspectors manage tank measurements" ON public.tank_measurements 
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'inspektor'))
);
