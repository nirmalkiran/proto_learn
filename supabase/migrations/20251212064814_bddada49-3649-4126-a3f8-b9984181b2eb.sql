-- Create test_case_folders table for custom folders
CREATE TABLE public.test_case_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_story_id UUID REFERENCES public.user_stories(id) ON DELETE SET NULL,
  is_custom BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add folder_id column to test_cases table
ALTER TABLE public.test_cases 
ADD COLUMN folder_id UUID REFERENCES public.test_case_folders(id) ON DELETE SET NULL;

-- Enable Row Level Security
ALTER TABLE public.test_case_folders ENABLE ROW LEVEL SECURITY;

-- Create policies for test_case_folders
CREATE POLICY "Users can view folders in their projects" 
ON public.test_case_folders 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM project_members 
    WHERE project_members.project_id = test_case_folders.project_id 
    AND project_members.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = test_case_folders.project_id 
    AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users can create folders in their projects" 
ON public.test_case_folders 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM project_members 
    WHERE project_members.project_id = test_case_folders.project_id 
    AND project_members.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = test_case_folders.project_id 
    AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users can update folders in their projects" 
ON public.test_case_folders 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM project_members 
    WHERE project_members.project_id = test_case_folders.project_id 
    AND project_members.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = test_case_folders.project_id 
    AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users can delete folders in their projects" 
ON public.test_case_folders 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM project_members 
    WHERE project_members.project_id = test_case_folders.project_id 
    AND project_members.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = test_case_folders.project_id 
    AND projects.created_by = auth.uid()
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_test_case_folders_updated_at
BEFORE UPDATE ON public.test_case_folders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();