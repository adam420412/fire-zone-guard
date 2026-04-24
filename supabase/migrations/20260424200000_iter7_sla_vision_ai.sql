-- =============================================================================
-- Iter 7 — SLA AI Vision: dodatkowe kolumny dla wyniku analizy zdjęć
--
-- Po stworzeniu zgłoszenia /zgloszenie wywołujemy edge function
-- analyze-sla-photo (gpt-4o vision), która:
--   1. czyta photo_urls,
--   2. zwraca podsumowanie tekstowe + sugestię priorytetu,
--   3. zapisuje wynik z powrotem do sla_tickets.
--
-- Już istnieją:
--   ai_summary       TEXT
--   ai_category      JSONB
--   ai_draft_email   TEXT
--
-- Brakuje:
--   ai_severity_suggestion  TEXT  -- low | normal | high | critical
--   ai_analysis_at          TIMESTAMPTZ — kiedy AI ostatnio przeanalizowało
--   ai_analysis_error       TEXT  -- ostatni błąd (do debugu w panelu operatora)
-- =============================================================================

ALTER TABLE public.sla_tickets
  ADD COLUMN IF NOT EXISTS ai_severity_suggestion TEXT
    CHECK (ai_severity_suggestion IN ('low', 'normal', 'high', 'critical'));

ALTER TABLE public.sla_tickets
  ADD COLUMN IF NOT EXISTS ai_analysis_at TIMESTAMPTZ;

ALTER TABLE public.sla_tickets
  ADD COLUMN IF NOT EXISTS ai_analysis_error TEXT;

-- Indeks pomocniczy: po jakiej dacie AI ostatnio przeanalizowało, żeby
-- móc szybko wyłapać "nigdy nie analizowane" w panelu operatora.
CREATE INDEX IF NOT EXISTS idx_sla_tickets_ai_analysis_at
  ON public.sla_tickets (ai_analysis_at) WHERE ai_analysis_at IS NULL;

-- Nadanie uprawnień nowym kolumnom dla anonimowego INSERT z formularza
-- /zgloszenie — public role nie powinien móc nadpisywać AI fields.
-- (Edge function używa service-role więc nie podlega RLS, więc nic
--  dodatkowego nie trzeba — UPDATE policies istniejące pozwalają
--  tylko adminom/super_adminom edytować).

-- Komentarz dla samodokumentacji
COMMENT ON COLUMN public.sla_tickets.ai_severity_suggestion IS
  'Iter 7: priorytet sugerowany przez gpt-4o vision na podstawie zdjęć';
COMMENT ON COLUMN public.sla_tickets.ai_analysis_at IS
  'Iter 7: timestamp ostatniego wywołania analyze-sla-photo';
COMMENT ON COLUMN public.sla_tickets.ai_analysis_error IS
  'Iter 7: ostatni błąd analizy (np. brak photos, OPENAI_API_KEY missing)';
