-- Update all executions stuck in 'cancelling' status to 'cancelled'
UPDATE nocode_test_executions 
SET 
  status = 'cancelled', 
  completed_at = COALESCE(completed_at, now()), 
  error_message = COALESCE(error_message, 'Test execution cancelled by user')
WHERE status = 'cancelling';