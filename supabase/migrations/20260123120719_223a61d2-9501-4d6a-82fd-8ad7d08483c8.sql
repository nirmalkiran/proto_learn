-- Add target_urls column for multiple target URL support
ALTER TABLE public.security_scan_configs
ADD COLUMN IF NOT EXISTS target_urls text[] DEFAULT '{}';