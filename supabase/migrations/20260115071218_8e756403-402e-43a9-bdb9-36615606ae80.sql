-- Create function to cleanup old execution data (fixed)
CREATE OR REPLACE FUNCTION public.cleanup_old_execution_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  retention_days integer;
  deleted_count integer := 0;
  cutoff_date timestamptz;
  temp_count integer;
BEGIN
  -- Get retention days from app_settings (default 30)
  SELECT COALESCE((setting_value->>'value')::integer, 30)
  INTO retention_days
  FROM public.app_settings
  WHERE setting_key = 'execution_data_retention_days';
  
  IF retention_days IS NULL THEN
    retention_days := 30;
  END IF;
  
  cutoff_date := now() - (retention_days || ' days')::interval;
  
  -- Delete old agent execution results
  WITH deleted AS (
    DELETE FROM public.agent_execution_results
    WHERE created_at < cutoff_date
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  -- Delete old nocode test executions
  WITH deleted_execs AS (
    DELETE FROM public.nocode_test_executions
    WHERE created_at < cutoff_date
    RETURNING id
  )
  SELECT COUNT(*) INTO temp_count FROM deleted_execs;
  deleted_count := deleted_count + temp_count;
  
  -- Delete old completed jobs from queue
  WITH deleted_jobs AS (
    DELETE FROM public.agent_job_queue
    WHERE completed_at < cutoff_date
    AND status IN ('completed', 'failed', 'cancelled')
    RETURNING id
  )
  SELECT COUNT(*) INTO temp_count FROM deleted_jobs;
  deleted_count := deleted_count + temp_count;
  
  -- Delete old activity logs
  WITH deleted_logs AS (
    DELETE FROM public.agent_activity_logs
    WHERE created_at < cutoff_date
    RETURNING id
  )
  SELECT COUNT(*) INTO temp_count FROM deleted_logs;
  deleted_count := deleted_count + temp_count;
  
  RETURN deleted_count;
END;
$$;