-- Device change history
CREATE TABLE public.device_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID,
  changed_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_history_device ON public.device_history(device_id, created_at DESC);

ALTER TABLE public.device_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dh_company_read" ON public.device_history
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.devices d
    JOIN public.buildings b ON b.id = d.building_id
    WHERE d.id = device_history.device_id
      AND b.company_id = public.get_user_company_id(auth.uid())
  )
);

CREATE POLICY "dh_admin_manage" ON public.device_history
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.devices d
    JOIN public.buildings b ON b.id = d.building_id
    WHERE d.id = device_history.device_id
      AND public.is_company_admin(b.company_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.devices d
    JOIN public.buildings b ON b.id = d.building_id
    WHERE d.id = device_history.device_id
      AND public.is_company_admin(b.company_id)
  )
);

CREATE POLICY "dh_super_admin_all" ON public.device_history
FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Trigger function logging selected field changes
CREATE OR REPLACE FUNCTION public.log_device_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  uname TEXT := public.current_user_display_name();
  v_assignee_old TEXT;
  v_assignee_new TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.device_history(device_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'created', NULL, NEW.name, uid, uname);
    RETURN NEW;
  END IF;

  IF NEW.next_service_date IS DISTINCT FROM OLD.next_service_date THEN
    INSERT INTO public.device_history(device_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'next_service_date', OLD.next_service_date::TEXT, NEW.next_service_date::TEXT, uid, uname);
  END IF;

  IF NEW.last_service_date IS DISTINCT FROM OLD.last_service_date THEN
    INSERT INTO public.device_history(device_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'last_service_date', OLD.last_service_date::TEXT, NEW.last_service_date::TEXT, uid, uname);
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    SELECT COALESCE(name, email) INTO v_assignee_old FROM public.profiles WHERE id = OLD.assigned_to;
    SELECT COALESCE(name, email) INTO v_assignee_new FROM public.profiles WHERE id = NEW.assigned_to;
    INSERT INTO public.device_history(device_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'assigned_to', v_assignee_old, v_assignee_new, uid, uname);
  END IF;

  IF NEW.inventory_number IS DISTINCT FROM OLD.inventory_number THEN
    INSERT INTO public.device_history(device_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'inventory_number', OLD.inventory_number, NEW.inventory_number, uid, uname);
  END IF;

  IF NEW.serial_number IS DISTINCT FROM OLD.serial_number THEN
    INSERT INTO public.device_history(device_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'serial_number', OLD.serial_number, NEW.serial_number, uid, uname);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.device_history(device_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, uid, uname);
  END IF;

  IF NEW.photo_url IS DISTINCT FROM OLD.photo_url THEN
    INSERT INTO public.device_history(device_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'photo_url', OLD.photo_url, NEW.photo_url, uid, uname);
  END IF;

  IF NEW.location_in_building IS DISTINCT FROM OLD.location_in_building THEN
    INSERT INTO public.device_history(device_id, field_name, old_value, new_value, changed_by, changed_by_name)
    VALUES (NEW.id, 'location_in_building', OLD.location_in_building, NEW.location_in_building, uid, uname);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_device_changes
AFTER INSERT OR UPDATE ON public.devices
FOR EACH ROW EXECUTE FUNCTION public.log_device_changes();