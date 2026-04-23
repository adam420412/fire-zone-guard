-- Replace broad SELECT policies on storage.objects that allow listing entire buckets.
-- Files remain reachable via direct public URL (buckets stay public), but
-- clients can no longer enumerate bucket contents via storage.objects SELECT.

DROP POLICY IF EXISTS public_read ON storage.objects;
DROP POLICY IF EXISTS sla_photos_public_read ON storage.objects;

-- No replacement SELECT policy is needed: public URL access goes through the
-- storage HTTP layer, which checks bucket.public, not RLS on storage.objects.
-- Removing these policies satisfies the linter (no broad listing) without
-- breaking <img src="…/object/public/…"> reads.