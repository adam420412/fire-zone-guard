
-- Subtasks
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
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.subtasks FOR ALL USING (is_super_admin());
CREATE POLICY "company_read" ON public.subtasks FOR SELECT USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = subtasks.task_id AND t.company_id = get_user_company_id(auth.uid()))
);
CREATE POLICY "company_insert" ON public.subtasks FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = subtasks.task_id AND is_company_admin(t.company_id))
);
CREATE POLICY "company_update" ON public.subtasks FOR UPDATE USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = subtasks.task_id AND is_company_admin(t.company_id))
);
CREATE POLICY "company_delete" ON public.subtasks FOR DELETE USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = subtasks.task_id AND is_company_admin(t.company_id))
);

-- Task Reminders
CREATE TABLE IF NOT EXISTS public.task_reminders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    subtask_id UUID REFERENCES public.subtasks(id) ON DELETE CASCADE,
    remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
    recipient_email TEXT NOT NULL,
    message TEXT,
    sent BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.task_reminders FOR ALL USING (is_super_admin());
CREATE POLICY "company_read" ON public.task_reminders FOR SELECT USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_reminders.task_id AND t.company_id = get_user_company_id(auth.uid()))
);
CREATE POLICY "company_insert" ON public.task_reminders FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_reminders.task_id AND is_company_admin(t.company_id))
);
CREATE POLICY "company_delete" ON public.task_reminders FOR DELETE USING (
  EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_reminders.task_id AND is_company_admin(t.company_id))
);

-- Meetings
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
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.meetings FOR ALL USING (is_super_admin());
CREATE POLICY "company_read" ON public.meetings FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

-- Audits
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
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.audits FOR ALL USING (is_super_admin());
CREATE POLICY "company_read" ON public.audits FOR SELECT USING (
  EXISTS (SELECT 1 FROM buildings b WHERE b.id = audits.building_id AND b.company_id = get_user_company_id(auth.uid()))
);
CREATE POLICY "company_manage" ON public.audits FOR ALL USING (
  EXISTS (SELECT 1 FROM buildings b WHERE b.id = audits.building_id AND is_company_admin(b.company_id))
);

-- Audit Checklists
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
ALTER TABLE public.audit_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.audit_checklists FOR ALL USING (is_super_admin());
CREATE POLICY "company_read" ON public.audit_checklists FOR SELECT USING (
  EXISTS (SELECT 1 FROM audits a JOIN buildings b ON b.id = a.building_id WHERE a.id = audit_checklists.audit_id AND b.company_id = get_user_company_id(auth.uid()))
);
CREATE POLICY "company_manage" ON public.audit_checklists FOR ALL USING (
  EXISTS (SELECT 1 FROM audits a JOIN buildings b ON b.id = a.building_id WHERE a.id = audit_checklists.audit_id AND is_company_admin(b.company_id))
);

-- Service Protocols
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
ALTER TABLE public.service_protocols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.service_protocols FOR ALL USING (is_super_admin());
CREATE POLICY "company_read" ON public.service_protocols FOR SELECT USING (
  EXISTS (SELECT 1 FROM buildings b WHERE b.id = service_protocols.building_id AND b.company_id = get_user_company_id(auth.uid()))
);
CREATE POLICY "company_manage" ON public.service_protocols FOR ALL USING (
  EXISTS (SELECT 1 FROM buildings b WHERE b.id = service_protocols.building_id AND is_company_admin(b.company_id))
);

-- Hydrant Measurements
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
ALTER TABLE public.hydrant_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.hydrant_measurements FOR ALL USING (is_super_admin());
CREATE POLICY "company_read" ON public.hydrant_measurements FOR SELECT USING (
  EXISTS (SELECT 1 FROM service_protocols sp JOIN buildings b ON b.id = sp.building_id WHERE sp.id = hydrant_measurements.protocol_id AND b.company_id = get_user_company_id(auth.uid()))
);

-- Employee Development Plans
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
ALTER TABLE public.employee_development_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.employee_development_plans FOR ALL USING (is_super_admin());
CREATE POLICY "self_read" ON public.employee_development_plans FOR SELECT USING (user_id = auth.uid());

-- Employee Trainings
CREATE TABLE IF NOT EXISTS public.employee_trainings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    training_name TEXT NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    is_required BOOLEAN DEFAULT true,
    document_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.employee_trainings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all" ON public.employee_trainings FOR ALL USING (is_super_admin());
CREATE POLICY "self_read" ON public.employee_trainings FOR SELECT USING (user_id = auth.uid());

-- Add missing columns to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS repair_price NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL;
