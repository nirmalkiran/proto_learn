-- Fix overly broad permissions on ai_usage_summary view
-- Remove unnecessary permissions for anonymous users

-- Revoke all permissions from anon (unauthenticated users)
REVOKE ALL ON public.ai_usage_summary FROM anon;

-- Ensure only authenticated users can access the view
-- The view will still respect RLS from underlying ai_usage_logs table
GRANT SELECT ON public.ai_usage_summary TO authenticated;

-- Keep service_role permissions for admin functions
-- postgres user retains full ownership