-- Add admin access to git_files RLS policies
-- Drop existing SELECT policy and recreate with admin check
DROP POLICY IF EXISTS "Project members can view git files" ON git_files;

CREATE POLICY "Users can view git files"
ON git_files
FOR SELECT
USING (
  is_admin() OR
  (EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = git_files.project_id 
    AND projects.created_by = auth.uid()
  )) OR
  is_project_member(project_id, auth.uid())
);

-- Update other policies to include admin access
DROP POLICY IF EXISTS "Project members can create git files" ON git_files;
CREATE POLICY "Users can create git files"
ON git_files
FOR INSERT
WITH CHECK (
  is_admin() OR
  is_project_member(project_id, auth.uid())
);

DROP POLICY IF EXISTS "Project members can update git files" ON git_files;
CREATE POLICY "Users can update git files"
ON git_files
FOR UPDATE
USING (
  is_admin() OR
  is_project_member(project_id, auth.uid())
);

DROP POLICY IF EXISTS "Project members can delete git files" ON git_files;
CREATE POLICY "Users can delete git files"
ON git_files
FOR DELETE
USING (
  is_admin() OR
  is_project_member(project_id, auth.uid())
);