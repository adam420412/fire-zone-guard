-- ==============================================================================
-- FIRE ZONE GUARD V2.1 - MINI EXCEL COSTS
-- ==============================================================================

-- 1. Nowa tabela dla szczegółowych pozycji kosztowych
CREATE TABLE IF NOT EXISTS public.task_cost_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Włączenie RLS
ALTER TABLE public.task_cost_items ENABLE ROW LEVEL SECURITY;

-- Polityki RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'View costs admins') THEN
        CREATE POLICY "View costs admins" ON public.task_cost_items FOR SELECT 
        USING ((SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('super_admin', 'admin', 'coordinator'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Manage costs admins') THEN
        CREATE POLICY "Manage costs admins" ON public.task_cost_items FOR ALL 
        USING ((SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('super_admin', 'admin', 'coordinator'));
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
