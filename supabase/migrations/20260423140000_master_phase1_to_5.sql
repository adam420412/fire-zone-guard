-- ==============================================================================
-- Fire Zone Guard — MASTER MIGRATION dla Faz 1-5
-- ==============================================================================
-- Cele:
--   F1: SLA tickets od klienta z foto + workflow + AI categorization
--   F2: device_requirement_rules + workflow_stage NAPRAW na tasks
--   F3: recurring_events + notifications_outbox dla harmonogramu
--   F4: storage bucket sla-photos
-- Wszystkie tabele idempotentne (CREATE TABLE IF NOT EXISTS), wszystkie polityki
-- DROPowane przed CREATE żeby reapply nie wybuchał.
-- ==============================================================================

-- ============================== FAZA 1 — SLA ==================================

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
    event_type TEXT NOT NULL,  -- created, status_change, comment, photo_added, ai_response, escalated
    payload JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_events_ticket  ON public.sla_ticket_events (ticket_id, created_at DESC);

-- ----- Numeracja zgłoszeń SLA-YYYY-MM-NNNN ------------------------------------
CREATE OR REPLACE FUNCTION public.generate_sla_ticket_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

-- ----- Auto-set SLA deadlines based on priority -------------------------------
CREATE OR REPLACE FUNCTION public.set_sla_deadlines()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

-- ----- updated_at trigger reuse -----------------------------------------------
DROP TRIGGER IF EXISTS trg_sla_tickets_updated_at ON public.sla_tickets;
CREATE TRIGGER trg_sla_tickets_updated_at
BEFORE UPDATE ON public.sla_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_employee_updated_at();
-- (using the helper from previous migration; if it doesn't exist this errors,
--  but it does — see 20260423120000_employees_module_v2.sql)

-- ----- Auto-log event when status changes -------------------------------------
CREATE OR REPLACE FUNCTION public.log_sla_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.sla_ticket_events (ticket_id, actor_id, event_type, payload)
        VALUES (NEW.id, NEW.assigned_to, 'created',
                jsonb_build_object('status', NEW.status, 'priority', NEW.priority, 'type', NEW.type));
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.sla_ticket_events (ticket_id, actor_id, event_type, payload)
        VALUES (NEW.id, NEW.assigned_to, 'status_change',
                jsonb_build_object('from', OLD.status, 'to', NEW.status));
        -- Auto-fill timing fields based on status transitions
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

-- ----- RLS --------------------------------------------------------------------
ALTER TABLE public.sla_tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_ticket_events ENABLE ROW LEVEL SECURITY;

-- czyszczenie istniejących polityk
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname, tablename FROM pg_policies
             WHERE schemaname='public' AND tablename IN ('sla_tickets','sla_ticket_events') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- Operator (HR/admin/coordinator/inspektor) — pełen CRUD
CREATE POLICY "sla_hr_all" ON public.sla_tickets
    FOR ALL USING (public.is_hr_manager()) WITH CHECK (public.is_hr_manager());

-- Klient widzi swoje zgłoszenia (po reporter_user_id)
CREATE POLICY "sla_self_read" ON public.sla_tickets
    FOR SELECT USING (
        reporter_user_id = auth.uid()
        OR (company_id IS NOT NULL AND company_id IN (
            SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
        ))
    );

-- Klient zalogowany może tworzyć (jego user_id zostanie wymuszone w hooku)
CREATE POLICY "sla_self_insert" ON public.sla_tickets
    FOR INSERT WITH CHECK (
        reporter_user_id = auth.uid()
        OR auth.uid() IS NULL  -- anonimowe zgłoszenie z formularza publicznego
    );

-- Anonimowy formularz publiczny — INSERT bez auth (formularz `/zgloszenie`)
CREATE POLICY "sla_anon_insert" ON public.sla_tickets
    FOR INSERT TO anon WITH CHECK (true);

-- Eventy widzi ten, kto widzi ticket
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

-- ----- View dla wygodnego query'owania ----------------------------------------
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

-- ============================== FAZA 2 — Reguły urządzeń + NAPRAWY ============

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

-- Seed startowych reguł (najpopularniejsze klasy ZL)
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

-- Rozszerzenie tasks o workflow NAPRAW
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS workflow_stage TEXT
    CHECK (workflow_stage IN ('new','offer','accepted','ordered','delivered','in_progress','completed','invoiced'));

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source TEXT
    CHECK (source IN ('audit','service','sla','manual'));

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source_id UUID;

CREATE INDEX IF NOT EXISTS idx_tasks_workflow_stage ON public.tasks (workflow_stage)
    WHERE workflow_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_source         ON public.tasks (source, source_id)
    WHERE source IS NOT NULL;

-- ============================== FAZA 3 — Harmonogram + powiadomienia ==========

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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- Notifications outbox
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

-- ============================== FAZA 4 — Storage bucket =======================
-- Bucket dla zdjęć z formularza SLA. Public (bezpieczny dla foto-zgłoszeń),
-- write tylko dla anon/authenticated, read dla wszystkich (signed URLs preferred).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('sla-photos', 'sla-photos', true, 10485760)  -- 10 MB
ON CONFLICT (id) DO NOTHING;

-- Polityki uploadu na bucket (anonimowy formularz musi móc uploadować)
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

-- ==============================================================================
-- KONIEC MASTER MIGRACJI
-- ==============================================================================
