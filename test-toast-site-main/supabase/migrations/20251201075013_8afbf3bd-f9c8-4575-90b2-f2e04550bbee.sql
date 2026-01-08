-- Drop the existing constraint
ALTER TABLE public.nocode_tests DROP CONSTRAINT nocode_tests_status_check;

-- Add new constraint with all valid statuses
ALTER TABLE public.nocode_tests ADD CONSTRAINT nocode_tests_status_check 
  CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text, 'passed'::text, 'failed'::text, 'disabled'::text]));