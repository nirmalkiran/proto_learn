-- Fix security issue: Add RLS policies to ai_usage_summary table
-- This table contains sensitive AI usage analytics that should be restricted

-- First, enable Row Level Security on the ai_usage_summary table
ALTER TABLE public.ai_usage_summary ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own AI usage summary data
CREATE POLICY "Users can view their own AI usage summary" 
ON public.ai_usage_summary 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create policy for admins to view all AI usage summary data
CREATE POLICY "Admins can view all AI usage summary" 
ON public.ai_usage_summary 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Note: ai_usage_summary appears to be a view/aggregated data, so we only need SELECT policies
-- INSERT/UPDATE/DELETE policies are not needed as this data is likely generated programmatically