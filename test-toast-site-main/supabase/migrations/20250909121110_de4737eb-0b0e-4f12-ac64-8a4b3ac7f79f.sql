-- Fix Security Definer View issue
-- Recreate ai_usage_summary view with security_invoker = true to respect RLS

-- Drop the existing view
DROP VIEW IF EXISTS public.ai_usage_summary;

-- Recreate with security_invoker = true to ensure RLS is respected
CREATE VIEW public.ai_usage_summary
WITH (security_invoker = true) AS
SELECT 
  user_id,
  date_trunc('day'::text, created_at) AS usage_date,
  feature_type,
  count(*) AS usage_count,
  count(*) FILTER (WHERE (success = true)) AS successful_requests,
  round((((count(*) FILTER (WHERE (success = true)))::numeric / (count(*))::numeric) * (100)::numeric), 2) AS success_rate,
  sum(tokens_used) AS total_tokens,
  sum(openai_tokens_prompt) AS total_prompt_tokens,
  sum(openai_tokens_completion) AS total_completion_tokens,
  sum(openai_cost_usd) AS total_cost_usd,
  avg(execution_time_ms) AS avg_execution_time,
  string_agg(DISTINCT openai_model, ', '::text) FILTER (WHERE (openai_model IS NOT NULL)) AS models_used
FROM ai_usage_logs
GROUP BY user_id, (date_trunc('day'::text, created_at)), feature_type;

-- Ensure proper permissions (keep existing permissions structure)
REVOKE ALL ON public.ai_usage_summary FROM anon;
GRANT SELECT ON public.ai_usage_summary TO authenticated;