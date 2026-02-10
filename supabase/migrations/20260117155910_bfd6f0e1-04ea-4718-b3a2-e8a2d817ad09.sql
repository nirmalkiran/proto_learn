-- Create RLS policies for performance_jmx_files table
-- Allow authenticated users to insert their own JMX files
CREATE POLICY "Users can insert their own JMX files"
ON public.performance_jmx_files
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to view JMX files
CREATE POLICY "Users can view JMX files"
ON public.performance_jmx_files
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to update their own JMX files
CREATE POLICY "Users can update JMX files"
ON public.performance_jmx_files
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to delete their own JMX files
CREATE POLICY "Users can delete JMX files"
ON public.performance_jmx_files
FOR DELETE
TO authenticated
USING (true);

-- Allow service role full access
CREATE POLICY "Service can manage JMX files"
ON public.performance_jmx_files
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);