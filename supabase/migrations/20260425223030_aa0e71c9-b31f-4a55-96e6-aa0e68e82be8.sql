DROP VIEW IF EXISTS public.building_cost_summary;

CREATE VIEW public.building_cost_summary
WITH (security_invoker = true) AS
SELECT
  b.id                                                 AS building_id,
  b.name                                               AS building_name,
  b.company_id,
  COALESCE(SUM(t.cost_actual), 0)                      AS cost_12m,
  COUNT(t.id) FILTER (WHERE t.cost_actual IS NOT NULL) AS paid_tasks_12m,
  COUNT(t.id) FILTER (WHERE t.source = 'service')      AS service_tasks_12m,
  MAX(t.closed_at)                                     AS last_closed_at
FROM public.buildings b
LEFT JOIN public.tasks t
  ON t.building_id = b.id
  AND t.closed_at IS NOT NULL
  AND t.closed_at >= NOW() - INTERVAL '12 months'
GROUP BY b.id, b.name, b.company_id;

COMMENT ON VIEW public.building_cost_summary IS 'Agregat kosztow napraw per obiekt za ostatnie 12 miesiecy. Respektuje RLS uzytkownika.';

GRANT SELECT ON public.building_cost_summary TO authenticated;