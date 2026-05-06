-- ============================================================
-- K2: Task attachments + communications
-- ============================================================

-- 1) TASK ATTACHMENTS ----------------------------------------
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,             -- path within bucket: <task_id>/<uuid>-<filename>
  file_type TEXT,                       -- MIME
  file_size INTEGER,
  kind TEXT NOT NULL DEFAULT 'other',  -- 'photo' | 'document' | 'protocol' | 'other'
  uploaded_by UUID,                     -- profiles.id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON public.task_attachments(task_id);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

-- read: same-company users
CREATE POLICY "ta_company_read" ON public.task_attachments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_attachments.task_id
      AND (t.company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin())
  )
);

-- insert: same-company users (any role) for tasks of their company
CREATE POLICY "ta_company_insert" ON public.task_attachments
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_attachments.task_id
      AND (t.company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin())
  )
);

-- delete/update: company admin or uploader self
CREATE POLICY "ta_company_admin_manage" ON public.task_attachments
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_attachments.task_id
      AND (public.is_company_admin(t.company_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_attachments.task_id
      AND (public.is_company_admin(t.company_id))
  )
);

CREATE POLICY "ta_super_admin_all" ON public.task_attachments
FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 2) TASK COMMUNICATIONS -------------------------------------
CREATE TABLE IF NOT EXISTS public.task_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  channel TEXT NOT NULL,                -- 'telegram' | 'internal_note'
  direction TEXT NOT NULL DEFAULT 'internal', -- 'in' | 'out' | 'internal'
  subject TEXT,
  body TEXT NOT NULL,
  recipient TEXT,                       -- chat_id / user label / "team"
  author_id UUID,                       -- profiles.id
  external_ref TEXT,                    -- e.g. notifications_outbox.id, telegram message_id
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comm_task_id ON public.task_communications(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comm_channel ON public.task_communications(channel);

ALTER TABLE public.task_communications ENABLE ROW LEVEL SECURITY;

-- read: same-company employees/admins/super_admin (NOT clients)
CREATE POLICY "tc_company_read" ON public.task_communications
FOR SELECT USING (
  public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_communications.task_id
      AND t.company_id = public.get_user_company_id(auth.uid())
      AND NOT public.has_role(auth.uid(), 'client'::app_role)
  )
);

CREATE POLICY "tc_company_insert" ON public.task_communications
FOR INSERT WITH CHECK (
  public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_communications.task_id
      AND t.company_id = public.get_user_company_id(auth.uid())
      AND NOT public.has_role(auth.uid(), 'client'::app_role)
  )
);

CREATE POLICY "tc_company_admin_update" ON public.task_communications
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_communications.task_id AND public.is_company_admin(t.company_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_communications.task_id AND public.is_company_admin(t.company_id)
  )
);

CREATE POLICY "tc_company_admin_delete" ON public.task_communications
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_communications.task_id AND public.is_company_admin(t.company_id)
  )
);

CREATE POLICY "tc_super_admin_all" ON public.task_communications
FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 3) STORAGE BUCKET (private) --------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — files are stored under "<task_id>/..." path
-- read
CREATE POLICY "ta_storage_company_read" ON storage.objects
FOR SELECT USING (
  bucket_id = 'task-attachments' AND (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.company_id = public.get_user_company_id(auth.uid())
    )
  )
);

-- insert
CREATE POLICY "ta_storage_company_insert" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'task-attachments' AND (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.company_id = public.get_user_company_id(auth.uid())
    )
  )
);

-- update
CREATE POLICY "ta_storage_company_update" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'task-attachments' AND (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND public.is_company_admin(t.company_id)
    )
  )
);

-- delete (company admin or super admin)
CREATE POLICY "ta_storage_company_delete" ON storage.objects
FOR DELETE USING (
  bucket_id = 'task-attachments' AND (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND public.is_company_admin(t.company_id)
    )
  )
);
