-- Create nocode_test_folders table
CREATE TABLE public.nocode_test_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on nocode_test_folders
ALTER TABLE public.nocode_test_folders ENABLE ROW LEVEL SECURITY;

-- RLS policies for nocode_test_folders
CREATE POLICY "Users can view own folders" ON public.nocode_test_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own folders" ON public.nocode_test_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own folders" ON public.nocode_test_folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own folders" ON public.nocode_test_folders FOR DELETE USING (auth.uid() = user_id);

-- Create nocode_tests table
CREATE TABLE public.nocode_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  base_url TEXT NOT NULL DEFAULT '',
  steps JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  test_case_id UUID REFERENCES public.test_cases(id) ON DELETE SET NULL,
  folder_id UUID REFERENCES public.nocode_test_folders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on nocode_tests
ALTER TABLE public.nocode_tests ENABLE ROW LEVEL SECURITY;

-- RLS policies for nocode_tests
CREATE POLICY "Users can view own tests" ON public.nocode_tests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tests" ON public.nocode_tests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tests" ON public.nocode_tests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tests" ON public.nocode_tests FOR DELETE USING (auth.uid() = user_id);

-- Create menu_config table
CREATE TABLE public.menu_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_id TEXT NOT NULL,
  label TEXT NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on menu_config
ALTER TABLE public.menu_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for menu_config
CREATE POLICY "Users can view own menu config" ON public.menu_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own menu config" ON public.menu_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own menu config" ON public.menu_config FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own menu config" ON public.menu_config FOR DELETE USING (auth.uid() = user_id);

-- Add trigger for updated_at on nocode_tests
CREATE TRIGGER update_nocode_tests_updated_at
BEFORE UPDATE ON public.nocode_tests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for updated_at on menu_config
CREATE TRIGGER update_menu_config_updated_at
BEFORE UPDATE ON public.menu_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();