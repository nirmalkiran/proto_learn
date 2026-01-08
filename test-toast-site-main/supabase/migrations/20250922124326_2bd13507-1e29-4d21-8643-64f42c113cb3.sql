-- Update RLS policy for ai_usage_logs to allow project-wide viewing
DROP POLICY "Users can view their own AI usage logs" ON public.ai_usage_logs;

CREATE POLICY "Users can view AI usage logs for their projects" 
ON public.ai_usage_logs 
FOR SELECT 
USING (
  auth.uid() = user_id OR 
  is_project_member(project_id, auth.uid()) OR 
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = ai_usage_logs.project_id 
    AND projects.created_by = auth.uid()
  )
);