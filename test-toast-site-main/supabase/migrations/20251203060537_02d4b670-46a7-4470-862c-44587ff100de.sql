-- Enable Row Level Security on automation_results table
-- This table already has RLS policies defined but RLS was not enabled
ALTER TABLE public.automation_results ENABLE ROW LEVEL SECURITY;