
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS inventory_number text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS photo_url text;

CREATE INDEX IF NOT EXISTS idx_devices_inventory_number ON public.devices(inventory_number);
CREATE INDEX IF NOT EXISTS idx_devices_assigned_to ON public.devices(assigned_to);

-- Storage bucket for device photos (public read, authenticated write)
INSERT INTO storage.buckets (id, name, public)
VALUES ('device-photos', 'device-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "device_photos_public_read" ON storage.objects;
CREATE POLICY "device_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'device-photos');

DROP POLICY IF EXISTS "device_photos_auth_insert" ON storage.objects;
CREATE POLICY "device_photos_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'device-photos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "device_photos_auth_update" ON storage.objects;
CREATE POLICY "device_photos_auth_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'device-photos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "device_photos_auth_delete" ON storage.objects;
CREATE POLICY "device_photos_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'device-photos' AND auth.role() = 'authenticated');
