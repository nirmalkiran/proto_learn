-- Drop the existing constraint and recreate with "cancelling" status added
ALTER TABLE nocode_test_executions DROP CONSTRAINT nocode_test_executions_status_check;

ALTER TABLE nocode_test_executions ADD CONSTRAINT nocode_test_executions_status_check 
CHECK (status = ANY (ARRAY['running'::text, 'passed'::text, 'failed'::text, 'cancelled'::text, 'cancelling'::text, 'pending'::text]));