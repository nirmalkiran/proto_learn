-- Create integration_configs table to store integration configurations per project
CREATE TABLE public.integration_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_sync TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, integration_id)
);

-- Enable RLS
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;

-- Create policies for integration configs
CREATE POLICY "Users can view integration configs for projects they are members of" 
ON public.integration_configs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = integration_configs.project_id 
    AND project_members.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert integration configs for projects they are members of" 
ON public.integration_configs 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = integration_configs.project_id 
    AND project_members.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update integration configs for projects they are members of" 
ON public.integration_configs 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = integration_configs.project_id 
    AND project_members.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete integration configs for projects they are members of" 
ON public.integration_configs 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_members.project_id = integration_configs.project_id 
    AND project_members.user_id = auth.uid()
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_integration_configs_updated_at
BEFORE UPDATE ON public.integration_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();