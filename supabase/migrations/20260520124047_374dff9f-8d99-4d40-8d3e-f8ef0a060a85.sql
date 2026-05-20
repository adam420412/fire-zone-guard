
-- Iter 10: Automatyzacje, SLA timer, triggery (dostosowane do faktycznego schematu)

-- 1. SLA timer + escalation na tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS sla_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS sla_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_minutes_total integer GENERATED ALWAYS AS (
    CASE
      WHEN sla_started_at IS NOT NULL AND sla_completed_at IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (sla_completed_at - sla_started_at))::integer / 60)
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS escalated_at     timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_note  text;

-- 2. Trigger: task INSERT -> powiadomienia
CREATE OR REPLACE FUNCTION public.fzg_on_task_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assignee_id IS NOT NULL THEN
    INSERT INTO public.notifications_outbox (user_id, subject, body, channel, status, payload, related_table, related_id)
    VALUES (
      NEW.assignee_id,
      'Nowe zlecenie przypisane',
      format('Przypisano Ci zlecenie: %s', NEW.title),
      'in_app','pending',
      jsonb_build_object('task_id', NEW.id, 'priority', NEW.priority),
      'tasks', NEW.id
    );

    IF NEW.priority IN ('krytyczny','wysoki') THEN
      INSERT INTO public.notifications_outbox (user_id, subject, body, channel, status, payload, related_table, related_id)
      VALUES (
        NEW.assignee_id,
        format('🔴 Nowe zlecenie %s: %s', UPPER(NEW.priority::text), NEW.title),
        format('Termin: %s', COALESCE(NEW.deadline::text, 'brak')),
        'telegram','pending',
        jsonb_build_object('task_id', NEW.id),
        'tasks', NEW.id
      );
    END IF;
  END IF;

  IF NEW.priority = 'krytyczny' THEN
    INSERT INTO public.notifications_outbox (subject, body, channel, status, payload, related_table, related_id)
    VALUES (
      '🔥 Nowe zlecenie KRYTYCZNE',
      NEW.title,
      'telegram','pending',
      jsonb_build_object('recipient_role','admin','task_id', NEW.id),
      'tasks', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_insert ON public.tasks;
CREATE TRIGGER trg_task_insert AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.fzg_on_task_insert();

-- 3. Trigger: task UPDATE -> timer + powiadomienia
CREATE OR REPLACE FUNCTION public.fzg_on_task_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status_changed   boolean := NEW.status IS DISTINCT FROM OLD.status;
  v_assignee_changed boolean := NEW.assignee_id IS DISTINCT FROM OLD.assignee_id;
BEGIN
  IF v_status_changed AND NEW.status = 'W realizacji' AND NEW.sla_started_at IS NULL THEN
    NEW.sla_started_at := now();
  END IF;

  IF v_status_changed AND NEW.status = 'Zamknięte' AND NEW.sla_completed_at IS NULL THEN
    NEW.sla_completed_at := now();
  END IF;

  IF v_assignee_changed AND NEW.assignee_id IS NOT NULL THEN
    INSERT INTO public.notifications_outbox (user_id, subject, body, channel, status, payload, related_table, related_id)
    VALUES (
      NEW.assignee_id,
      'Zlecenie przypisane do Ciebie',
      format('Zlecenie "%s" zostało Ci przypisane', NEW.title),
      'in_app','pending',
      jsonb_build_object('task_id', NEW.id),
      'tasks', NEW.id
    );
    INSERT INTO public.notifications_outbox (user_id, subject, body, channel, status, payload, related_table, related_id)
    VALUES (
      NEW.assignee_id,
      format('📋 Zlecenie: %s', NEW.title),
      format('Termin: %s | Priorytet: %s', COALESCE(NEW.deadline::text,'brak'), COALESCE(NEW.priority::text,'normalny')),
      'telegram','pending',
      jsonb_build_object('task_id', NEW.id),
      'tasks', NEW.id
    );
  END IF;

  IF v_status_changed AND NEW.status = 'Zamknięte' THEN
    INSERT INTO public.notifications_outbox (subject, body, channel, status, payload, related_table, related_id)
    VALUES (
      format('✅ Zamknięto: %s', NEW.title),
      format('Czas realizacji: %s min',
        COALESCE((EXTRACT(EPOCH FROM (now() - NEW.sla_started_at)) / 60)::integer::text, 'brak timera')),
      'in_app','pending',
      jsonb_build_object('recipient_role','admin','task_id', NEW.id),
      'tasks', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_update ON public.tasks;
CREATE TRIGGER trg_task_update BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.fzg_on_task_update();

-- 4. Trigger: SLA ticket INSERT (sla_tickets nie ma 'title' - uzywamy ticket_number/description)
CREATE OR REPLACE FUNCTION public.fzg_on_sla_ticket_insert_iter10()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_label text := COALESCE(NEW.ticket_number, LEFT(COALESCE(NEW.description,'Nowe zgłoszenie'), 60));
BEGIN
  INSERT INTO public.notifications_outbox (subject, body, channel, status, payload, related_table, related_id)
  VALUES (
    CASE NEW.priority::text
      WHEN 'critical' THEN format('🔥 KRYTYCZNE SLA: %s', v_label)
      WHEN 'high'     THEN format('⚠️ Wysokie SLA: %s', v_label)
      ELSE                  format('🆕 Nowe SLA: %s', v_label)
    END,
    LEFT(COALESCE(NEW.description,''), 300),
    'telegram','pending',
    jsonb_build_object('recipient_role','admin','sla_ticket_id', NEW.id),
    'sla_tickets', NEW.id
  );

  INSERT INTO public.notifications_outbox (subject, body, channel, status, payload, related_table, related_id)
  VALUES (
    format('Nowe zgłoszenie SLA: %s', v_label),
    COALESCE(NEW.description,''),
    'in_app','pending',
    jsonb_build_object('recipient_role','admin','sla_ticket_id', NEW.id),
    'sla_tickets', NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sla_ticket_insert_iter10 ON public.sla_tickets;
CREATE TRIGGER trg_sla_ticket_insert_iter10 AFTER INSERT ON public.sla_tickets
  FOR EACH ROW EXECUTE FUNCTION public.fzg_on_sla_ticket_insert_iter10();

-- 5. Trigger: audit INSERT (audits ma tylko performed_at - bez performed_by/audit_type)
CREATE OR REPLACE FUNCTION public.fzg_on_audit_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications_outbox (subject, body, channel, status, payload, related_table, related_id)
  VALUES (
    '📋 Nowy audyt zaplanowany',
    format('Data: %s', COALESCE(NEW.performed_at::text,'do ustalenia')),
    'in_app','pending',
    jsonb_build_object('recipient_role','admin','audit_id', NEW.id),
    'audits', NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_insert ON public.audits;
CREATE TRIGGER trg_audit_insert AFTER INSERT ON public.audits
  FOR EACH ROW EXECUTE FUNCTION public.fzg_on_audit_insert();

-- 6. Cron: SLA breach co godzinę
DO $$ BEGIN
  PERFORM cron.unschedule('fzg-sla-breach-check');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'fzg-sla-breach-check',
  '0 * * * *',
  $cron$
    INSERT INTO public.notifications_outbox (subject, body, channel, status, payload, related_table, related_id)
    SELECT
      format('🔴 SLA breach: %s', COALESCE(t.ticket_number, LEFT(t.description,60), 'Zgłoszenie')),
      format('Oczekuje > 4h bez odpowiedzi (ID: %s)', t.id),
      'telegram','pending',
      jsonb_build_object('recipient_role','admin','sla_ticket_id', t.id),
      'sla_tickets', t.id
    FROM public.sla_tickets t
    WHERE t.status::text IN ('zgloszenie','telefon','wyjazd','na_miejscu','diagnoza')
      AND t.created_at < now() - interval '4 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications_outbox n
        WHERE n.related_table = 'sla_tickets' AND n.related_id = t.id
          AND n.subject LIKE '%SLA breach%'
          AND n.created_at > now() - interval '4 hours'
      )
    LIMIT 10;
  $cron$
);

-- 7. Cron: urządzenia przeterminowane codziennie 7:00 (devices.next_service_date)
DO $$ BEGIN
  PERFORM cron.unschedule('fzg-devices-overdue-check');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'fzg-devices-overdue-check',
  '0 7 * * *',
  $cron$
    INSERT INTO public.notifications_outbox (subject, body, channel, status, payload)
    SELECT
      format('🔧 %s urządzeń wymaga przeglądu', COUNT(*)),
      string_agg(format('• %s', d.name), chr(10)),
      'telegram','pending',
      jsonb_build_object('recipient_role','admin')
    FROM public.devices d
    WHERE d.next_service_date IS NOT NULL
      AND d.next_service_date < CURRENT_DATE
    HAVING COUNT(*) > 0;
  $cron$
);

-- 8. Indeksy
CREATE INDEX IF NOT EXISTS idx_notifications_outbox_user_status
  ON public.notifications_outbox (user_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status
  ON public.tasks (assignee_id, status)
  WHERE status != 'Zamknięte';
