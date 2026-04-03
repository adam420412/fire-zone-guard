
-- Create manufacturers table
CREATE TABLE public.manufacturers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  nip TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  specialization TEXT,
  certificate_info TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.manufacturers ENABLE ROW LEVEL SECURITY;

-- Super admin full access
CREATE POLICY "super_admin_all" ON public.manufacturers FOR ALL USING (is_super_admin());

-- All authenticated users can read
CREATE POLICY "authenticated_read" ON public.manufacturers FOR SELECT TO authenticated USING (true);

-- Add manufacturer_id to devices table
ALTER TABLE public.devices ADD COLUMN manufacturer_id UUID REFERENCES public.manufacturers(id);
