INSERT INTO storage.buckets (id, name, public)
VALUES ('building-documents', 'building-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "bd_public_read" ON storage.objects;
CREATE POLICY "bd_public_read" ON storage.objects
FOR SELECT USING (bucket_id = 'building-documents');

DROP POLICY IF EXISTS "bd_auth_insert" ON storage.objects;
CREATE POLICY "bd_auth_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'building-documents');

DROP POLICY IF EXISTS "bd_auth_update" ON storage.objects;
CREATE POLICY "bd_auth_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'building-documents');

DROP POLICY IF EXISTS "bd_auth_delete" ON storage.objects;
CREATE POLICY "bd_auth_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'building-documents');