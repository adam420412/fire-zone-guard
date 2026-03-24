
-- =============================================
-- FIRE ZONE - FULL DATABASE SCHEMA
-- =============================================

-- 1. ROLE ENUM
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'employee', 'client');
CREATE TYPE public.task_status AS ENUM ('Nowe', 'Zaplanowane', 'W trakcie', 'Oczekuje', 'Do weryfikacji', 'Zamknięte');
CREATE TYPE public.task_priority AS ENUM ('niski', 'średni', 'wysoki', 'krytyczny');
CREATE TYPE public.task_type AS ENUM ('usterka', 'przegląd', 'szkolenie', 'ewakuacja', 'konsultacja', 'przebudowa', 'audyt', 'porada');
CREATE TYPE public.safety_status AS ENUM ('bezpieczny', 'ostrzeżenie', 'krytyczny');

-- 2. COMPANIES
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 3. PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. USER ROLES (separate table, critical for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. BUILDINGS
CREATE TABLE public.buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  ibp_valid_until DATE,
  evacuation_last_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

-- 6. TASKS
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE NOT NULL,
  type task_type NOT NULL DEFAULT 'usterka',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority task_priority NOT NULL DEFAULT 'średni',
  status task_status NOT NULL DEFAULT 'Nowe',
  assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sla_hours INTEGER NOT NULL DEFAULT 72,
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_response_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closing_comment TEXT
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 7. TASK HISTORY
CREATE TABLE public.task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

-- 8. INSPECTIONS
CREATE TABLE public.inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'przegląd',
  performed_at DATE NOT NULL,
  next_due DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

-- 9. EVACUATION DRILLS
CREATE TABLE public.evacuation_drills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE NOT NULL,
  performed_at DATE NOT NULL,
  participants_count INTEGER NOT NULL DEFAULT 0,
  evacuation_time INTEGER, -- seconds
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.evacuation_drills ENABLE ROW LEVEL SECURITY;

-- 10. CERTIFICATES
CREATE TABLE public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE NOT NULL,
  certificate_number TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- 11. AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- =============================================

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user's company_id from profiles
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin')
$$;

-- Check if user is admin of a company
CREATE OR REPLACE FUNCTION public.is_company_admin(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR (
    public.has_role(auth.uid(), 'admin') AND
    public.get_user_company_id(auth.uid()) = _company_id
  )
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- COMPANIES
CREATE POLICY "super_admin_all" ON public.companies FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_read_own" ON public.companies FOR SELECT USING (
  public.has_role(auth.uid(), 'admin') AND id = public.get_user_company_id(auth.uid())
);
CREATE POLICY "employee_read_own" ON public.companies FOR SELECT USING (
  public.has_role(auth.uid(), 'employee') AND id = public.get_user_company_id(auth.uid())
);
CREATE POLICY "client_read_own" ON public.companies FOR SELECT USING (
  public.has_role(auth.uid(), 'client') AND id = public.get_user_company_id(auth.uid())
);

-- PROFILES
CREATE POLICY "super_admin_all" ON public.profiles FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_read_company" ON public.profiles FOR SELECT USING (
  public.has_role(auth.uid(), 'admin') AND company_id = public.get_user_company_id(auth.uid())
);
CREATE POLICY "self_read" ON public.profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "self_update" ON public.profiles FOR UPDATE USING (user_id = auth.uid());

-- USER ROLES
CREATE POLICY "super_admin_all" ON public.user_roles FOR ALL USING (public.is_super_admin());
CREATE POLICY "self_read" ON public.user_roles FOR SELECT USING (user_id = auth.uid());

-- BUILDINGS
CREATE POLICY "super_admin_all" ON public.buildings FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_company" ON public.buildings FOR ALL USING (public.is_company_admin(company_id));
CREATE POLICY "employee_read" ON public.buildings FOR SELECT USING (
  public.has_role(auth.uid(), 'employee') AND company_id = public.get_user_company_id(auth.uid())
);
CREATE POLICY "client_read" ON public.buildings FOR SELECT USING (
  public.has_role(auth.uid(), 'client') AND company_id = public.get_user_company_id(auth.uid())
);

-- TASKS
CREATE POLICY "super_admin_all" ON public.tasks FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_company" ON public.tasks FOR ALL USING (public.is_company_admin(company_id));
CREATE POLICY "employee_read_assigned" ON public.tasks FOR SELECT USING (
  public.has_role(auth.uid(), 'employee') AND (
    assignee_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) OR
    company_id = public.get_user_company_id(auth.uid())
  )
);
CREATE POLICY "employee_update_assigned" ON public.tasks FOR UPDATE USING (
  public.has_role(auth.uid(), 'employee') AND
  assignee_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
);
CREATE POLICY "client_read" ON public.tasks FOR SELECT USING (
  public.has_role(auth.uid(), 'client') AND company_id = public.get_user_company_id(auth.uid())
);
CREATE POLICY "client_insert" ON public.tasks FOR INSERT WITH CHECK (
  public.has_role(auth.uid(), 'client') AND company_id = public.get_user_company_id(auth.uid())
);

-- TASK HISTORY
CREATE POLICY "super_admin_all" ON public.task_history FOR ALL USING (public.is_super_admin());
CREATE POLICY "company_read" ON public.task_history FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id AND public.is_company_admin(t.company_id)
  )
);
CREATE POLICY "company_insert" ON public.task_history FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id AND (
      public.is_company_admin(t.company_id) OR
      t.assignee_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    )
  )
);

-- INSPECTIONS
CREATE POLICY "super_admin_all" ON public.inspections FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_company" ON public.inspections FOR ALL USING (
  EXISTS (SELECT 1 FROM public.buildings b WHERE b.id = building_id AND public.is_company_admin(b.company_id))
);
CREATE POLICY "read_company" ON public.inspections FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.buildings b WHERE b.id = building_id AND b.company_id = public.get_user_company_id(auth.uid()))
);

-- EVACUATION DRILLS
CREATE POLICY "super_admin_all" ON public.evacuation_drills FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_company" ON public.evacuation_drills FOR ALL USING (
  EXISTS (SELECT 1 FROM public.buildings b WHERE b.id = building_id AND public.is_company_admin(b.company_id))
);
CREATE POLICY "read_company" ON public.evacuation_drills FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.buildings b WHERE b.id = building_id AND b.company_id = public.get_user_company_id(auth.uid()))
);

-- CERTIFICATES
CREATE POLICY "super_admin_all" ON public.certificates FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_company" ON public.certificates FOR ALL USING (
  EXISTS (SELECT 1 FROM public.buildings b WHERE b.id = building_id AND public.is_company_admin(b.company_id))
);
CREATE POLICY "read_company" ON public.certificates FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.buildings b WHERE b.id = building_id AND b.company_id = public.get_user_company_id(auth.uid()))
);

-- AUDIT LOGS
CREATE POLICY "super_admin_all" ON public.audit_logs FOR ALL USING (public.is_super_admin());
CREATE POLICY "admin_read_company" ON public.audit_logs FOR SELECT USING (
  public.has_role(auth.uid(), 'admin') AND company_id = public.get_user_company_id(auth.uid())
);
CREATE POLICY "authenticated_insert" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Auto-record task status changes
CREATE OR REPLACE FUNCTION public.log_task_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log status change
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.task_history (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status_change', OLD.status::TEXT, NEW.status::TEXT);
    
    -- Set first_response_at
    IF OLD.status = 'Nowe' AND NEW.first_response_at IS NULL THEN
      NEW.first_response_at := now();
    END IF;
    
    -- Set closed_at
    IF NEW.status = 'Zamknięte' AND OLD.status != 'Zamknięte' THEN
      NEW.closed_at := now();
    END IF;
  END IF;
  
  -- Log assignee change
  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    INSERT INTO public.task_history (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'assignee_change', OLD.assignee_id::TEXT, NEW.assignee_id::TEXT);
  END IF;
  
  -- Log priority change
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.task_history (task_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'priority_change', OLD.priority::TEXT, NEW.priority::TEXT);
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_task_updated
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_task_changes();

-- Safety status calculation function
CREATE OR REPLACE FUNCTION public.calculate_building_safety_status(_building_id UUID)
RETURNS safety_status
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status safety_status;
  _has_critical_tasks BOOLEAN;
  _has_overdue_inspection BOOLEAN;
  _has_recent_evacuation BOOLEAN;
  _ibp_valid BOOLEAN;
  _has_high_tasks BOOLEAN;
  _inspection_due_soon BOOLEAN;
BEGIN
  -- Check critical tasks
  SELECT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE building_id = _building_id AND priority = 'krytyczny' AND status != 'Zamknięte'
  ) INTO _has_critical_tasks;
  
  -- Check overdue inspections
  SELECT EXISTS (
    SELECT 1 FROM public.inspections
    WHERE building_id = _building_id AND next_due < CURRENT_DATE
  ) INTO _has_overdue_inspection;
  
  -- Check evacuation within 12 months
  SELECT EXISTS (
    SELECT 1 FROM public.evacuation_drills
    WHERE building_id = _building_id AND performed_at > CURRENT_DATE - INTERVAL '12 months'
  ) INTO _has_recent_evacuation;
  
  -- Check IBP validity
  SELECT COALESCE(ibp_valid_until >= CURRENT_DATE, FALSE) INTO _ibp_valid
  FROM public.buildings WHERE id = _building_id;
  
  -- CRITICAL (red)
  IF _has_critical_tasks OR _has_overdue_inspection OR NOT _has_recent_evacuation OR NOT _ibp_valid THEN
    RETURN 'krytyczny';
  END IF;
  
  -- Check high priority tasks
  SELECT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE building_id = _building_id AND priority = 'wysoki' AND status != 'Zamknięte'
  ) INTO _has_high_tasks;
  
  -- Check inspection due within 30 days
  SELECT EXISTS (
    SELECT 1 FROM public.inspections
    WHERE building_id = _building_id AND next_due BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
  ) INTO _inspection_due_soon;
  
  -- WARNING (yellow)
  IF _has_high_tasks OR _inspection_due_soon THEN
    RETURN 'ostrzeżenie';
  END IF;
  
  -- SAFE (green)
  RETURN 'bezpieczny';
END;
$$;

-- SLA calculation function
CREATE OR REPLACE FUNCTION public.calculate_task_sla(_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task RECORD;
  _reaction_hours NUMERIC;
  _resolution_hours NUMERIC;
  _is_breached BOOLEAN;
  _is_overdue BOOLEAN;
BEGIN
  SELECT * INTO _task FROM public.tasks WHERE id = _task_id;
  
  IF _task IS NULL THEN
    RETURN '{}'::JSONB;
  END IF;
  
  -- Reaction time
  IF _task.first_response_at IS NOT NULL THEN
    _reaction_hours := EXTRACT(EPOCH FROM (_task.first_response_at - _task.created_at)) / 3600;
  END IF;
  
  -- Resolution time
  IF _task.closed_at IS NOT NULL THEN
    _resolution_hours := EXTRACT(EPOCH FROM (_task.closed_at - _task.created_at)) / 3600;
    _is_breached := _resolution_hours > _task.sla_hours;
  ELSE
    _resolution_hours := EXTRACT(EPOCH FROM (now() - _task.created_at)) / 3600;
    _is_breached := _resolution_hours > _task.sla_hours;
  END IF;
  
  -- Overdue
  _is_overdue := _task.deadline IS NOT NULL AND _task.deadline < now() AND _task.status != 'Zamknięte';
  
  RETURN jsonb_build_object(
    'reaction_hours', ROUND(_reaction_hours::NUMERIC, 1),
    'resolution_hours', ROUND(_resolution_hours::NUMERIC, 1),
    'sla_hours', _task.sla_hours,
    'is_breached', _is_breached,
    'is_overdue', _is_overdue
  );
END;
$$;
