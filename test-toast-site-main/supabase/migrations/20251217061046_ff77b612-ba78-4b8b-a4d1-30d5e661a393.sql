-- Add step_results column to test_run_cases for tracking step-level status, notes, and screenshots
ALTER TABLE public.test_run_cases 
ADD COLUMN IF NOT EXISTS step_results jsonb DEFAULT '[]'::jsonb;

-- Add comment to explain the structure
COMMENT ON COLUMN public.test_run_cases.step_results IS 'Array of step results: [{stepIndex: number, status: string, notes: string, screenshotUrl: string}]';