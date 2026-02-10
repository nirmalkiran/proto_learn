-- Add prerequisite_steps column to nocode_test_suites table
-- This stores steps that run once before executing any test case in the suite (e.g., login flow)
ALTER TABLE public.nocode_test_suites
ADD COLUMN IF NOT EXISTS prerequisite_steps jsonb DEFAULT '[]'::jsonb;

-- Add a comment for documentation
COMMENT ON COLUMN public.nocode_test_suites.prerequisite_steps IS 'Steps that run once before executing any test case in the suite (e.g., login flow)';

-- Add prerequisite_base_url for the base URL used during prerequisite execution
ALTER TABLE public.nocode_test_suites
ADD COLUMN IF NOT EXISTS prerequisite_base_url text DEFAULT '';

COMMENT ON COLUMN public.nocode_test_suites.prerequisite_base_url IS 'Base URL to use when executing prerequisite steps';