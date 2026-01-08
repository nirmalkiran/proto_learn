-- Create table for saved test reports
CREATE TABLE public.saved_test_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  report_name TEXT NOT NULL,
  report_content TEXT NOT NULL,
  statistics JSONB,
  project_name TEXT,
  report_type TEXT NOT NULL DEFAULT 'executive',
  azure_devops_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.saved_test_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
CREATE POLICY "Users can create their own test reports"
ON public.saved_test_reports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND (
  is_project_member(project_id, auth.uid()) OR 
  EXISTS (SELECT 1 FROM projects WHERE id = project_id AND created_by = auth.uid())
));

CREATE POLICY "Users can view their own test reports"
ON public.saved_test_reports
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR 
  is_project_member(project_id, auth.uid()) OR 
  EXISTS (SELECT 1 FROM projects WHERE id = project_id AND created_by = auth.uid())
);

CREATE POLICY "Users can update their own test reports"
ON public.saved_test_reports
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own test reports"
ON public.saved_test_reports
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- RLS Policies for public projects
CREATE POLICY "Public can view test reports for public projects"
ON public.saved_test_reports
FOR SELECT
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can create test reports for public projects"
ON public.saved_test_reports
FOR INSERT
WITH CHECK (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can update test reports for public projects"
ON public.saved_test_reports
FOR UPDATE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can delete test reports for public projects"
ON public.saved_test_reports
FOR DELETE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Create trigger for updated_at
CREATE TRIGGER update_saved_test_reports_updated_at
BEFORE UPDATE ON public.saved_test_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();