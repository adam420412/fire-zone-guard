-- Migration: Add Subtasks and Task Reminders

-- 1. Create subtasks table
CREATE TABLE IF NOT EXISTS public.subtasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status public.task_status DEFAULT 'Nowe'::public.task_status NOT NULL,
    assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    deadline DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS for subtasks
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;

-- Subtasks RLS Policy: Users can view/edit subtasks if they have access to the parent task's company
CREATE POLICY "Users can access subtasks of their company" ON public.subtasks
FOR ALL
USING (
  task_id IN (
    SELECT t.id FROM public.tasks t
    JOIN public.profiles p ON p.company_id = t.company_id
    WHERE p.user_id = auth.uid()
  )
  OR
  (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) = 'super_admin'
);

-- 2. Create task_reminders table
CREATE TABLE IF NOT EXISTS public.task_reminders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    subtask_id UUID REFERENCES public.subtasks(id) ON DELETE CASCADE,
    remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
    recipient_email TEXT NOT NULL,
    message TEXT,
    sent BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT task_or_subtask CHECK (task_id IS NOT NULL OR subtask_id IS NOT NULL)
);

-- Enable RLS for task_reminders
ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;

-- Task Reminders RLS Policy: Users can view/edit reminders if they have access to the related task/subtask
CREATE POLICY "Users can access task reminders of their company" ON public.task_reminders
FOR ALL
USING (
  (task_id IN (
    SELECT t.id FROM public.tasks t
    JOIN public.profiles p ON p.company_id = t.company_id
    WHERE p.user_id = auth.uid()
  ))
  OR
  (subtask_id IN (
    SELECT s.id FROM public.subtasks s
    JOIN public.tasks t ON t.id = s.task_id
    JOIN public.profiles p ON p.company_id = t.company_id
    WHERE p.user_id = auth.uid()
  ))
  OR
  (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) = 'super_admin'
);
