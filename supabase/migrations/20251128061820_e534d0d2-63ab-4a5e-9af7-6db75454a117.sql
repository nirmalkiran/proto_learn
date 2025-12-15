-- Add base_url column to saved_api_test_cases table
ALTER TABLE public.saved_api_test_cases 
ADD COLUMN base_url text;