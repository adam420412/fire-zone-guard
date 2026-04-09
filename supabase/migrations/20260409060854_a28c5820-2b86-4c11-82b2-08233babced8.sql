
-- Table for one-time link tokens
CREATE TABLE public.telegram_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own tokens"
  ON public.telegram_link_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read their own tokens"
  ON public.telegram_link_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Super admin all"
  ON public.telegram_link_tokens FOR ALL
  USING (is_super_admin());

-- Singleton table for bot polling offset
CREATE TABLE public.telegram_bot_state (
  id int PRIMARY KEY CHECK (id = 1),
  update_offset bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;

-- No public policies - only service_role can access
INSERT INTO public.telegram_bot_state (id, update_offset) VALUES (1, 0);

-- Index for fast token lookup
CREATE INDEX idx_telegram_link_tokens_token ON public.telegram_link_tokens (token);
CREATE INDEX idx_telegram_link_tokens_user ON public.telegram_link_tokens (user_id);
