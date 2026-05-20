-- =============================================================================
-- Iter 10: Automatyzacje, nowe role, SLA timer, triggery zleceń
-- =============================================================================

-- ─── 1. Nowe wartości ról w user_roles ───────────────────────────────────────
DO $$
BEGIN
  -- Rozszerz enum ról jeśli istnieje
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'serviceman'; EXCEPTION WHEN others THEN NULL; END;
    BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'koordynator'; EXCEPTION WHEN others THEN NULL; END;
    BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'pracownik';   EXCEPTION WHEN others THEN NULL; END;
  END IF;
END $$;

-- ─── 2. SLA timer na tasks (czas reakcji i realizacji) ──────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS sla_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS sla_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_minutes_total integer GENERATED ALWAYS AS (
    CASE
      WHEN sla_started_at IS NOT NULL AND sla_completed_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (sla_completed_at - sla_started_at))::integer / 60
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS escalated_at     timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_note  text;

-- ─── 3. Trigger: task INSERT → powiadomienie dla przypisanego ────────────────
CREATE OR REPLACE FUNCTION fzg_on_task_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Powiadomienie in-app dla przypisanego
  IF NEW.assignee_id IS NOT NULL THEN
    INSERT INTO notifications_outbox (user_id, subject, body, channel, status, payload)
    VALUES (
      NEW.assignee_id,
      'Nowe zlecenie przypisane',
      format('Przypisano Ci zlecenie: %s', NEW.title),
      'in_app',
      'pending',
      jsonb_build_object('task_id', NEW.id, 'priority', NEW.priority)
    );

    -- Telegram dla krytycznych
    IF NEW.priority IN ('krytyczny', 'wysoki') THEN
      INSERT INTO notifications_outbox (user_id, subject, body, channel, status, payload)
      VALUES (
        NEW.assignee_id,
        format('🔴 Nowe zlecenie %s: %s', UPPER(NEW.priority), NEW.title),
        format('Termin: %s', COALESCE(NEW.deadline::text, 'brak')),
        'telegram',
        'pending',
        jsonb_build_object('task_id', NEW.id)
      );
    END IF;
  END IF;

  -- Alert dla adminów przy krytycznych
  IF NEW.priority = 'krytyczny' THEN
    INSERT INTO notifications_outbox (subject, body, channel, status, payload)
    VALUES (
      '🔥 Nowe zlecenie KRYTYCZNE',
      format('%s', NEW.title),
      'telegram',
      'pending',
      jsonb_build_object('recipient_role', 'admin', 'task_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_insert ON tasks;
CREATE TRIGGER trg_task_insert
  AFTER INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION fzg_on_task_insert();

-- ─── 4. Trigger: task UPDATE → zmiany statusu z timerami i powiadomieniami ──
CREATE OR REPLACE FUNCTION fzg_on_task_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_status_changed boolean := NEW.status IS DISTINCT FROM OLD.status;
  v_assignee_changed boolean := NEW.assignee_id IS DISTINCT FROM OLD.assignee_id;
BEGIN
  -- Start SLA timer gdy status zmienia się na "W realizacji"
  IF v_status_changed AND NEW.status = 'W realizacji' AND OLD.sla_started_at IS NULL THEN
    NEW.sla_started_at := now();
  END IF;

  -- Stop SLA timer gdy status zmienia się na "Zamknięte"
  IF v_status_changed AND NEW.status = 'Zamknięte' AND NEW.sla_completed_at IS NULL THEN
    NEW.sla_completed_at := now();
  END IF;

  -- Powiadomienie o zmianie przypisania
  IF v_assignee_changed AND NEW.assignee_id IS NOT NULL THEN
    INSERT INTO notifications_outbox (user_id, subject, body, channel, status, payload)
    VALUES (
      NEW.assignee_id,
      'Zlecenie przypisane do Ciebie',
      format('Zlecenie "%s" zostało Ci przypisane', NEW.title),
      'in_app',
      'pending',
      jsonb_build_object('task_id', NEW.id)
    );
    INSERT INTO notifications_outbox (user_id, subject, body, channel, status, payload)
    VALUES (
      NEW.assignee_id,
      format('📋 Zlecenie: %s', NEW.title),
      format('Termin: %s | Priorytet: %s', COALESCE(NEW.deadline::text, 'brak'), COALESCE(NEW.priority, 'normalny')),
      'telegram',
      'pending',
      jsonb_build_object('task_id', NEW.id)
    );
  END IF;

  -- Powiadomienie o zmianie statusu
  IF v_status_changed THEN
    -- Powiadom admina gdy zamknięte
    IF NEW.status = 'Zamknięte' THEN
      INSERT INTO notifications_outbox (subject, body, channel, status, payload)
      VALUES (
        format('✅ Zamknięto: %s', NEW.title),
        format('Czas realizacji: %s min', COALESCE((EXTRACT(EPOCH FROM (now() - NEW.sla_started_at)) / 60)::integer::text, 'brak timera')),
        'in_app',
        'pending',
        jsonb_build_object('recipient_role', 'admin', 'task_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_update ON tasks;
CREATE TRIGGER trg_task_update
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION fzg_on_task_update();

-- ─── 5. Trigger: SLA ticket INSERT → powiadomienie + auto-priorytet ──────────
CREATE OR REPLACE FUNCTION fzg_on_sla_ticket_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Natychmiastowe powiadomienie dla dyżurnego (admin/koordynator)
  INSERT INTO notifications_outbox (subject, body, channel, status, payload)
  VALUES (
    CASE NEW.priority
      WHEN 'krytyczny' THEN format('🔥 KRYTYCZNE zgłoszenie SLA: %s', COALESCE(NEW.title, 'Nowe zgłoszenie'))
      WHEN 'wysoki'    THEN format('⚠️ Wysoki priorytet SLA: %s', COALESCE(NEW.title, 'Nowe zgłoszenie'))
      ELSE                  format('🆕 Nowe zgłoszenie SLA: %s', COALESCE(NEW.title, 'Nowe zgłoszenie'))
    END,
    format('Zgłoszone: %s', now()::date),
    'telegram',
    'pending',
    jsonb_build_object('recipient_role', 'admin', 'sla_ticket_id', NEW.id)
  );

  -- In-app dla wszystkich adminów
  INSERT INTO notifications_outbox (subject, body, channel, status, payload)
  VALUES (
    format('Nowe zgłoszenie SLA: %s', COALESCE(NEW.title, 'Zgłoszenie')),
    COALESCE(NEW.description, ''),
    'in_app',
    'pending',
    jsonb_build_object('recipient_role', 'admin', 'sla_ticket_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sla_ticket_insert ON sla_tickets;
CREATE TRIGGER trg_sla_ticket_insert
  AFTER INSERT ON sla_tickets
  FOR EACH ROW EXECUTE FUNCTION fzg_on_sla_ticket_insert();

-- ─── 6. Trigger: audyt INSERT → dodaj do kalendarza + powiadom wykonującego ─
CREATE OR REPLACE FUNCTION fzg_on_audit_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Powiadomienie dla osoby wykonującej (jeśli przypisana)
  IF NEW.performed_by IS NOT NULL THEN
    INSERT INTO notifications_outbox (user_id, subject, body, channel, status, payload)
    VALUES (
      NEW.performed_by,
      format('📋 Zaplanowano audyt: %s', COALESCE(NEW.audit_type, 'PPOŻ')),
      format('Data: %s', COALESCE(NEW.performed_at::text, 'do ustalenia')),
      'in_app',
      'pending',
      jsonb_build_object('audit_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_insert ON audits;
CREATE TRIGGER trg_audit_insert
  AFTER INSERT ON audits
  FOR EACH ROW EXECUTE FUNCTION fzg_on_audit_insert();

-- ─── 7. Cron: sprawdzaj SLA breach co godzinę ────────────────────────────────
SELECT cron.schedule(
  'fzg-sla-breach-check',
  '0 * * * *',
  $$
    INSERT INTO notifications_outbox (subject, body, channel, status, payload)
    SELECT
      format('🔴 SLA breach: %s', COALESCE(t.title, 'Zgłoszenie')),
      format('Oczekuje > 4h bez odpowiedzi (ID: %s)', t.id),
      'telegram',
      'pending',
      jsonb_build_object('recipient_role', 'admin', 'sla_ticket_id', t.id)
    FROM sla_tickets t
    WHERE t.status IN ('nowe', 'otwarte')
      AND t.created_at < now() - interval '4 hours'
      AND NOT EXISTS (
        SELECT 1 FROM notifications_outbox n
        WHERE (n.payload->>'sla_ticket_id')::text = t.id::text
          AND n.subject LIKE '%SLA breach%'
          AND n.created_at > now() - interval '4 hours'
      )
    LIMIT 10;
  $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule;

-- ─── 8. Cron: przeterminowane urządzenia — alert dzienny ─────────────────────
SELECT cron.schedule(
  'fzg-devices-overdue-check',
  '0 7 * * *',
  $$
    INSERT INTO notifications_outbox (subject, body, channel, status, payload)
    SELECT
      format('🔧 %s urządzeń wymaga przeglądu', COUNT(*)),
      string_agg(format('• %s (%s)', d.name, d.device_type), chr(10)) FILTER (WHERE d.name IS NOT NULL),
      'telegram',
      'pending',
      jsonb_build_object('recipient_role', 'admin')
    FROM devices d
    WHERE d.next_inspection_date < CURRENT_DATE
    HAVING COUNT(*) > 0;
  $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule;

-- ─── 9. Indeks na notifications_outbox dla szybkości ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_outbox_user_status
  ON notifications_outbox (user_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status
  ON tasks (assignee_id, status)
  WHERE status != 'Zamknięte';
