-- Add missing columns to test_runs table
ALTER TABLE public.test_runs ADD COLUMN IF NOT EXISTS run_type text;
ALTER TABLE public.test_runs ADD COLUMN IF NOT EXISTS created_by text;

-- Add missing columns to test_run_cases table
ALTER TABLE public.test_run_cases ADD COLUMN IF NOT EXISTS step_results jsonb DEFAULT '[]'::jsonb;

-- Create ai_learning_data table
CREATE TABLE IF NOT EXISTS public.ai_learning_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  artifact_id uuid NOT NULL,
  feedback_type text NOT NULL,
  feedback_content text,
  confidence_score numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_learning_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_learning_data" ON public.ai_learning_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai_learning_data" ON public.ai_learning_data FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ai_learning_data" ON public.ai_learning_data FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ai_learning_data" ON public.ai_learning_data FOR DELETE USING (auth.uid() = user_id);