-- =============================================================================
-- Building trainings module — szkolenia ppoż. w obiektach
-- =============================================================================

-- 1. Słownik typów szkoleń
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'building_training_type') THEN
    CREATE TYPE public.building_training_type AS ENUM (
      'ogolne_ppoz',
      'obslugowo_uzytkowe',
      'probna_ewakuacja',
      'medyczne',
      'inne'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'building_training_status') THEN
    CREATE TYPE public.building_training_status AS ENUM (
      'zaplanowane',
      'w_trakcie',
      'zakonczone',
      'odwolane'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'training_attendance_status') THEN
    CREATE TYPE public.training_attendance_status AS ENUM (
      'zaplanowany',
      'obecny',
      'nieobecny',
      'usprawiedliwiony'
    );
  END IF;
END $$;

-- 2. Tabela szkoleń w obiekcie
CREATE TABLE IF NOT EXISTS public.building_trainings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id           UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  company_id            UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  type                  public.building_training_type NOT NULL DEFAULT 'ogolne_ppoz',
  title                 TEXT NOT NULL,
  description           TEXT,
  trainer_name          TEXT,
  trainer_user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_at          TIMESTAMPTZ NOT NULL,
  completed_at          TIMESTAMPTZ,
  duration_minutes      INTEGER,
  status                public.building_training_status NOT NULL DEFAULT 'zaplanowane',
  recurrence_months     INTEGER,
  next_due_date         DATE,
  certificate_url       TEXT,
  protocol_url          TEXT,
  notes                 TEXT,
  created_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_building_trainings_building ON public.building_trainings(building_id);
CREATE INDEX IF NOT EXISTS idx_building_trainings_company  ON public.building_trainings(company_id);
CREATE INDEX IF NOT EXISTS idx_building_trainings_status   ON public.building_trainings(status);
CREATE INDEX IF NOT EXISTS idx_building_trainings_due      ON public.building_trainings(next_due_date)
  WHERE next_due_date IS NOT NULL;

-- 3. Auto-fill company_id z buildings + updated_at
CREATE OR REPLACE FUNCTION public.set_building_training_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.buildings WHERE id = NEW.building_id;
  END IF;
  NEW.updated_at := now();
  -- Jezeli ustawiono interwal i brak next_due_date, policz na bazie scheduled_at
  IF NEW.recurrence_months IS NOT NULL AND NEW.recurrence_months > 0 AND NEW.next_due_date IS NULL THEN
    NEW.next_due_date := (COALESCE(NEW.completed_at, NEW.scheduled_at)::date)
                         + (NEW.recurrence_months || ' months')::interval;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_building_trainings_defaults ON public.building_trainings;
CREATE TRIGGER trg_building_trainings_defaults
  BEFORE INSERT OR UPDATE ON public.building_trainings
  FOR EACH ROW EXECUTE FUNCTION public.set_building_training_defaults();

-- 4. Tabela uczestników
CREATE TABLE IF NOT EXISTS public.building_training_participants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id         UUID NOT NULL REFERENCES public.building_trainings(id) ON DELETE CASCADE,
  employee_id         UUID REFERENCES public.employee_development_plans(id) ON DELETE SET NULL,
  user_id             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  guest_name          TEXT,
  guest_email         TEXT,
  guest_phone         TEXT,
  attendance_status   public.training_attendance_status NOT NULL DEFAULT 'zaplanowany',
  passed              BOOLEAN,
  score               NUMERIC,
  certificate_url     TEXT,
  signed_at           TIMESTAMPTZ,
  signature_url       TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_participant_identity
    CHECK (employee_id IS NOT NULL OR user_id IS NOT NULL OR guest_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_btp_training ON public.building_training_participants(training_id);
CREATE INDEX IF NOT EXISTS idx_btp_employee ON public.building_training_participants(employee_id);
CREATE INDEX IF NOT EXISTS idx_btp_user     ON public.building_training_participants(user_id);

-- Unikalność: jeden pracownik / user nie może być dodany dwa razy do tego samego szkolenia
CREATE UNIQUE INDEX IF NOT EXISTS uniq_btp_training_employee
  ON public.building_training_participants(training_id, employee_id)
  WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_btp_training_user
  ON public.building_training_participants(training_id, user_id)
  WHERE user_id IS NOT NULL;

-- 5. RLS
ALTER TABLE public.building_trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_training_participants ENABLE ROW LEVEL SECURITY;

-- super_admin pełny dostęp
CREATE POLICY "bt_super_admin_all"
  ON public.building_trainings FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "btp_super_admin_all"
  ON public.building_training_participants FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- admin firmy: zarządza szkoleniami w obiektach swojej firmy
CREATE POLICY "bt_company_admin_manage"
  ON public.building_trainings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.buildings b
            WHERE b.id = building_trainings.building_id
              AND public.is_company_admin(b.company_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.buildings b
            WHERE b.id = building_trainings.building_id
              AND public.is_company_admin(b.company_id))
  );

CREATE POLICY "btp_company_admin_manage"
  ON public.building_training_participants FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.building_trainings bt
            JOIN public.buildings b ON b.id = bt.building_id
            WHERE bt.id = building_training_participants.training_id
              AND public.is_company_admin(b.company_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.building_trainings bt
            JOIN public.buildings b ON b.id = bt.building_id
            WHERE bt.id = building_training_participants.training_id
              AND public.is_company_admin(b.company_id))
  );

-- Pracownicy / klienci tej samej firmy: tylko podgląd
CREATE POLICY "bt_company_read"
  ON public.building_trainings FOR SELECT
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR EXISTS (SELECT 1 FROM public.buildings b
               WHERE b.id = building_trainings.building_id
                 AND b.company_id = public.get_user_company_id(auth.uid()))
  );

CREATE POLICY "btp_company_read"
  ON public.building_training_participants FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.building_trainings bt
            JOIN public.buildings b ON b.id = bt.building_id
            WHERE bt.id = building_training_participants.training_id
              AND b.company_id = public.get_user_company_id(auth.uid()))
  );

-- Uczestnik widzi swoje wpisy
CREATE POLICY "btp_self_read"
  ON public.building_training_participants FOR SELECT
  USING (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- 6. Auto-tworzenie wpisu w recurring_events po zapisaniu szkolenia z interwałem
CREATE OR REPLACE FUNCTION public.sync_training_to_recurring_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.recurrence_months IS NOT NULL AND NEW.recurrence_months > 0 AND NEW.next_due_date IS NOT NULL THEN
    INSERT INTO public.recurring_events (
      type, recurrence_type, title, description, related_table, related_id,
      due_date, next_due_date, interval_months, building_id, company_id,
      reminder_days_before, status, created_by
    ) VALUES (
      'szkolenie', 'szkolenie',
      NEW.title,
      'Szkolenie PPOŻ: ' || NEW.type::text,
      'building_trainings', NEW.id,
      NEW.next_due_date, NEW.next_due_date, NEW.recurrence_months,
      NEW.building_id, NEW.company_id,
      ARRAY[30, 7, 1],
      'pending', NEW.created_by
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_sync_recurring ON public.building_trainings;
CREATE TRIGGER trg_training_sync_recurring
  AFTER INSERT ON public.building_trainings
  FOR EACH ROW EXECUTE FUNCTION public.sync_training_to_recurring_event();