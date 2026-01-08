-- Create nocode_test_folders table
CREATE TABLE public.nocode_test_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add folder_id to nocode_tests
ALTER TABLE public.nocode_tests 
ADD COLUMN folder_id uuid REFERENCES public.nocode_test_folders(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_nocode_tests_folder_id ON public.nocode_tests(folder_id);
CREATE INDEX idx_nocode_test_folders_project_id ON public.nocode_test_folders(project_id);

-- Enable RLS
ALTER TABLE public.nocode_test_folders ENABLE ROW LEVEL SECURITY;

-- RLS policies for folders
CREATE POLICY "Users can view folders in their projects" 
ON public.nocode_test_folders 
FOR SELECT 
USING (is_project_member(project_id));

CREATE POLICY "Users can create folders in their projects" 
ON public.nocode_test_folders 
FOR INSERT 
WITH CHECK (is_project_member(project_id) AND auth.uid() = created_by);

CREATE POLICY "Users can update folders in their projects" 
ON public.nocode_test_folders 
FOR UPDATE 
USING (is_project_member(project_id));

CREATE POLICY "Users can delete folders in their projects" 
ON public.nocode_test_folders 
FOR DELETE 
USING (is_project_member(project_id));