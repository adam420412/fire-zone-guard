-- =============================================================================
-- pg_cron schedule for the notification dispatcher and deadline-check job.
--
-- We invoke our Edge Functions via the Supabase HTTP gateway using `pg_net`
-- (the Supabase-hosted async HTTP extension). This avoids the need for the
-- legacy `extensions.http` extension which is not enabled by default on
-- managed projects.
--
-- Two scheduled jobs are installed:
--   * fzg-dispatch-notifications  → every 5 minutes, drains notifications_outbox
--   * fzg-telegram-deadline-check → daily at 06:00 UTC (≈ 08:00 Europe/Warsaw)
--
-- The functions are invoked with the service_role key so that they bypass RLS
-- and can read the outbox + write status updates. The key is read from a
-- dedicated app setting (`app.settings.dispatcher_invoke_key`) which the
-- operator must SET before this migration goes live (see notes at the bottom).
-- =============================================================================

-- 1. Required extensions ----------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- 2. Helper: small SECURITY DEFINER fn that POSTs to an Edge Function -------
--    keeps the call site DRY and centralises the auth header construction.
CREATE OR REPLACE FUNCTION public.fzg_invoke_edge_function(fn_name TEXT)
RETURNS BIGINT  -- net.http_post returns the request id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  base_url TEXT := current_setting('app.settings.supabase_url',         true);
  api_key  TEXT := current_setting('app.settings.dispatcher_invoke_key', true);
  req_id   BIGINT;
BEGIN
  IF base_url IS NULL OR api_key IS NULL THEN
    RAISE WARNING 'fzg_invoke_edge_function: app.settings.supabase_url or app.settings.dispatcher_invoke_key not set; skipping %', fn_name;
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := base_url || '/functions/v1/' || fn_name,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || api_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO req_id;

  RETURN req_id;
END;
$$;

-- 3. Drop any pre-existing schedules with the same names so this migration
--    is idempotent across re-runs.
DO $$
DECLARE
  job RECORD;
BEGIN
  FOR job IN
    SELECT jobname
      FROM cron.job
     WHERE jobname IN ('fzg-dispatch-notifications', 'fzg-telegram-deadline-check')
  LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;
END;
$$;

-- 4. Schedule: dispatch-notifications every 5 minutes -----------------------
SELECT cron.schedule(
  'fzg-dispatch-notifications',
  '*/5 * * * *',
  $cron$ SELECT public.fzg_invoke_edge_function('dispatch-notifications'); $cron$
);

-- 5. Schedule: telegram-deadline-check daily at 06:00 UTC -------------------
--    (Europe/Warsaw is UTC+1 in winter / UTC+2 in summer, so 06:00 UTC fires
--    around 07:00–08:00 local time which is when site teams start the day.)
SELECT cron.schedule(
  'fzg-telegram-deadline-check',
  '0 6 * * *',
  $cron$ SELECT public.fzg_invoke_edge_function('telegram-deadline-check'); $cron$
);

-- 6. Reload PostgREST schema cache (so the helper RPC is callable from the
--    client during dev/debug, even though it's not normally used that way).
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- POST-DEPLOY OPERATOR NOTES
-- -----------------------------------------------------------------------------
-- After applying this migration, the project owner must run ONCE in the SQL
-- editor (replacing the placeholders with the real values from
-- Project Settings → API):
--
--   ALTER DATABASE postgres SET app.settings.supabase_url
--     = 'https://jlbcfovlqdqxawshfgld.supabase.co';
--   ALTER DATABASE postgres SET app.settings.dispatcher_invoke_key
--     = '<service_role JWT>';
--
-- Then reconnect (the settings are read at session start). Verify with:
--
--   SELECT current_setting('app.settings.supabase_url'),
--          left(current_setting('app.settings.dispatcher_invoke_key'), 12);
--
-- And inspect scheduled jobs / their run history with:
--
--   SELECT jobid, schedule, jobname FROM cron.job WHERE jobname LIKE 'fzg-%';
--   SELECT * FROM cron.job_run_details
--     WHERE jobname LIKE 'fzg-%' ORDER BY start_time DESC LIMIT 20;
-- =============================================================================
