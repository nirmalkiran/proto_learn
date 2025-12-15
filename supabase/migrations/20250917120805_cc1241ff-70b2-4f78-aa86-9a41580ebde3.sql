-- Update RLS policies for integration_configs to allow project owners
DROP POLICY IF EXISTS "Users can insert integration configs for projects they are memb" ON public.integration_configs;
DROP POLICY IF EXISTS "Users can update integration configs for projects they are memb" ON public.integration_configs;
DROP POLICY IF EXISTS "Users can delete integration configs for projects they are memb" ON public.integration_configs;
DROP POLICY IF EXISTS "Users can view integration configs for projects they are member" ON public.integration_configs;

-- Create new policies that allow both project owners and project members
CREATE POLICY "Users can insert integration configs for their projects" 
ON public.integration_configs 
FOR INSERT 
WITH CHECK (
  (EXISTS ( SELECT 1 FROM projects WHERE projects.id = integration_configs.project_id AND projects.created_by = auth.uid()))
  OR 
  (EXISTS ( SELECT 1 FROM project_members WHERE project_members.project_id = integration_configs.project_id AND project_members.user_id = auth.uid()))
);

CREATE POLICY "Users can update integration configs for their projects" 
ON public.integration_configs 
FOR UPDATE 
USING (
  (EXISTS ( SELECT 1 FROM projects WHERE projects.id = integration_configs.project_id AND projects.created_by = auth.uid()))
  OR 
  (EXISTS ( SELECT 1 FROM project_members WHERE project_members.project_id = integration_configs.project_id AND project_members.user_id = auth.uid()))
);

CREATE POLICY "Users can delete integration configs for their projects" 
ON public.integration_configs 
FOR DELETE 
USING (
  (EXISTS ( SELECT 1 FROM projects WHERE projects.id = integration_configs.project_id AND projects.created_by = auth.uid()))
  OR 
  (EXISTS ( SELECT 1 FROM project_members WHERE project_members.project_id = integration_configs.project_id AND project_members.user_id = auth.uid()))
);

CREATE POLICY "Users can view integration configs for their projects" 
ON public.integration_configs 
FOR SELECT 
USING (
  (EXISTS ( SELECT 1 FROM projects WHERE projects.id = integration_configs.project_id AND projects.created_by = auth.uid()))
  OR 
  (EXISTS ( SELECT 1 FROM project_members WHERE project_members.project_id = integration_configs.project_id AND project_members.user_id = auth.uid()))
);