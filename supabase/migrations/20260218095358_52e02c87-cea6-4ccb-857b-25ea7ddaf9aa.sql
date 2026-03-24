-- Enable realtime for tasks table
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- Allow admins to update profiles (assign company)
CREATE POLICY "admin_update_company_profiles"
ON public.profiles
FOR UPDATE
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Allow super_admin to manage user_roles
CREATE POLICY "super_admin_manage_roles"
ON public.user_roles
FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Allow super_admin to insert user_roles (for role changes)
-- Note: super_admin_all already covers ALL, but let's ensure insert works
-- Actually super_admin_all already exists, so we skip duplicate

-- Allow authenticated users to read all profiles for the assignee picker (super_admin)
CREATE POLICY "super_admin_read_all_profiles"
ON public.profiles
FOR SELECT
USING (is_super_admin());