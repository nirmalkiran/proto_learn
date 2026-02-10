-- Create RLS policies for performance_jobs table
-- Allow authenticated users to insert their own jobs
CREATE POLICY "Users can insert their own performance jobs"
ON public.performance_jobs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to view jobs for their projects
CREATE POLICY "Users can view performance jobs"
ON public.performance_jobs
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to update jobs
CREATE POLICY "Users can update performance jobs"
ON public.performance_jobs
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow service role and agents to manage jobs
CREATE POLICY "Service can manage performance jobs"
ON public.performance_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);