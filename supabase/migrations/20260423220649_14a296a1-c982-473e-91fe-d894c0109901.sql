-- ============= MASTER PHASE 1-5 =============

CREATE TABLE IF NOT EXISTS public.sla_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT UNIQUE,
    building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    reporter_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reporter_name TEXT,
    reporter_email TEXT,
    reporter_phone TEXT,
    type TEXT NOT NULL DEFAULT 'usterka' CHECK (type IN ('usterka','porada','kontrola')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
    device_type TEXT,
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    photo_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
    ai_summary TEXT,
    ai_category JSONB,
    ai_draft_email TEXT,
    status TEXT NOT NULL DEFAULT 'zgloszenie'
        CHECK (status IN ('zgloszenie','telefon','wyjazd','na_miejscu','diagnoza','naprawiono','niezasadne','zamkniete')),
    diagnosis TEXT,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sla_response_due TIMESTAMPTZ,
    sla_resolution_due TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ,
    on_site_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    protocol_url TEXT,
    related_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_tickets_status      ON public.sla_tickets (status);
CREATE INDEX IF NOT EXISTS idx_sla_tickets_priority    ON public.sla_tickets (priority);
CREATE INDEX IF NOT EXISTS idx_sla_tickets_building    ON public.sla_tickets (building_id);
CREATE INDEX IF NOT EXISTS idx_sla_tickets_company     ON public.sla_tickets (company_id);
CREATE INDEX IF NOT EXISTS idx_sla_tickets_assigned    ON public.sla_tickets (assigned_to);
CREATE INDEX IF NOT EXISTS idx_sla_tickets_reporter    ON public.sla_tickets (reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_sla_tickets_created_at  ON public.sla_tickets (created_at DESC);

CREATE TABLE IF NOT EXISTS public.sla_ticket_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.sla_tickets(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_label TEXT,
    event_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_events_ticket  ON public.sla_ticket_events (ticket_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.generate_sla_ticket_number()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    year_month TEXT;
    next_seq INT;
BEGIN
    IF NEW.ticket_number IS NOT NULL AND NEW.ticket_number <> '' THEN
        RETURN NEW;
    END IF;
    year_month := TO_CHAR(NOW(), 'YYYY-MM');
    SELECT COALESCE(MAX((REGEXP_MATCH(ticket_number, '^SLA-\d{4}-\d{2}-(\d+)$'))[1]::INT), 0) + 1
        INTO next_seq
        FROM public.sla_tickets
        WHERE ticket_number LIKE 'SLA-' || year_month || '-%';
    NEW.ticket_number := 'SLA-' || year_month || '-' || LPAD(next_seq::TEXT, 4, '0');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sla_ticket_number ON public.sla_tickets;
CREATE TRIGGER trg_sla_ticket_number
BEFORE INSERT ON public.sla_tickets
FOR EACH ROW EXECUTE FUNCTION public.generate_sla_ticket_number();

CREATE OR REPLACE FUNCTION public.set_sla_deadlines()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.sla_response_due IS NULL THEN
        NEW.sla_response_due := NEW.created_at + INTERVAL '4 hours';
    END IF;
    IF NEW.sla_resolution_due IS NULL THEN
        NEW.sla_resolution_due := NEW.created_at +
            CASE NEW.priority
                WHEN 'critical' THEN INTERVAL '24 hours'
                WHEN 'high'     THEN INTERVAL '48 hours'
                ELSE                  INTERVAL '72 hours'
            END;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sla_deadlines ON public.sla_tickets;
CREATE TRIGGER trg_sla_deadlines
BEFORE INSERT ON public.sla_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_sla_deadlines();

DROP TRIGGER IF EXISTS trg_sla_tickets_updated_at ON public.sla_tickets;
CREATE TRIGGER trg_sla_tickets_updated_at
BEFORE UPDATE ON public.sla_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();

CREATE OR REPLACE FUNCTION public.log_sla_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.sla_ticket_events (ticket_id, actor_id, event_type, payload)
        VALUES (NEW.id, NEW.assigned_to, 'created',
                jsonb_build_object('status', NEW.status, 'priority', NEW.priority, 'type', NEW.type));
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.sla_ticket_events (ticket_id, actor_id, event_type, payload)
        VALUES (NEW.id, NEW.assigned_to, 'status_change',
                jsonb_build_object('from', OLD.status, 'to', NEW.status));
        IF NEW.status IN ('telefon','wyjazd','na_miejscu','diagnoza','naprawiono','zamkniete','niezasadne')
           AND NEW.first_response_at IS NULL THEN
            NEW.first_response_at := NOW();
        END IF;
        IF NEW.status = 'na_miejscu' AND NEW.on_site_at IS NULL THEN
            NEW.on_site_at := NOW();
        END IF;
        IF NEW.status IN ('naprawiono','niezasadne') AND NEW.resolved_at IS NULL THEN
            NEW.resolved_at := NOW();
        END IF;
        IF NEW.status = 'zamkniete' AND NEW.closed_at IS NULL THEN
            NEW.closed_at := NOW();
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sla_log_status ON public.sla_tickets;
CREATE TRIGGER trg_sla_log_status
BEFORE INSERT OR UPDATE ON public.sla_tickets
FOR EACH ROW EXECUTE FUNCTION public.log_sla_status_change();

ALTER TABLE public.sla_tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_ticket_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname, tablename FROM pg_policies
             WHERE schemaname='public' AND tablename IN ('sla_tickets','sla_ticket_events') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

CREATE POLICY "sla_hr_all" ON public.sla_tickets
    FOR ALL USING (public.is_hr_manager()) WITH CHECK (public.is_hr_manager());

CREATE POLICY "sla_self_read" ON public.sla_tickets
    FOR SELECT USING (
        reporter_user_id = auth.uid()
        OR (company_id IS NOT NULL AND company_id IN (
            SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
        ))
    );

CREATE POLICY "sla_self_insert" ON public.sla_tickets
    FOR INSERT WITH CHECK (
        reporter_user_id = auth.uid()
        OR auth.uid() IS NULL
    );

CREATE POLICY "sla_anon_insert" ON public.sla_tickets
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "sla_events_hr_all" ON public.sla_ticket_events
    FOR ALL USING (public.is_hr_manager()) WITH CHECK (public.is_hr_manager());

CREATE POLICY "sla_events_self_read" ON public.sla_ticket_events
    FOR SELECT USING (
        ticket_id IN (
            SELECT id FROM public.sla_tickets
            WHERE reporter_user_id = auth.uid()
               OR (company_id IS NOT NULL AND company_id IN (
                   SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
               ))
        )
    );

CREATE OR REPLACE VIEW public.sla_tickets_with_details AS
SELECT
    t.*,
    b.name              AS building_name,
    b.address           AS building_address,
    c.name              AS company_name,
    p.name              AS assigned_to_name,
    p.email             AS assigned_to_email,
    CASE
        WHEN t.first_response_at IS NULL AND t.sla_response_due < NOW()   THEN TRUE
        ELSE FALSE
    END                 AS sla_response_breached,
    CASE
        WHEN t.resolved_at IS NULL AND t.sla_resolution_due < NOW()       THEN TRUE
        ELSE FALSE
    END                 AS sla_resolution_breached
FROM public.sla_tickets t
LEFT JOIN public.buildings b ON b.id = t.building_id
LEFT JOIN public.companies c ON c.id = t.company_id
LEFT JOIN public.profiles  p ON p.id = t.assigned_to;

GRANT SELECT ON public.sla_tickets_with_details TO authenticated;
GRANT SELECT ON public.sla_tickets_with_details TO anon;

-- ============================== FAZA 2 ==================================

CREATE TABLE IF NOT EXISTS public.device_requirement_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_class TEXT,
    area_min NUMERIC,
    area_max NUMERIC,
    required_device_type TEXT NOT NULL,
    quantity_formula TEXT,
    legal_basis TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.device_requirement_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drr_hr_all"      ON public.device_requirement_rules;
DROP POLICY IF EXISTS "drr_auth_read"   ON public.device_requirement_rules;
CREATE POLICY "drr_hr_all"    ON public.device_requirement_rules
    FOR ALL USING (public.is_hr_manager()) WITH CHECK (public.is_hr_manager());
CREATE POLICY "drr_auth_read" ON public.device_requirement_rules
    FOR SELECT USING (auth.uid() IS NOT NULL);

INSERT INTO public.device_requirement_rules (building_class, area_min, area_max, required_device_type, quantity_formula, legal_basis)
VALUES
  ('ZL I',   0,    NULL, 'G_GP6',    '1 gaśnica / 100 m²',          '§ 32 rozp. MSWiA o ochronie ppoż.'),
  ('ZL III', 0,    NULL, 'G_GP6',    '1 gaśnica / 100 m²',          '§ 32 rozp. MSWiA o ochronie ppoż.'),
  ('ZL III', 200,  NULL, 'H_DN25',   '1 hydrant / 200 m² PF',       '§ 19 rozp. MSWiA o ochronie ppoż.'),
  ('PM',     0,    NULL, 'G_GP6',    '1 gaśnica / 100 m² lub 200m³','§ 32 rozp. MSWiA'),
  ('PM',     1000, NULL, 'H_DN52',   '1 hydrant / 1000 m²',         '§ 19 rozp. MSWiA'),
  ('ZL I',   1000, NULL, 'SSP',      'cały budynek',                'rozporządzenie SSP'),
  ('ZL III', 0,    NULL, 'OS_AWAR',  'na drogach ewak.',            'oświetlenie awaryjne — PN-EN 1838')
ON CONFLICT DO NOTHING;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS workflow_stage TEXT
    CHECK (workflow_stage IN ('new','offer','accepted','ordered','delivered','in_progress','completed','invoiced'));

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source TEXT
    CHECK (source IN ('audit','service','sla','manual'));

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source_id UUID;

CREATE INDEX IF NOT EXISTS idx_tasks_workflow_stage ON public.tasks (workflow_stage)
    WHERE workflow_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_source         ON public.tasks (source, source_id)
    WHERE source IS NOT NULL;

-- ============================== FAZA 3 ==================================

CREATE TABLE IF NOT EXISTS public.recurring_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('training','audit','service','document_update','insurance','contract_renewal','custom')),
    title TEXT NOT NULL,
    description TEXT,
    related_table TEXT,
    related_id UUID,
    due_date DATE NOT NULL,
    recurrence_rule TEXT,
    reminder_days_before INT[] NOT NULL DEFAULT ARRAY[30,7,1],
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled','snoozed')),
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    interval_months INT,
    last_done_date DATE,
    next_due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.recurring_events ADD COLUMN IF NOT EXISTS interval_months INT;
ALTER TABLE public.recurring_events ADD COLUMN IF NOT EXISTS last_done_date DATE;
ALTER TABLE public.recurring_events ADD COLUMN IF NOT EXISTS next_due_date DATE;

CREATE INDEX IF NOT EXISTS idx_recurring_events_due  ON public.recurring_events (due_date);
CREATE INDEX IF NOT EXISTS idx_recurring_events_type ON public.recurring_events (type);
CREATE INDEX IF NOT EXISTS idx_recurring_events_status ON public.recurring_events (status);

ALTER TABLE public.recurring_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "re_hr_all" ON public.recurring_events;
CREATE POLICY "re_hr_all" ON public.recurring_events
    FOR ALL USING (public.is_hr_manager()) WITH CHECK (public.is_hr_manager());

DROP TRIGGER IF EXISTS trg_re_updated_at ON public.recurring_events;
CREATE TRIGGER trg_re_updated_at
BEFORE UPDATE ON public.recurring_events
FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();

CREATE TABLE IF NOT EXISTS public.notifications_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('email','telegram','in_app')),
    subject TEXT,
    body TEXT,
    payload JSONB DEFAULT '{}'::JSONB,
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
    error TEXT,
    related_table TEXT,
    related_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_status_sched ON public.notifications_outbox (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notif_user         ON public.notifications_outbox (user_id);

ALTER TABLE public.notifications_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_hr_all"   ON public.notifications_outbox;
DROP POLICY IF EXISTS "no_self_read" ON public.notifications_outbox;
CREATE POLICY "no_hr_all"   ON public.notifications_outbox
    FOR ALL USING (public.is_hr_manager()) WITH CHECK (public.is_hr_manager());
CREATE POLICY "no_self_read" ON public.notifications_outbox
    FOR SELECT USING (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- ============================== FAZA 4 — Storage =======================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('sla-photos', 'sla-photos', true, 10485760)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
    DROP POLICY IF EXISTS "sla_photos_anon_upload" ON storage.objects;
    DROP POLICY IF EXISTS "sla_photos_auth_upload" ON storage.objects;
    DROP POLICY IF EXISTS "sla_photos_public_read" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "sla_photos_anon_upload" ON storage.objects
    FOR INSERT TO anon WITH CHECK (bucket_id = 'sla-photos');

CREATE POLICY "sla_photos_auth_upload" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sla-photos');

CREATE POLICY "sla_photos_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'sla-photos');

-- ============= ITERATION 2 — Automations =============

CREATE OR REPLACE FUNCTION public.escalate_sla_to_repair_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_task_id UUID;
  v_priority public.task_priority;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'naprawiono'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.related_task_id IS NULL
     AND NEW.building_id IS NOT NULL
  THEN
    v_company_id := COALESCE(
      NEW.company_id,
      (SELECT company_id FROM public.buildings WHERE id = NEW.building_id LIMIT 1)
    );

    IF v_company_id IS NULL THEN
      RETURN NEW;
    END IF;

    v_priority := CASE NEW.priority
      WHEN 'critical' THEN 'krytyczny'::public.task_priority
      WHEN 'high'     THEN 'wysoki'::public.task_priority
      WHEN 'low'      THEN 'niski'::public.task_priority
      ELSE                  'średni'::public.task_priority
    END;

    INSERT INTO public.tasks (
      company_id, building_id, type, title, description,
      priority, status, sla_hours, workflow_stage, source, source_id
    ) VALUES (
      v_company_id,
      NEW.building_id,
      'usterka',
      COALESCE('Naprawa: ' || LEFT(NEW.description, 80), 'Naprawa po zgłoszeniu SLA'),
      COALESCE(NEW.diagnosis, NEW.description),
      v_priority,
      'Nowe',
      72,
      'new',
      'sla',
      NEW.id
    )
    RETURNING id INTO v_task_id;

    UPDATE public.sla_tickets SET related_task_id = v_task_id WHERE id = NEW.id;
    NEW.related_task_id := v_task_id;

    INSERT INTO public.sla_ticket_events (ticket_id, event_type, payload)
    VALUES (
      NEW.id,
      'task_created',
      jsonb_build_object('task_id', v_task_id, 'workflow_stage', 'new')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_escalate_sla_to_repair ON public.sla_tickets;
CREATE TRIGGER trg_escalate_sla_to_repair
  AFTER UPDATE ON public.sla_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.escalate_sla_to_repair_task();

CREATE OR REPLACE FUNCTION public.notify_new_sla_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_priority_label TEXT;
BEGIN
  IF NEW.priority NOT IN ('critical', 'high') THEN
    RETURN NEW;
  END IF;

  v_priority_label := CASE NEW.priority
    WHEN 'critical' THEN '🔥 KRYTYCZNE'
    WHEN 'high'     THEN '⚠️ WYSOKIE'
    ELSE                  ''
  END;

  INSERT INTO public.notifications_outbox (
    channel, subject, body, payload, related_table, related_id, status
  )
  VALUES (
    'telegram',
    'Nowe zgłoszenie SLA',
    format(
      E'%s — nowe zgłoszenie SLA\n\nNumer: %s\nTyp: %s\nOpis: %s\nZgłaszający: %s%s',
      v_priority_label,
      COALESCE(NEW.ticket_number, '—'),
      NEW.type,
      LEFT(NEW.description, 200),
      COALESCE(NEW.reporter_name, NEW.reporter_email, 'anonim'),
      CASE WHEN NEW.reporter_phone IS NOT NULL THEN E'\nTel: ' || NEW.reporter_phone ELSE '' END
    ),
    jsonb_build_object(
      'sla_ticket_id', NEW.id,
      'ticket_number', NEW.ticket_number,
      'priority', NEW.priority,
      'type', NEW.type,
      'building_id', NEW.building_id,
      'recipient_role', 'admin'
    ),
    'sla_tickets',
    NEW.id,
    'pending'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_sla ON public.sla_tickets;
CREATE TRIGGER trg_notify_new_sla
  AFTER INSERT ON public.sla_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_sla_ticket();

CREATE OR REPLACE FUNCTION public.mark_recurring_event_done(p_event_id UUID, p_done_date DATE DEFAULT NULL)
RETURNS public.recurring_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.recurring_events%ROWTYPE;
  v_done_date DATE;
  v_next_date DATE;
BEGIN
  SELECT * INTO v_event FROM public.recurring_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Recurring event not found: %', p_event_id;
  END IF;

  v_done_date := COALESCE(p_done_date, CURRENT_DATE);

  IF v_event.interval_months IS NOT NULL AND v_event.interval_months > 0 THEN
    v_next_date := v_done_date + (v_event.interval_months || ' months')::INTERVAL;
  ELSE
    v_next_date := NULL;
  END IF;

  UPDATE public.recurring_events
  SET last_done_date = v_done_date,
      next_due_date = v_next_date,
      updated_at = now()
  WHERE id = p_event_id
  RETURNING * INTO v_event;

  RETURN v_event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_recurring_event_done TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_recurring_events_updated_at'
  ) THEN
    CREATE TRIGGER trg_recurring_events_updated_at
      BEFORE UPDATE ON public.recurring_events
      FOR EACH ROW
      EXECUTE FUNCTION public.set_employee_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_outbox_pending
  ON public.notifications_outbox (created_at)
  WHERE sent_at IS NULL;