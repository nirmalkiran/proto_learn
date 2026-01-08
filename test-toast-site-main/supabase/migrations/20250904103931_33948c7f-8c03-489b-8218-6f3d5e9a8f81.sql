-- Fix RLS policies for test_cases table to allow project members to create and modify test cases

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can create test cases in their projects" ON public.test_cases;
DROP POLICY IF EXISTS "Users can update test cases in their projects" ON public.test_cases;
DROP POLICY IF EXISTS "Users can delete test cases in their projects" ON public.test_cases;

-- Create new policies that allow project members to create, update, and delete test cases
CREATE POLICY "Project members can create test cases" 
ON public.test_cases 
FOR INSERT 
TO authenticated 
WITH CHECK (is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can update test cases in their projects" 
ON public.test_cases 
FOR UPDATE 
TO authenticated 
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can delete test cases in their projects" 
ON public.test_cases 
FOR DELETE 
TO authenticated 
USING (is_project_member(project_id, auth.uid()));