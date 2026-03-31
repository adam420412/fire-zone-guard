-- ==============================================================================
-- FIRE ZONE GUARD V2.1 - FINANCIALS & DOCUMENTATION
-- ==============================================================================

-- 1. Moduł Finansowy: Dodanie kosztów do zadań
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS costs NUMERIC(10,2) DEFAULT 0;

-- 2. Moduł Dokumentacji: Tabela metadanych plików
CREATE TABLE IF NOT EXISTS public.building_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Włączenie RLS dla dokumentów
ALTER TABLE public.building_documents ENABLE ROW LEVEL SECURITY;

-- Polityki RLS dla dokumentów
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'View documents same company') THEN
        CREATE POLICY "View documents same company" ON public.building_documents FOR SELECT 
        USING (building_id IN (SELECT id FROM buildings WHERE company_id = (SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1)) OR (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) = 'super_admin');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Manage documents admins') THEN
        CREATE POLICY "Manage documents admins" ON public.building_documents FOR ALL 
        USING ((SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('super_admin', 'admin', 'coordinator'));
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Inicjalizacja Bucketów (Dla celów informacyjnych, buckety tworzy się w UI Supabase lub API)
-- Uwaga: W czystym SQL Supabase nie tworzy się bucketów bezpośrednio w public, 
-- ale można dodać polityki dla storage.objects.
INSERT INTO storage.buckets (id, name, public) 
SELECT 'building-documents', 'building-documents', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'building-documents');

-- Polityki Storage (Uproszczone dla modułu budynków)
CREATE POLICY "Docs Access" ON storage.objects FOR ALL USING (bucket_id = 'building-documents' AND auth.role() = 'authenticated');
