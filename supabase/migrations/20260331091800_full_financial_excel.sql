-- ==============================================================================
-- FIRE ZONE GUARD V2.2 - FULL FINANCIAL EXCEL
-- ==============================================================================

-- 1. Usuwamy poprzednią tabelę kosztów (jeśli istniała) dla czystego startu z nową strukturą
DROP TABLE IF EXISTS public.task_cost_items;

-- 2. Tworzymy uniwersalną tabelę pozycji finansowych
CREATE TABLE IF NOT EXISTS public.task_financial_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('przychód', 'koszt')),
    description TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Włączenie RLS
ALTER TABLE public.task_financial_items ENABLE ROW LEVEL SECURITY;

-- Polityki RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'View financial items admins') THEN
        CREATE POLICY "View financial items admins" ON public.task_financial_items FOR SELECT 
        USING ((SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('super_admin', 'admin', 'coordinator'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Manage financial items admins') THEN
        CREATE POLICY "Manage financial items admins" ON public.task_financial_items FOR ALL 
        USING ((SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('super_admin', 'admin', 'coordinator'));
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
