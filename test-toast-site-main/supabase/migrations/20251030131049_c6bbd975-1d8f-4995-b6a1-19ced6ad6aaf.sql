-- Drop the existing restrictive insert policy
DROP POLICY IF EXISTS "Users can create their own saved API test cases" ON saved_api_test_cases;

-- Create updated policy that allows both project members and project owners
CREATE POLICY "Users can create their own saved API test cases" 
ON saved_api_test_cases 
FOR INSERT 
WITH CHECK (
  (auth.uid() = user_id) AND 
  (
    is_project_member(project_id, auth.uid()) OR 
    (EXISTS (
      SELECT 1 
      FROM projects 
      WHERE projects.id = project_id 
      AND projects.created_by = auth.uid()
    ))
  )
);