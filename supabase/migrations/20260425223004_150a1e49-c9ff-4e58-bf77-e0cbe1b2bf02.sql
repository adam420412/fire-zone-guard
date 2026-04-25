-- ---- 1. Buildings: geocoding cache + map color ------------------------------
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS lat NUMERIC;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS lng NUMERIC;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS map_color TEXT;

COMMENT ON COLUMN public.buildings.lat IS 'Cache geocodingu Nominatim. NULL = nie geocodowane.';
COMMENT ON COLUMN public.buildings.lng IS 'Cache geocodingu Nominatim.';
COMMENT ON COLUMN public.buildings.geocoded_at IS 'Kiedy ostatnio zaktualizowano lat/lng.';
COMMENT ON COLUMN public.buildings.map_color IS 'Override koloru pinu na mapie (HEX).';

CREATE INDEX IF NOT EXISTS idx_buildings_geocoded ON public.buildings (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- ---- 2. service_protocols: e-signatures -------------------------------------
ALTER TABLE public.service_protocols ADD COLUMN IF NOT EXISTS inspector_signature_url TEXT;
ALTER TABLE public.service_protocols ADD COLUMN IF NOT EXISTS client_signature_url    TEXT;
ALTER TABLE public.service_protocols ADD COLUMN IF NOT EXISTS inspector_signed_at     TIMESTAMPTZ;
ALTER TABLE public.service_protocols ADD COLUMN IF NOT EXISTS client_signed_at        TIMESTAMPTZ;
ALTER TABLE public.service_protocols ADD COLUMN IF NOT EXISTS client_signer_name      TEXT;

COMMENT ON COLUMN public.service_protocols.inspector_signature_url IS 'PNG podpisu kontrolera w storage `protocol-signatures`.';
COMMENT ON COLUMN public.service_protocols.client_signature_url    IS 'PNG podpisu klienta w storage `protocol-signatures`.';
COMMENT ON COLUMN public.service_protocols.client_signer_name      IS 'Imie i nazwisko osoby ze strony klienta ktora podpisala protokol.';

-- ---- Storage bucket for signatures (idempotent) ----------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('protocol-signatures', 'protocol-signatures', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "protocol_sig_read"   ON storage.objects;
DROP POLICY IF EXISTS "protocol_sig_insert" ON storage.objects;
DROP POLICY IF EXISTS "protocol_sig_update" ON storage.objects;

CREATE POLICY "protocol_sig_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'protocol-signatures');

CREATE POLICY "protocol_sig_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'protocol-signatures' AND auth.role() IN ('authenticated', 'anon'));

CREATE POLICY "protocol_sig_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'protocol-signatures' AND auth.uid() IS NOT NULL);

-- ---- 3. tasks: cost_actual ---------------------------------------------------
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS cost_actual    NUMERIC;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS cost_currency  TEXT DEFAULT 'PLN';

COMMENT ON COLUMN public.tasks.cost_actual   IS 'Rzeczywisty koszt naprawy/zadania (po wykonaniu). Uzywane w analytics MTBF/koszty.';
COMMENT ON COLUMN public.tasks.cost_currency IS 'Waluta — PLN, EUR, USD.';

CREATE INDEX IF NOT EXISTS idx_tasks_cost ON public.tasks (cost_actual)
  WHERE cost_actual IS NOT NULL;

-- ---- 4. View: building_cost_summary -----------------------------------------
CREATE OR REPLACE VIEW public.building_cost_summary AS
SELECT
  b.id                                  AS building_id,
  b.name                                AS building_name,
  b.company_id,
  COALESCE(SUM(t.cost_actual), 0)       AS cost_12m,
  COUNT(t.id) FILTER (WHERE t.cost_actual IS NOT NULL) AS paid_tasks_12m,
  COUNT(t.id) FILTER (WHERE t.source = 'service')      AS service_tasks_12m,
  MAX(t.closed_at)                      AS last_closed_at
FROM public.buildings b
LEFT JOIN public.tasks t
  ON t.building_id = b.id
  AND t.closed_at IS NOT NULL
  AND t.closed_at >= NOW() - INTERVAL '12 months'
GROUP BY b.id, b.name, b.company_id;

COMMENT ON VIEW public.building_cost_summary IS 'Agregat kosztow napraw per obiekt za ostatnie 12 miesiecy.';

GRANT SELECT ON public.building_cost_summary TO authenticated;