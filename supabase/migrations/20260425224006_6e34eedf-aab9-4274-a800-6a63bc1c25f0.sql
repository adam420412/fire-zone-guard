ALTER TABLE public.building_trainings
  ADD COLUMN IF NOT EXISTS trainer_signature_url TEXT,
  ADD COLUMN IF NOT EXISTS trainer_signed_at TIMESTAMPTZ;