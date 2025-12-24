-- Create saved_test_plans table
CREATE TABLE public.saved_test_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  content JSONB DEFAULT '{}'::jsonb,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_test_plans ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own saved test plans" ON public.saved_test_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own saved test plans" ON public.saved_test_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own saved test plans" ON public.saved_test_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved test plans" ON public.saved_test_plans FOR DELETE USING (auth.uid() = user_id);

-- Create saved_test_reports table
CREATE TABLE public.saved_test_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  content JSONB DEFAULT '{}'::jsonb,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_test_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own saved test reports" ON public.saved_test_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own saved test reports" ON public.saved_test_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own saved test reports" ON public.saved_test_reports FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved test reports" ON public.saved_test_reports FOR DELETE USING (auth.uid() = user_id);

-- Add missing columns to test_cases table
ALTER TABLE public.test_cases 
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.test_case_folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS readable_id TEXT,
  ADD COLUMN IF NOT EXISTS test_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS automated BOOLEAN DEFAULT false;

-- Add missing columns to saved_api_test_cases table
ALTER TABLE public.saved_api_test_cases
  ADD COLUMN IF NOT EXISTS swagger_content TEXT,
  ADD COLUMN IF NOT EXISTS additional_prompt TEXT,
  ADD COLUMN IF NOT EXISTS postman_collection JSONB,
  ADD COLUMN IF NOT EXISTS base_url TEXT,
  ADD COLUMN IF NOT EXISTS auth_token TEXT;

-- Add user_story_id to test_case_folders if needed (for grouping)
ALTER TABLE public.test_case_folders
  ADD COLUMN IF NOT EXISTS user_story_id UUID REFERENCES public.user_stories(id) ON DELETE SET NULL;