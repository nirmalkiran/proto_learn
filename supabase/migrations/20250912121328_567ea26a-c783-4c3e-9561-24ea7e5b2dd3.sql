-- Fix RLS policy for saved_test_plans to allow project members to create test plans
DROP POLICY IF EXISTS "Users can create test plans in their projects" ON public.saved_test_plans;

-- Create new policy that allows both project owners and project members to create test plans
CREATE POLICY "Project members can create test plans" 
ON public.saved_test_plans 
FOR INSERT 
WITH CHECK (
  is_project_member(project_id, auth.uid()) AND (auth.uid() = user_id)
);

-- Also update the update and delete policies to be consistent
DROP POLICY IF EXISTS "Users can update test plans in their projects" ON public.saved_test_plans;
DROP POLICY IF EXISTS "Users can delete test plans in their projects" ON public.saved_test_plans;

CREATE POLICY "Project members can update test plans" 
ON public.saved_test_plans 
FOR UPDATE 
USING (
  is_project_member(project_id, auth.uid()) AND (auth.uid() = user_id)
);

CREATE POLICY "Project members can delete test plans" 
ON public.saved_test_plans 
FOR DELETE 
USING (
  is_project_member(project_id, auth.uid()) AND (auth.uid() = user_id)
);