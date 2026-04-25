-- Audit log table for training changes
CREATE TABLE public.training_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id uuid NOT NULL,
  participant_id uuid,
  action text NOT NULL, -- 'created' | 'updated' | 'deleted'
  field_name text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tal_training ON public.training_audit_log(training_id, created_at DESC);
CREATE INDEX idx_tal_participant ON public.training_audit_log(participant_id, created_at DESC);

ALTER TABLE public.training_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tal_company_read ON public.training_audit_log
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.building_trainings bt
    JOIN public.buildings b ON b.id = bt.building_id
    WHERE bt.id = training_audit_log.training_id
      AND b.company_id = public.get_user_company_id(auth.uid())
  )
);

CREATE POLICY tal_super_admin_all ON public.training_audit_log
FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY tal_system_insert ON public.training_audit_log
FOR INSERT WITH CHECK (true);

-- Helper: get current user display name
CREATE OR REPLACE FUNCTION public.current_user_display_name()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(name, email) FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- Trigger function: building_trainings
CREATE OR REPLACE FUNCTION public.log_building_training_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  uname text := public.current_user_display_name();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.training_audit_log(training_id, action, changed_by, changed_by_name)
    VALUES (NEW.id, 'created', uid, uname);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.training_audit_log(training_id, action, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (NEW.id, 'updated', 'status', OLD.status::text, NEW.status::text, uid, uname);
    END IF;
    IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
      INSERT INTO public.training_audit_log(training_id, action, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (NEW.id, 'updated', 'scheduled_at', OLD.scheduled_at::text, NEW.scheduled_at::text, uid, uname);
    END IF;
    IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      INSERT INTO public.training_audit_log(training_id, action, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (NEW.id, 'updated', 'completed_at', OLD.completed_at::text, NEW.completed_at::text, uid, uname);
    END IF;
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      INSERT INTO public.training_audit_log(training_id, action, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (NEW.id, 'updated', 'title', OLD.title, NEW.title, uid, uname);
    END IF;
    IF NEW.trainer_name IS DISTINCT FROM OLD.trainer_name THEN
      INSERT INTO public.training_audit_log(training_id, action, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (NEW.id, 'updated', 'trainer_name', OLD.trainer_name, NEW.trainer_name, uid, uname);
    END IF;
    IF NEW.type IS DISTINCT FROM OLD.type THEN
      INSERT INTO public.training_audit_log(training_id, action, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (NEW.id, 'updated', 'type', OLD.type::text, NEW.type::text, uid, uname);
    END IF;
    IF NEW.trainer_signed_at IS DISTINCT FROM OLD.trainer_signed_at THEN
      INSERT INTO public.training_audit_log(training_id, action, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (NEW.id, 'updated', 'trainer_signed_at', OLD.trainer_signed_at::text, NEW.trainer_signed_at::text, uid, uname);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.training_audit_log(training_id, action, changed_by, changed_by_name)
    VALUES (OLD.id, 'deleted', uid, uname);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_log_building_trainings
AFTER INSERT OR UPDATE OR DELETE ON public.building_trainings
FOR EACH ROW EXECUTE FUNCTION public.log_building_training_changes();

-- Trigger function: building_training_participants
CREATE OR REPLACE FUNCTION public.log_training_participant_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  uname text := public.current_user_display_name();
  tid uuid := COALESCE(NEW.training_id, OLD.training_id);
  pid uuid := COALESCE(NEW.id, OLD.id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.training_audit_log(training_id, participant_id, action, field_name, new_value, changed_by, changed_by_name)
    VALUES (tid, pid, 'created', 'participant', COALESCE(NEW.guest_name, NEW.employee_id::text, NEW.user_id::text), uid, uname);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.attendance_status IS DISTINCT FROM OLD.attendance_status THEN
      INSERT INTO public.training_audit_log(training_id, participant_id, action, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (tid, pid, 'updated', 'attendance_status', OLD.attendance_status::text, NEW.attendance_status::text, uid, uname);
    END IF;
    IF NEW.passed IS DISTINCT FROM OLD.passed THEN
      INSERT INTO public.training_audit_log(training_id, participant_id, action, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (tid, pid, 'updated', 'passed', OLD.passed::text, NEW.passed::text, uid, uname);
    END IF;
    IF NEW.score IS DISTINCT FROM OLD.score THEN
      INSERT INTO public.training_audit_log(training_id, participant_id, action, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (tid, pid, 'updated', 'score', OLD.score::text, NEW.score::text, uid, uname);
    END IF;
    IF NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
      INSERT INTO public.training_audit_log(training_id, participant_id, action, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (tid, pid, 'updated', 'signed_at', OLD.signed_at::text, NEW.signed_at::text, uid, uname);
    END IF;
    IF NEW.certificate_url IS DISTINCT FROM OLD.certificate_url THEN
      INSERT INTO public.training_audit_log(training_id, participant_id, action, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (tid, pid, 'updated', 'certificate_url', OLD.certificate_url, NEW.certificate_url, uid, uname);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.training_audit_log(training_id, participant_id, action, field_name, old_value, changed_by, changed_by_name)
    VALUES (tid, pid, 'deleted', 'participant', COALESCE(OLD.guest_name, OLD.employee_id::text, OLD.user_id::text), uid, uname);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_log_training_participants
AFTER INSERT OR UPDATE OR DELETE ON public.building_training_participants
FOR EACH ROW EXECUTE FUNCTION public.log_training_participant_changes();