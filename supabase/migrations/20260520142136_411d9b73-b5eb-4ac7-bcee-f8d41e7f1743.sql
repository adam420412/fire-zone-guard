-- AI Agent action proposal audit log
CREATE TABLE public.ai_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID,
  action_type TEXT NOT NULL,
  action_label TEXT NOT NULL,
  action_description TEXT,
  confirmation_level TEXT NOT NULL DEFAULT 'soft',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  context JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by UUID,
  decision_note TEXT,
  executed_at TIMESTAMPTZ,
  execution_error TEXT,
  message_id TEXT,
  source_page TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_action_log_user ON public.ai_action_log(user_id, proposed_at DESC);
CREATE INDEX idx_ai_action_log_status ON public.ai_action_log(status, proposed_at DESC);
CREATE INDEX idx_ai_action_log_company ON public.ai_action_log(company_id, proposed_at DESC);

ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own AI action log"
ON public.ai_action_log FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins see company AI action log"
ON public.ai_action_log FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR (company_id IS NOT NULL AND public.is_company_admin(company_id))
);

CREATE POLICY "Users insert their own AI action log"
ON public.ai_action_log FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update their own AI action log"
ON public.ai_action_log FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins update company AI action log"
ON public.ai_action_log FOR UPDATE
TO authenticated
USING (
  public.is_super_admin()
  OR (company_id IS NOT NULL AND public.is_company_admin(company_id))
);

CREATE TRIGGER trg_ai_action_log_updated_at
BEFORE UPDATE ON public.ai_action_log
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
