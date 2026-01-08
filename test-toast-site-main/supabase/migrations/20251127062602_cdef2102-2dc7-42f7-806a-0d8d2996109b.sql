-- Enable realtime for nocode_test_executions table
ALTER TABLE nocode_test_executions REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE nocode_test_executions;