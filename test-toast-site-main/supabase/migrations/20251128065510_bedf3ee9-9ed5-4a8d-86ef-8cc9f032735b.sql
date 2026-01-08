-- Add auth_token column to saved_api_test_cases table
ALTER TABLE public.saved_api_test_cases 
ADD COLUMN auth_token text;