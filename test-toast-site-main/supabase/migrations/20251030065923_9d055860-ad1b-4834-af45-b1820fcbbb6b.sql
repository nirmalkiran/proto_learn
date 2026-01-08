-- Add RLS policy to prevent client access to PKCE storage
-- This table should only be accessed via service role in edge functions
CREATE POLICY "No client access to PKCE storage"
ON public.oauth_pkce_storage
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);