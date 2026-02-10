-- Add datasets column to nocode_tests table for data-driven testing
ALTER TABLE public.nocode_tests 
ADD COLUMN IF NOT EXISTS datasets jsonb DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.nocode_tests.datasets IS 'Array of datasets for data-driven testing. Each dataset contains variable key-value pairs for test parameterization.';