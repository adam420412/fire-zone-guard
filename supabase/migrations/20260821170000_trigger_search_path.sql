-- =====================================================================
-- Utwardzenie funkcji triggerowych z migracji 20260520100000.
--
-- Cztery funkcje automatyzacji sa SECURITY DEFINER (dzialaja z
-- uprawnieniami wlasciciela), ale nie maja ustalonego search_path.
-- Bez tego wywolanie niekwalifikowanej nazwy w ich ciele mozna przechwycic
-- podstawiajac obiekt w schemacie, ktory stoi wczesniej w sciezce.
-- Pozostale funkcje w projekcie (has_role, is_super_admin, is_company_admin)
-- maja to ustawione od poczatku - te cztery zostaly pominiete.
--
-- Uzywamy ALTER FUNCTION zamiast przepisywania cial - zero ryzyka
-- zmiany zachowania automatyzacji.
-- =====================================================================

DO $$
DECLARE
  fn   TEXT;
  fixed INT := 0;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'fzg_on_task_insert',
    'fzg_on_task_update',
    'fzg_on_sla_ticket_insert',
    'fzg_on_audit_insert'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
    ) THEN
      EXECUTE format('ALTER FUNCTION public.%I() SET search_path = public', fn);
      fixed := fixed + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'search_path ustawiony dla % funkcji', fixed;
END $$;

-- ---------------------------------------------------------------------
-- WERYFIKACJA - migracja pada, jesli ktoras funkcja nadal jest
-- SECURITY DEFINER bez search_path.
-- ---------------------------------------------------------------------
DO $$
DECLARE bez_sciezki TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO bez_sciezki
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('fzg_on_task_insert','fzg_on_task_update',
                       'fzg_on_sla_ticket_insert','fzg_on_audit_insert')
     AND p.prosecdef                                  -- SECURITY DEFINER
     AND (p.proconfig IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
          ));

  IF bez_sciezki IS NOT NULL THEN
    RAISE EXCEPTION 'Nadal bez search_path: %', bez_sciezki;
  END IF;

  RAISE NOTICE 'OK: wszystkie funkcje automatyzacji maja ustalony search_path.';
END $$;
