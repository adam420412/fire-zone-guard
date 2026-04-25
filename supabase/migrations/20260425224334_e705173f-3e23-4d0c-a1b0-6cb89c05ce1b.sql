-- 1. Tabela certyfikatów uczestników
CREATE TABLE IF NOT EXISTS public.training_certificates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_number TEXT NOT NULL UNIQUE,
  training_id        UUID NOT NULL,
  participant_id     UUID NOT NULL,
  building_id        UUID,
  company_id         UUID,
  participant_name   TEXT,
  training_title     TEXT,
  training_type      TEXT,
  training_date      DATE NOT NULL,
  issued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until        DATE,
  pdf_url            TEXT,
  status             TEXT NOT NULL DEFAULT 'wystawiony',
  issued_by          UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (training_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_tc_training     ON public.training_certificates(training_id);
CREATE INDEX IF NOT EXISTS idx_tc_participant  ON public.training_certificates(participant_id);
CREATE INDEX IF NOT EXISTS idx_tc_building     ON public.training_certificates(building_id);

-- 2. Generator numeru certyfikatu CERT-RRRR-NNNN
CREATE OR REPLACE FUNCTION public.generate_training_certificate_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year TEXT;
  v_next INT;
BEGIN
  IF NEW.certificate_number IS NOT NULL AND NEW.certificate_number <> '' THEN
    RETURN NEW;
  END IF;
  v_year := TO_CHAR(COALESCE(NEW.issued_at, now()), 'YYYY');
  SELECT COALESCE(
    MAX( (regexp_match(certificate_number, '^CERT-\d{4}-(\d+)$'))[1]::INT ), 0) + 1
    INTO v_next
    FROM public.training_certificates
   WHERE certificate_number LIKE 'CERT-' || v_year || '-%';
  NEW.certificate_number := 'CERT-' || v_year || '-' || LPAD(v_next::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tc_number ON public.training_certificates;
CREATE TRIGGER trg_tc_number
BEFORE INSERT ON public.training_certificates
FOR EACH ROW EXECUTE FUNCTION public.generate_training_certificate_number();

-- 3. Auto-utworzenie certyfikatu po obecnosci/usprawiedliwieniu
CREATE OR REPLACE FUNCTION public.auto_create_training_certificate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training  public.building_trainings%ROWTYPE;
  v_name      TEXT;
  v_email     TEXT;
  v_emp       RECORD;
  v_prof      RECORD;
  v_building  RECORD;
BEGIN
  IF NEW.attendance_status NOT IN ('obecny','usprawiedliwiony') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.attendance_status IS NOT DISTINCT FROM NEW.attendance_status THEN
    RETURN NEW;
  END IF;

  -- juz istnieje?
  IF EXISTS (
    SELECT 1 FROM public.training_certificates
     WHERE training_id = NEW.training_id AND participant_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_training FROM public.building_trainings WHERE id = NEW.training_id;
  IF v_training.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- imie/nazwisko
  IF NEW.employee_id IS NOT NULL THEN
    SELECT first_name, last_name, email INTO v_emp
      FROM public.employee_development_plans WHERE id = NEW.employee_id;
    v_name  := NULLIF(TRIM(CONCAT_WS(' ', v_emp.first_name, v_emp.last_name)), '');
    v_email := v_emp.email;
  END IF;
  IF v_name IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT name, email INTO v_prof FROM public.profiles WHERE id = NEW.user_id;
    v_name  := v_prof.name;
    v_email := COALESCE(v_email, v_prof.email);
  END IF;
  v_name  := COALESCE(v_name, NEW.guest_name, v_email, NEW.guest_email, 'Uczestnik');

  SELECT name INTO v_building FROM public.buildings WHERE id = v_training.building_id;

  INSERT INTO public.training_certificates (
    training_id, participant_id, building_id, company_id,
    participant_name, training_title, training_type, training_date,
    valid_until, status, issued_by
  ) VALUES (
    v_training.id, NEW.id, v_training.building_id, v_training.company_id,
    v_name, v_training.title, v_training.type::text,
    COALESCE(v_training.completed_at::date, v_training.scheduled_at::date),
    CASE WHEN v_training.recurrence_months IS NOT NULL AND v_training.recurrence_months > 0
         THEN COALESCE(v_training.completed_at::date, v_training.scheduled_at::date)
              + (v_training.recurrence_months || ' months')::interval
         ELSE NULL END,
    'wystawiony', v_training.created_by
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_btp_auto_certificate ON public.building_training_participants;
CREATE TRIGGER trg_btp_auto_certificate
AFTER INSERT OR UPDATE OF attendance_status ON public.building_training_participants
FOR EACH ROW EXECUTE FUNCTION public.auto_create_training_certificate();

-- 4. updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_tc_updated_at ON public.training_certificates;
CREATE TRIGGER trg_tc_updated_at
BEFORE UPDATE ON public.training_certificates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. RLS
ALTER TABLE public.training_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tc_super_admin_all ON public.training_certificates
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY tc_company_admin_manage ON public.training_certificates
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.buildings b
             WHERE b.id = training_certificates.building_id
               AND public.is_company_admin(b.company_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.buildings b
             WHERE b.id = training_certificates.building_id
               AND public.is_company_admin(b.company_id))
  );

CREATE POLICY tc_company_read ON public.training_certificates
  FOR SELECT
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR EXISTS (SELECT 1 FROM public.buildings b
                WHERE b.id = training_certificates.building_id
                  AND b.company_id = public.get_user_company_id(auth.uid()))
  );