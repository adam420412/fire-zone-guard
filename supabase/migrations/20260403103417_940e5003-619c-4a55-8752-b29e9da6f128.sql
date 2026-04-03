-- Add floor plan URL to buildings
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS floor_plan_url text;

-- Add device position on floor plan
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS floor_plan_x numeric;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS floor_plan_y numeric;

-- Create storage bucket for floor plans
INSERT INTO storage.buckets (id, name, public) VALUES ('floor-plans', 'floor-plans', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload
CREATE POLICY "authenticated_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'floor-plans');
CREATE POLICY "public_read" ON storage.objects FOR SELECT USING (bucket_id = 'floor-plans');
CREATE POLICY "authenticated_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'floor-plans');