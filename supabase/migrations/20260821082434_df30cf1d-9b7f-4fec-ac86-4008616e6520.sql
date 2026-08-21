DROP POLICY IF EXISTS "buildings_anon_read" ON public.buildings;

DO $$
BEGIN
  IF to_regclass('public.sla_tickets_with_details') IS NOT NULL THEN
    REVOKE ALL ON public.sla_tickets_with_details FROM anon;
  END IF;
  IF to_regclass('public.employees_with_details') IS NOT NULL THEN
    REVOKE ALL ON public.employees_with_details FROM anon;
  END IF;
END $$;

DROP FUNCTION IF EXISTS auth.user_role() CASCADE;
DROP FUNCTION IF EXISTS auth.user_company_id() CASCADE;

DO $$
DECLARE
  leftover_anon_policies TEXT;
  leftover_functions     TEXT;
  buildings_rls          BOOLEAN;
BEGIN
  SELECT string_agg(policyname, ', ')
    INTO leftover_anon_policies
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename  = 'buildings'
     AND 'anon' = ANY(roles);

  IF leftover_anon_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'HARDENING NIEUDANY: tabela buildings ma nadal polityki dla anon: %',
      leftover_anon_policies;
  END IF;

  SELECT relrowsecurity INTO buildings_rls
    FROM pg_class WHERE oid = 'public.buildings'::regclass;

  IF buildings_rls IS NOT TRUE THEN
    RAISE EXCEPTION 'HARDENING NIEUDANY: RLS wylaczone na public.buildings';
  END IF;

  SELECT string_agg(p.proname, ', ')
    INTO leftover_functions
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'auth'
     AND p.proname IN ('user_role', 'user_company_id');

  IF leftover_functions IS NOT NULL THEN
    RAISE EXCEPTION
      'HARDENING NIEUDANY: w schemacie auth nadal istnieja funkcje: %',
      leftover_functions;
  END IF;

  RAISE NOTICE 'Hardening OK';
END $$;