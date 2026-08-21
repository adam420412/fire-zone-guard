DROP POLICY IF EXISTS "self_read" ON public.user_roles;
CREATE POLICY "self_read" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "self_read" ON public.profiles;
CREATE POLICY "self_read" ON public.profiles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "self_update" ON public.profiles;
CREATE POLICY "self_update" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

DO $$
DECLARE anon_pol TEXT;
BEGIN
  SELECT string_agg(policyname, ', ') INTO anon_pol
    FROM pg_policies
   WHERE schemaname='public' AND tablename='buildings' AND 'anon' = ANY(roles);
  IF anon_pol IS NOT NULL THEN
    RAISE EXCEPTION 'UWAGA: wrocil anonimowy odczyt buildings: %', anon_pol;
  END IF;
END $$;