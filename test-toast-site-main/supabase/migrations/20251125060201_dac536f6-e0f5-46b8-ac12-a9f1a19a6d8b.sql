-- Add jira_data column to saved_test_reports table
ALTER TABLE saved_test_reports ADD COLUMN IF NOT EXISTS jira_data jsonb;