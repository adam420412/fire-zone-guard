-- =============================================================================
-- ITERATION 2 — Automations: SLA→Naprawy escalation, notifications, RPCs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. AUTO-ESKALACJA: SLA ticket "naprawiono" → tworzy zadanie typu naprawa
-- ---------------------------------------------------------------------------
-- Wymaga building_id + company_id (tasks NOT NULL). Tickety bez tych pól
-- (np. z publicznego formularza dla nieznanej lokalizacji) zostają pominięte.
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
  -- Tylko gdy status zmienia się na 'naprawiono' i nie ma jeszcze powiązanego zadania
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'naprawiono'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.related_task_id IS NULL
     AND NEW.building_id IS NOT NULL
  THEN
    -- Wyznacz company_id (z ticketa lub z buildingu)
    v_company_id := COALESCE(
      NEW.company_id,
      (SELECT company_id FROM public.buildings WHERE id = NEW.building_id LIMIT 1)
    );

    IF v_company_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Mapuj priority SLA → priority task
    v_priority := CASE NEW.priority
      WHEN 'critical' THEN 'krytyczny'::public.task_priority
      WHEN 'high'     THEN 'wysoki'::public.task_priority
      WHEN 'low'      THEN 'niski'::public.task_priority
      ELSE                  'średni'::public.task_priority
    END;

    -- Insert zadania w stage 'new'
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

    -- Wstecznie powiąż ticket
    UPDATE public.sla_tickets SET related_task_id = v_task_id WHERE id = NEW.id;
    NEW.related_task_id := v_task_id;

    -- Loguj event
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

-- ---------------------------------------------------------------------------
-- 2. NOTIFICATIONS: nowe SLA o priorytecie critical/high → outbox (Telegram)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. RPC: oznacz wydarzenie cykliczne jako wykonane + zaplanuj kolejne
-- ---------------------------------------------------------------------------
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

  -- Wyznacz następny termin
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

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger dla recurring_events (jeśli nie ma)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5. Indeks pomagający w cron-job dla notifications_outbox
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_outbox_pending
  ON public.notifications_outbox (created_at)
  WHERE sent_at IS NULL;
