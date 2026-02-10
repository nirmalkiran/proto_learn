-- Add project_id column to menu_config table for project-specific menu configuration
ALTER TABLE public.menu_config 
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- Create an index for faster lookups by project_id
CREATE INDEX IF NOT EXISTS idx_menu_config_project_id ON public.menu_config(project_id);

-- Update RLS policies to allow project members to manage their project's menu config
DROP POLICY IF EXISTS "Allow authenticated users to read menu_config" ON public.menu_config;
DROP POLICY IF EXISTS "Allow admins to manage menu_config" ON public.menu_config;

-- Allow reading global config (project_id IS NULL) or project-specific config
CREATE POLICY "Allow authenticated users to read menu_config" 
ON public.menu_config 
FOR SELECT 
TO authenticated 
USING (
  project_id IS NULL 
  OR public.is_project_member(project_id)
  OR public.is_admin()
);

-- Allow admins to manage global config, project members to manage project config
CREATE POLICY "Allow managing menu_config" 
ON public.menu_config 
FOR ALL 
TO authenticated 
USING (
  (project_id IS NULL AND public.is_admin())
  OR (project_id IS NOT NULL AND public.is_project_member(project_id))
)
WITH CHECK (
  (project_id IS NULL AND public.is_admin())
  OR (project_id IS NOT NULL AND public.is_project_member(project_id))
);