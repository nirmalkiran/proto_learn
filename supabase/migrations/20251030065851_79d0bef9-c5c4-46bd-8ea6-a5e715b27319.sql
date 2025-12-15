-- Create table for temporary OAuth PKCE storage
CREATE TABLE IF NOT EXISTS public.oauth_pkce_storage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_oauth_pkce_state ON public.oauth_pkce_storage(state);
CREATE INDEX IF NOT EXISTS idx_oauth_pkce_expires ON public.oauth_pkce_storage(expires_at);

-- Enable RLS (not really needed since accessed via service role, but good practice)
ALTER TABLE public.oauth_pkce_storage ENABLE ROW LEVEL SECURITY;

-- Create a function to clean up expired entries
CREATE OR REPLACE FUNCTION public.cleanup_expired_pkce()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.oauth_pkce_storage
  WHERE expires_at < now();
END;
$$;