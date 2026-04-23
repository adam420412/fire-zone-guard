CREATE OR REPLACE FUNCTION public.log_sla_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.sla_ticket_events (ticket_id, actor_id, event_type, payload)
        VALUES (NEW.id, NEW.assigned_to, 'created',
                jsonb_build_object('status', NEW.status, 'priority', NEW.priority, 'type', NEW.type));
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.sla_ticket_events (ticket_id, actor_id, event_type, payload)
        VALUES (NEW.id, NEW.assigned_to, 'status_change',
                jsonb_build_object('from', OLD.status, 'to', NEW.status));
        IF NEW.status IN ('telefon','wyjazd','na_miejscu','diagnoza','naprawiono','zamkniete','niezasadne')
           AND NEW.first_response_at IS NULL THEN
            NEW.first_response_at := NOW();
        END IF;
        IF NEW.status = 'na_miejscu' AND NEW.on_site_at IS NULL THEN
            NEW.on_site_at := NOW();
        END IF;
        IF NEW.status IN ('naprawiono','niezasadne') AND NEW.resolved_at IS NULL THEN
            NEW.resolved_at := NOW();
        END IF;
        IF NEW.status = 'zamkniete' AND NEW.closed_at IS NULL THEN
            NEW.closed_at := NOW();
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'buildings'
          AND policyname = 'buildings_anon_read'
    ) THEN
        CREATE POLICY "buildings_anon_read" ON public.buildings
            FOR SELECT TO anon USING (true);
    END IF;
END $$;