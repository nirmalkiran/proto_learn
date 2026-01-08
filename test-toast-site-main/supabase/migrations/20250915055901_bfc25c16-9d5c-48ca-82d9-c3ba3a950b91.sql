-- Add automated flag as a separate boolean column to test_cases table
ALTER TABLE public.test_cases 
ADD COLUMN automated BOOLEAN NOT NULL DEFAULT false;

-- Update existing test cases that have status 'automated' to set automated flag to true
UPDATE public.test_cases 
SET automated = true 
WHERE status = 'automated';

-- Update existing automated test cases to have a proper status (not-run as default)
UPDATE public.test_cases 
SET status = 'not-run' 
WHERE status = 'automated';