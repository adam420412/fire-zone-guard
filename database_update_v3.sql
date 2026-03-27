-- ==============================================================================
-- Fire Zone Guard V2 - Aktualizacja 3 (Moduł Analityki i Kosztów)
-- Uruchom ten skrypt w Supabase SQL Editor by wdrożyć panel analityczny.
-- ==============================================================================

-- 1. Dodaj pole "repair_price" do tabeli zadań (kosztorysowanie)
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS repair_price NUMERIC(10,2) DEFAULT 0;

-- Upewnij się, że RLS przepuszcza te nowe dane 
-- (Zwykle admini i super_admini mają pełny dostęp, jeśli masz taką politykę)
