-- Create table for performance test templates (recordings + config)
CREATE TABLE public.performance_test_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  parameterization JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.performance_test_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view templates in their projects"
ON public.performance_test_templates
FOR SELECT
USING (public.is_project_member(project_id));

CREATE POLICY "Users can create templates in their projects"
ON public.performance_test_templates
FOR INSERT
WITH CHECK (public.is_project_member(project_id));

CREATE POLICY "Users can update templates in their projects"
ON public.performance_test_templates
FOR UPDATE
USING (public.is_project_member(project_id));

CREATE POLICY "Users can delete templates in their projects"
ON public.performance_test_templates
FOR DELETE
USING (public.is_project_member(project_id));

-- Create index for faster lookups
CREATE INDEX idx_performance_test_templates_project ON public.performance_test_templates(project_id);

-- Add trigger for updated_at
CREATE TRIGGER update_performance_test_templates_updated_at
BEFORE UPDATE ON public.performance_test_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();