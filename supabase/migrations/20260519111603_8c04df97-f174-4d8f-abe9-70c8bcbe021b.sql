CREATE OR REPLACE FUNCTION public.recalc_device_next_service()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interval INT;
BEGIN
  -- only when last_service_date is set and actually changed
  IF NEW.last_service_date IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.last_service_date IS DISTINCT FROM OLD.last_service_date)
  THEN
    SELECT service_interval_days INTO v_interval
      FROM public.device_types
      WHERE id = NEW.device_type_id;

    IF v_interval IS NOT NULL AND v_interval > 0 THEN
      NEW.next_service_date := NEW.last_service_date + (v_interval || ' days')::INTERVAL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_device_next_service ON public.devices;
CREATE TRIGGER trg_recalc_device_next_service
BEFORE INSERT OR UPDATE OF last_service_date, device_type_id ON public.devices
FOR EACH ROW EXECUTE FUNCTION public.recalc_device_next_service();