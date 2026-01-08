-- Add public read access for specific project
-- This allows unauthenticated users to view data for the public project

-- Allow public to view the specific public project
CREATE POLICY "Public can view public projects"
ON public.projects
FOR SELECT
USING (id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Allow public to view test cases for public projects
CREATE POLICY "Public can view test cases for public projects"
ON public.test_cases
FOR SELECT
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Allow public to view user stories for public projects
CREATE POLICY "Public can view user stories for public projects"
ON public.user_stories
FOR SELECT
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Allow public to view test plans for public projects
CREATE POLICY "Public can view test plans for public projects"
ON public.saved_test_plans
FOR SELECT
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Allow public to view git files for public projects
CREATE POLICY "Public can view git files for public projects"
ON public.git_files
FOR SELECT
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Allow public to view git commits for public projects
CREATE POLICY "Public can view git commits for public projects"
ON public.git_commits
FOR SELECT
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Allow public to view automation results for public projects
CREATE POLICY "Public can view automation results for public projects"
ON public.automation_results
FOR SELECT
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Allow public to view integration configs for public projects
CREATE POLICY "Public can view integration configs for public projects"
ON public.integration_configs
FOR SELECT
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Allow public to view AI usage logs for public projects
CREATE POLICY "Public can view AI usage logs for public projects"
ON public.ai_usage_logs
FOR SELECT
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);

-- Allow public to view performance reports for public projects
CREATE POLICY "Public can view performance reports for public projects"
ON public.performance_reports
FOR SELECT
USING (project_id = '3859858d-0555-409a-99ee-e63234e8683b'::uuid);