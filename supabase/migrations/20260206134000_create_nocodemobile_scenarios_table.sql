-- Ensure mobile scenarios table is created via timestamped migration
-- so it is applied by Supabase migration tooling.
CREATE TABLE IF NOT EXISTS public.nocodemobile_scenarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  app_package TEXT,
  manual_script TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nocodemobile_scenarios_user_id
ON public.nocodemobile_scenarios(user_id);

CREATE INDEX IF NOT EXISTS idx_nocodemobile_scenarios_created_at
ON public.nocodemobile_scenarios(created_at DESC);

ALTER TABLE public.nocodemobile_scenarios ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own scenarios"
  ON public.nocodemobile_scenarios
  FOR SELECT
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own scenarios"
  ON public.nocodemobile_scenarios
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own scenarios"
  ON public.nocodemobile_scenarios
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own scenarios"
  ON public.nocodemobile_scenarios
  FOR DELETE
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.nocodemobile_scenarios IS 'Stores saved mobile automation test scenarios with recorded actions';
