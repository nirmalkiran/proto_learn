-- Add test_case_id column to link nocode_tests to test_cases
ALTER TABLE public.nocode_tests 
ADD COLUMN test_case_id uuid REFERENCES public.test_cases(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_nocode_tests_test_case_id ON public.nocode_tests(test_case_id);