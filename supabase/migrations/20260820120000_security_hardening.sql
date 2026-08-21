-- =====================================================================
-- HARDENING BEZPIECZENSTWA
--
-- 1. Zamkniecie publicznego (anon) odczytu tabeli buildings.
-- 2. Cofniecie ewentualnych grantow anon na widokach z danymi wrazliwymi.
-- 3. Usuniecie wadliwych funkcji auth.user_role() / auth.user_company_id()
--    z recznego skryptu database_update_v4_rls.sql wraz z politykami,
--    ktore z nich korzystaja (CASCADE).
-- 4. Weryfikacja koncowa - migracja RZUCA WYJATEK, jesli ktorakolwiek
--    dziura zostala otwarta. Brak wyjatku = wdrozenie sie powiodlo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. buildings: publiczny odczyt bez logowania
--
-- Polityka pochodzi z 20260423225723. Dawala anonimowi SELECT na
-- wszystkich obiektach: nazwy, pelne adresy i wspolrzedne budynkow
-- objetych ochrona ppoz. Publiczny formularz /zgloszenie obsluguje juz
-- brak tej listy - pokazuje wtedy pole tekstowe (patrz
-- src/pages/PublicSlaIntakePage.tsx).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "buildings_anon_read" ON public.buildings;

-- ---------------------------------------------------------------------
-- 2. Widoki: cofniecie grantow dla anon (defensywnie, idempotentnie).
--    Migracja 20260423232515 odtworzyla je z security_invoker = true,
--    ale starsze srodowiska moga miec jeszcze wersje SECURITY DEFINER
--    z GRANT ... TO anon.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sla_tickets_with_details') IS NOT NULL THEN
    REVOKE ALL ON public.sla_tickets_with_details FROM anon;
  END IF;
  IF to_regclass('public.employees_with_details') IS NOT NULL THEN
    REVOKE ALL ON public.employees_with_details FROM anon;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Wadliwe funkcje pomocnicze z database_update_v4_rls.sql
--
--    auth.user_company_id(): SELECT company_id FROM profiles WHERE id = auth.uid()
--       -> zla kolumna, profiles.id to wlasny UUID, nie auth uid.
--    auth.user_role():       SELECT role FROM profiles WHERE id = auth.uid()
--       -> tabela profiles NIE MA kolumny "role"; rola siedzi w user_roles.
--          Kazda ewaluacja polityki konczy sie bledem
--          "column role does not exist".
--
--    CASCADE usuwa rowniez polityki oparte na tych funkcjach. Wlasciwe
--    polityki (super_admin_all / admin_company / employee_* / client_*)
--    pochodza z migracji 20260218090315 i pozostaja nietkniete.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS auth.user_role() CASCADE;
DROP FUNCTION IF EXISTS auth.user_company_id() CASCADE;

-- ---------------------------------------------------------------------
-- 4. WERYFIKACJA. Jesli cokolwiek ponizej nie gra - migracja pada.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  leftover_anon_policies TEXT;
  leftover_functions     TEXT;
  buildings_rls          BOOLEAN;
BEGIN
  -- 4a. Zadnej polityki dla roli anon na buildings
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

  -- 4b. RLS na buildings musi byc wlaczone (bez tego polityki nie dzialaja)
  SELECT relrowsecurity INTO buildings_rls
    FROM pg_class WHERE oid = 'public.buildings'::regclass;

  IF buildings_rls IS NOT TRUE THEN
    RAISE EXCEPTION 'HARDENING NIEUDANY: RLS wylaczone na public.buildings';
  END IF;

  -- 4c. Wadliwe funkcje musza zniknac
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

  RAISE NOTICE 'Hardening OK: brak polityk anon na buildings, brak funkcji auth.user_role/user_company_id.';
END $$;
