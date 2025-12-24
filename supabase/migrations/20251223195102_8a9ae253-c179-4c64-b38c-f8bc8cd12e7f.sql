-- Add missing columns to user_stories table
ALTER TABLE public.user_stories
  ADD COLUMN IF NOT EXISTS readable_id TEXT,
  ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT,
  ADD COLUMN IF NOT EXISTS board_id TEXT,
  ADD COLUMN IF NOT EXISTS board_name TEXT,
  ADD COLUMN IF NOT EXISTS sprint_id TEXT,
  ADD COLUMN IF NOT EXISTS sprint_name TEXT;

-- Add missing columns to saved_test_reports table
ALTER TABLE public.saved_test_reports
  ADD COLUMN IF NOT EXISTS report_name TEXT,
  ADD COLUMN IF NOT EXISTS report_content TEXT,
  ADD COLUMN IF NOT EXISTS statistics JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS project_name TEXT,
  ADD COLUMN IF NOT EXISTS report_type TEXT,
  ADD COLUMN IF NOT EXISTS azure_devops_data JSONB,
  ADD COLUMN IF NOT EXISTS jira_data JSONB;