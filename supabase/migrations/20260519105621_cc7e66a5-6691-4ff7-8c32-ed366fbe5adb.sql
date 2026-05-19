
-- 1) Building number
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS building_number INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS uq_buildings_company_number
  ON public.buildings(company_id, building_number) WHERE building_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_building_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.building_number IS NULL THEN
    SELECT COALESCE(MAX(building_number), 0) + 1
      INTO NEW.building_number FROM public.buildings WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_assign_building_number ON public.buildings;
CREATE TRIGGER trg_assign_building_number BEFORE INSERT ON public.buildings
  FOR EACH ROW EXECUTE FUNCTION public.assign_building_number();

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at, id) AS rn
    FROM public.buildings WHERE building_number IS NULL
)
UPDATE public.buildings b SET building_number = n.rn FROM numbered n WHERE b.id = n.id;

-- 2) Task code
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_code TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_seq INTEGER;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_year INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_company_task_code
  ON public.tasks(company_id, task_code) WHERE task_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_task_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year INT; v_bnum INT; v_seq INT;
BEGIN
  IF NEW.task_code IS NOT NULL AND NEW.task_code <> '' THEN RETURN NEW; END IF;
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::INT;
  SELECT building_number INTO v_bnum FROM public.buildings WHERE id = NEW.building_id;
  IF v_bnum IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX(task_seq), 0) + 1 INTO v_seq
    FROM public.tasks WHERE building_id = NEW.building_id AND task_year = v_year;
  NEW.task_seq := v_seq;
  NEW.task_year := v_year;
  NEW.task_code := v_bnum || '.' || v_seq || '.' || v_year;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_assign_task_code ON public.tasks;
CREATE TRIGGER trg_assign_task_code BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.assign_task_code();

WITH numbered AS (
  SELECT t.id, b.building_number AS bnum,
         EXTRACT(YEAR FROM t.created_at)::INT AS yr,
         ROW_NUMBER() OVER (PARTITION BY t.building_id, EXTRACT(YEAR FROM t.created_at)
                            ORDER BY t.created_at, t.id) AS rn
    FROM public.tasks t JOIN public.buildings b ON b.id = t.building_id
   WHERE t.task_code IS NULL
)
UPDATE public.tasks t
   SET task_seq = n.rn, task_year = n.yr,
       task_code = n.bnum || '.' || n.rn || '.' || n.yr
  FROM numbered n WHERE t.id = n.id AND n.bnum IS NOT NULL;
