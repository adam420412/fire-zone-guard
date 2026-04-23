-- Smoke test: progress existing SLA ticket to "naprawiono" so escalate_sla_to_repair_task fires
DO $$
DECLARE
  v_ticket_id uuid := 'fbe7ff6f-e03f-41ca-9bfb-ed2035468d14';
  v_trigger_exists boolean;
BEGIN
  -- Confirm escalation trigger is wired up
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.sla_tickets'::regclass
      AND p.proname = 'escalate_sla_to_repair_task'
      AND NOT t.tgisinternal
  ) INTO v_trigger_exists;

  IF NOT v_trigger_exists THEN
    -- Wire it up if missing (BEFORE UPDATE so NEW.related_task_id assignment in fn persists)
    DROP TRIGGER IF EXISTS trg_escalate_sla_to_repair ON public.sla_tickets;
    CREATE TRIGGER trg_escalate_sla_to_repair
      BEFORE UPDATE ON public.sla_tickets
      FOR EACH ROW EXECUTE FUNCTION public.escalate_sla_to_repair_task();
  END IF;

  UPDATE public.sla_tickets
  SET status = 'naprawiono',
      diagnosis = 'Smoke test diagnosis — trigger should escalate to Naprawy kanban'
  WHERE id = v_ticket_id;
END $$;