-- Drop the PKCE storage table since OAuth flow is now client-side
DROP TABLE IF EXISTS public.oauth_pkce_storage;