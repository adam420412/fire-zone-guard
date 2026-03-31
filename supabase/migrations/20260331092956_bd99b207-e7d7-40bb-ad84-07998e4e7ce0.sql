
DROP TABLE IF EXISTS public.task_financial_items;

CREATE TABLE public.task_financial_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    description TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.task_financial_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all management for signed in users" 
ON public.task_financial_items 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);
