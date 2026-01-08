-- Fix RLS policies for user_stories table to allow project members to create and modify stories

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can create user stories in their projects" ON public.user_stories;
DROP POLICY IF EXISTS "Users can update user stories in their projects" ON public.user_stories;
DROP POLICY IF EXISTS "Users can delete user stories in their projects" ON public.user_stories;

-- Create new policies that allow project members to create, update, and delete user stories
CREATE POLICY "Project members can create user stories" 
ON public.user_stories 
FOR INSERT 
TO authenticated 
WITH CHECK (is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can update user stories in their projects" 
ON public.user_stories 
FOR UPDATE 
TO authenticated 
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can delete user stories in their projects" 
ON public.user_stories 
FOR DELETE 
TO authenticated 
USING (is_project_member(project_id, auth.uid()));