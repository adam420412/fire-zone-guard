-- Add fire_role column to employee_development_plans
-- Tracks fire safety roles: gaszenie (firefighting), ewakuacja (evacuation), pierwsza_pomoc (first aid)
ALTER TABLE public.employee_development_plans
  ADD COLUMN IF NOT EXISTS fire_role text;

-- Update the employees_with_details view to include fire_role
CREATE OR REPLACE VIEW public.employees_with_details AS
SELECT
  e.*,
  b.name AS building_name,
  COALESCE(NULLIF(TRIM(CONCAT(e.first_name, ' ', e.last_name)), ''), p.name, 'Pracownik') AS full_name
FROM employee_development_plans e
LEFT JOIN buildings b ON b.id = e.building_id
LEFT JOIN profiles p ON p.id = e.user_id;
