-- 1) Recreate views with security_invoker
DROP VIEW IF EXISTS public.sla_tickets_with_details;
CREATE VIEW public.sla_tickets_with_details
WITH (security_invoker = true) AS
SELECT t.id, t.ticket_number, t.building_id, t.company_id, t.reporter_user_id,
       t.reporter_name, t.reporter_email, t.reporter_phone, t.type, t.priority,
       t.device_type, t.device_id, t.description, t.photo_urls, t.ai_summary,
       t.ai_category, t.ai_draft_email, t.status, t.diagnosis, t.assigned_to,
       t.sla_response_due, t.sla_resolution_due, t.first_response_at, t.on_site_at,
       t.resolved_at, t.closed_at, t.protocol_url, t.related_task_id, t.notes,
       t.created_at, t.updated_at,
       b.name AS building_name, b.address AS building_address,
       c.name AS company_name,
       p.name AS assigned_to_name, p.email AS assigned_to_email,
       CASE WHEN t.first_response_at IS NULL AND t.sla_response_due < now() THEN true ELSE false END AS sla_response_breached,
       CASE WHEN t.resolved_at IS NULL AND t.sla_resolution_due < now() THEN true ELSE false END AS sla_resolution_breached
FROM public.sla_tickets t
LEFT JOIN public.buildings b ON b.id = t.building_id
LEFT JOIN public.companies c ON c.id = t.company_id
LEFT JOIN public.profiles p ON p.id = t.assigned_to;

DROP VIEW IF EXISTS public.employees_with_details;
CREATE VIEW public.employees_with_details
WITH (security_invoker = true) AS
SELECT e.id, e.user_id, e.first_name, e.last_name,
       COALESCE(NULLIF(TRIM(BOTH FROM concat_ws(' ', e.first_name, e.last_name)), ''), p.name, 'Pracownik') AS full_name,
       COALESCE(e.email, p.email) AS email,
       e.phone, e."position", e.building_id, b.name AS building_name,
       e.company_id, e.employment_date, e.start_date, e.notes, e.status,
       e.is_active, e.onboarding_progress, e.training_status,
       e.health_exam_valid_until, e.created_at, e.updated_at
FROM public.employee_development_plans e
LEFT JOIN public.profiles p ON p.id = e.user_id
LEFT JOIN public.buildings b ON b.id = e.building_id;

-- 2) Tighten task_financial_items
DROP POLICY IF EXISTS "Allow all management for signed in users" ON public.task_financial_items;

CREATE POLICY tfi_company_read ON public.task_financial_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = task_financial_items.task_id
    AND (t.company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin())
));

CREATE POLICY tfi_company_insert ON public.task_financial_items
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = task_financial_items.task_id
    AND (public.is_company_admin(t.company_id) OR public.is_super_admin())
));

CREATE POLICY tfi_company_update ON public.task_financial_items
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = task_financial_items.task_id
    AND (public.is_company_admin(t.company_id) OR public.is_super_admin())
));

CREATE POLICY tfi_company_delete ON public.task_financial_items
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = task_financial_items.task_id
    AND (public.is_company_admin(t.company_id) OR public.is_super_admin())
));

-- 3) Tighten public anon SLA insert
DROP POLICY IF EXISTS sla_anon_insert ON public.sla_tickets;
CREATE POLICY sla_anon_insert ON public.sla_tickets
FOR INSERT TO anon
WITH CHECK (
  reporter_user_id IS NULL
  AND description IS NOT NULL
  AND length(description) >= 5
  AND length(description) <= 5000
);

-- 4) Add policy to telegram_bot_state
CREATE POLICY tbs_super_admin_all ON public.telegram_bot_state
FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());