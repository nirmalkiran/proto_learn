-- Create table for storing mobile automation scenarios
CREATE TABLE IF NOT EXISTS public.nocodemobile_scenarios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    app_package TEXT,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_nocodemobile_scenarios_user_id 
ON public.nocodemobile_scenarios(user_id);

-- Add index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_nocodemobile_scenarios_created_at 
ON public.nocodemobile_scenarios(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.nocodemobile_scenarios ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own scenarios
CREATE POLICY "Users can view their own scenarios"
ON public.nocodemobile_scenarios
FOR SELECT
USING (auth.uid() = user_id);

-- Create policy: Users can insert their own scenarios
CREATE POLICY "Users can insert their own scenarios"
ON public.nocodemobile_scenarios
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own scenarios
CREATE POLICY "Users can update their own scenarios"
ON public.nocodemobile_scenarios
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can delete their own scenarios
CREATE POLICY "Users can delete their own scenarios"
ON public.nocodemobile_scenarios
FOR DELETE
USING (auth.uid() = user_id);

-- Add comment to table
COMMENT ON TABLE public.nocodemobile_scenarios IS 'Stores saved mobile automation test scenarios with recorded actions';

-- Add comments to columns
COMMENT ON COLUMN public.nocodemobile_scenarios.id IS 'Unique identifier for the scenario';
COMMENT ON COLUMN public.nocodemobile_scenarios.name IS 'User-friendly name for the scenario';
COMMENT ON COLUMN public.nocodemobile_scenarios.description IS 'Optional description of what the scenario tests';
COMMENT ON COLUMN public.nocodemobile_scenarios.steps IS 'JSON array of recorded actions/steps';
COMMENT ON COLUMN public.nocodemobile_scenarios.app_package IS 'Android app package name being tested';
COMMENT ON COLUMN public.nocodemobile_scenarios.user_id IS 'Reference to the user who created this scenario';
COMMENT ON COLUMN public.nocodemobile_scenarios.created_at IS 'Timestamp when scenario was first created';
COMMENT ON COLUMN public.nocodemobile_scenarios.updated_at IS 'Timestamp when scenario was last modified';
