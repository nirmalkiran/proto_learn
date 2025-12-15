-- Create table for saved API test cases
CREATE TABLE IF NOT EXISTS public.saved_api_test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  swagger_content TEXT,
  additional_prompt TEXT,
  test_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
  postman_collection JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_api_test_cases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own saved API test cases"
  ON public.saved_api_test_cases
  FOR SELECT
  USING (auth.uid() = user_id OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Users can create their own saved API test cases"
  ON public.saved_api_test_cases
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_project_member(project_id, auth.uid()));

CREATE POLICY "Users can update their own saved API test cases"
  ON public.saved_api_test_cases
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved API test cases"
  ON public.saved_api_test_cases
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Public can view saved API test cases for public projects"
  ON public.saved_api_test_cases
  FOR SELECT
  USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Create trigger for updated_at
CREATE TRIGGER update_saved_api_test_cases_updated_at
  BEFORE UPDATE ON public.saved_api_test_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_saved_api_test_cases_project_id ON public.saved_api_test_cases(project_id);
CREATE INDEX idx_saved_api_test_cases_user_id ON public.saved_api_test_cases(user_id);