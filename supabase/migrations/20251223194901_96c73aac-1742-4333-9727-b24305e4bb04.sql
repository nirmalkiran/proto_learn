-- Create project_members table
CREATE TABLE public.project_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for project_members
CREATE POLICY "Users can view project members" ON public.project_members FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = project_members.project_id AND pm.user_id = auth.uid()));
CREATE POLICY "Users can insert project members" ON public.project_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update project members" ON public.project_members FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete project members" ON public.project_members FOR DELETE USING (auth.uid() = user_id);

-- Create nocode_visual_baselines table
CREATE TABLE public.nocode_visual_baselines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.nocode_tests(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  baseline_image TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.nocode_visual_baselines ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own visual baselines" ON public.nocode_visual_baselines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own visual baselines" ON public.nocode_visual_baselines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own visual baselines" ON public.nocode_visual_baselines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own visual baselines" ON public.nocode_visual_baselines FOR DELETE USING (auth.uid() = user_id);

-- Create saved_api_test_cases table
CREATE TABLE public.saved_api_test_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  swagger_url TEXT,
  test_cases JSONB DEFAULT '[]'::jsonb,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_api_test_cases ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own saved api test cases" ON public.saved_api_test_cases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own saved api test cases" ON public.saved_api_test_cases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own saved api test cases" ON public.saved_api_test_cases FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved api test cases" ON public.saved_api_test_cases FOR DELETE USING (auth.uid() = user_id);

-- Create test_case_folders table
CREATE TABLE public.test_case_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  is_custom BOOLEAN NOT NULL DEFAULT true,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.test_case_folders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own test case folders" ON public.test_case_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own test case folders" ON public.test_case_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own test case folders" ON public.test_case_folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own test case folders" ON public.test_case_folders FOR DELETE USING (auth.uid() = user_id);

-- Add markdown_settings column to projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS markdown_settings JSONB DEFAULT '{}'::jsonb;