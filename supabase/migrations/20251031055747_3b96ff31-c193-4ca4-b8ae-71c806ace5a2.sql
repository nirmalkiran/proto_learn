-- Add public INSERT policies for WISPR project (3859858d-0555-409a-99ee-e63234e8683b)

-- User Stories
CREATE POLICY "Public can create user stories for public projects"
ON user_stories
FOR INSERT
WITH CHECK (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can update user stories for public projects"
ON user_stories
FOR UPDATE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can delete user stories for public projects"
ON user_stories
FOR DELETE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Test Cases
CREATE POLICY "Public can create test cases for public projects"
ON test_cases
FOR INSERT
WITH CHECK (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can update test cases for public projects"
ON test_cases
FOR UPDATE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can delete test cases for public projects"
ON test_cases
FOR DELETE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Saved Test Plans
CREATE POLICY "Public can create test plans for public projects"
ON saved_test_plans
FOR INSERT
WITH CHECK (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can update test plans for public projects"
ON saved_test_plans
FOR UPDATE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can delete test plans for public projects"
ON saved_test_plans
FOR DELETE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Saved API Test Cases
CREATE POLICY "Public can create API test cases for public projects"
ON saved_api_test_cases
FOR INSERT
WITH CHECK (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can update API test cases for public projects"
ON saved_api_test_cases
FOR UPDATE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can delete API test cases for public projects"
ON saved_api_test_cases
FOR DELETE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Git Files
CREATE POLICY "Public can create git files for public projects"
ON git_files
FOR INSERT
WITH CHECK (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can update git files for public projects"
ON git_files
FOR UPDATE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can delete git files for public projects"
ON git_files
FOR DELETE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Git Commits
CREATE POLICY "Public can create git commits for public projects"
ON git_commits
FOR INSERT
WITH CHECK (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Integration Configs
CREATE POLICY "Public can create integration configs for public projects"
ON integration_configs
FOR INSERT
WITH CHECK (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can update integration configs for public projects"
ON integration_configs
FOR UPDATE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can delete integration configs for public projects"
ON integration_configs
FOR DELETE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Automation Results
CREATE POLICY "Public can create automation results for public projects"
ON automation_results
FOR INSERT
WITH CHECK (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can update automation results for public projects"
ON automation_results
FOR UPDATE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can delete automation results for public projects"
ON automation_results
FOR DELETE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Performance Reports
CREATE POLICY "Public can create performance reports for public projects"
ON performance_reports
FOR INSERT
WITH CHECK (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can update performance reports for public projects"
ON performance_reports
FOR UPDATE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can delete performance reports for public projects"
ON performance_reports
FOR DELETE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- AI Usage Logs
CREATE POLICY "Public can create AI usage logs for public projects"
ON ai_usage_logs
FOR INSERT
WITH CHECK (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can update AI usage logs for public projects"
ON ai_usage_logs
FOR UPDATE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

CREATE POLICY "Public can delete AI usage logs for public projects"
ON ai_usage_logs
FOR DELETE
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Projects table - allow public to update the WISPR project
CREATE POLICY "Public can update public projects"
ON projects
FOR UPDATE
USING (id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);