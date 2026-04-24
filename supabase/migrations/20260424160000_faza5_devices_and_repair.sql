-- =============================================================================
-- Faza 5 — Master checklist urządzeń + suggestion engine + NAPRAWA flag
--
-- 1. Buildings: add `building_class` (ZL I/II/III/IV/V, PM, IN, etc.) and
--    `area_total` (m²) so the suggestion engine can match against
--    `device_requirement_rules`.
--
-- 2. Hydrant measurements: add `repair_needed`, `repair_notes`,
--    `repair_task_id`. When inspector flips `repair_needed = TRUE`, a trigger
--    auto-creates a `tasks` row (source='service', source_id=measurement.id,
--    workflow_stage='new') so it lands in RepairsKanban without manual entry.
--
-- 3. service_protocols: add `repair_summary` (free text overall).
--
-- 4. Helper view `building_device_summary`: per-building, per-required-type
--    aggregates (installed_count, last_service_date, oldest_next_service)
--    so the UI can render "5 / 8 wymagane" badges in one read.
-- =============================================================================

-- ---- 1. Buildings: class + area --------------------------------------------
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS building_class TEXT;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS area_total      NUMERIC;

COMMENT ON COLUMN public.buildings.building_class IS
  'Klasa zagrożenia ludzi / przeznaczenie: ZL I, ZL II, ZL III, ZL IV, ZL V, PM, IN. Wykorzystywana przez device_requirement_rules.';
COMMENT ON COLUMN public.buildings.area_total IS
  'Powierzchnia użytkowa w m². Wykorzystywana przez device_requirement_rules.area_min/area_max do dobrania liczby urządzeń.';

-- ---- 2. Hydrant repair flag + trigger --------------------------------------
ALTER TABLE public.hydrant_measurements ADD COLUMN IF NOT EXISTS repair_needed  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.hydrant_measurements ADD COLUMN IF NOT EXISTS repair_notes   TEXT;
ALTER TABLE public.hydrant_measurements ADD COLUMN IF NOT EXISTS repair_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hydrant_repair ON public.hydrant_measurements (repair_needed)
  WHERE repair_needed = TRUE;

-- Trigger: when repair_needed flips false → true, auto-create a service task
CREATE OR REPLACE FUNCTION public.handle_hydrant_repair_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_building_id UUID;
  v_company_id  UUID;
  v_task_id     UUID;
BEGIN
  -- Only act when transitioning false→true (or NULL→true on insert)
  IF NEW.repair_needed IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.repair_needed = TRUE THEN
    RETURN NEW; -- already flagged
  END IF;
  IF NEW.repair_task_id IS NOT NULL THEN
    RETURN NEW; -- task already exists
  END IF;

  -- Resolve building/company via parent protocol
  SELECT sp.building_id, b.company_id
    INTO v_building_id, v_company_id
  FROM public.service_protocols sp
  JOIN public.buildings b ON b.id = sp.building_id
  WHERE sp.id = NEW.protocol_id;

  IF v_building_id IS NULL OR v_company_id IS NULL THEN
    RETURN NEW; -- defensive: orphaned protocol
  END IF;

  -- Auto-create repair task tagged with source for the Naprawy Kanban
  INSERT INTO public.tasks (
    company_id, building_id,
    type, title, description, priority, status,
    sla_hours, deadline,
    workflow_stage, source, source_id
  ) VALUES (
    v_company_id, v_building_id,
    'usterka',
    'Naprawa hydrantu ' || NEW.hydrant_number,
    'Auto-zgłoszenie z protokołu hydrantowego. ' ||
      'DN: ' || NEW.dn_diameter || ', typ: ' || NEW.type ||
      CASE WHEN NEW.repair_notes IS NOT NULL AND NEW.repair_notes <> ''
           THEN E'\nUwagi inspektora: ' || NEW.repair_notes ELSE '' END,
    'wysoki', 'Nowe',
    72, NOW() + INTERVAL '72 hours',
    'new', 'service', NEW.id
  )
  RETURNING id INTO v_task_id;

  -- Backfill measurement.repair_task_id (avoid recursive trigger via direct UPDATE)
  UPDATE public.hydrant_measurements
     SET repair_task_id = v_task_id
   WHERE id = NEW.id;

  NEW.repair_task_id := v_task_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hydrant_repair_to_task ON public.hydrant_measurements;
CREATE TRIGGER trg_hydrant_repair_to_task
BEFORE INSERT OR UPDATE OF repair_needed ON public.hydrant_measurements
FOR EACH ROW EXECUTE FUNCTION public.handle_hydrant_repair_flag();

-- ---- 3. service_protocols summary ------------------------------------------
ALTER TABLE public.service_protocols ADD COLUMN IF NOT EXISTS repair_summary TEXT;

-- ---- 4. building_device_summary view ---------------------------------------
-- Aggregates devices per building + per device type so the master checklist
-- can render "5 instalacji / 12 wymaganych — 1 po terminie" without N+1 reads.
CREATE OR REPLACE VIEW public.building_device_summary AS
SELECT
  b.id                                     AS building_id,
  dt.id                                    AS device_type_id,
  dt.name                                  AS device_type_name,
  COUNT(d.id)                              AS installed_count,
  COUNT(d.id) FILTER (WHERE d.next_service_date <= CURRENT_DATE) AS overdue_count,
  MIN(d.next_service_date)                 AS earliest_next_service,
  MAX(d.last_service_date)                 AS latest_service
FROM public.buildings b
CROSS JOIN public.device_types dt
LEFT JOIN public.devices d
  ON d.building_id = b.id AND d.device_type_id = dt.id AND d.status <> 'wycofane'
GROUP BY b.id, dt.id, dt.name;

GRANT SELECT ON public.building_device_summary TO authenticated;

-- =============================================================================
-- Done — UI can read building_device_summary + device_requirement_rules to
-- render: { installed, overdue, suggested } per building × per type.
-- =============================================================================
