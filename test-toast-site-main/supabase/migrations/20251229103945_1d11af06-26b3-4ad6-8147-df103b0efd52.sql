-- Add a settings table for global app configuration
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow admins to manage settings
CREATE POLICY "Admins can manage app settings"
ON public.app_settings
FOR ALL
USING (public.is_admin(auth.uid()));

-- Allow authenticated users to read settings
CREATE POLICY "Authenticated users can read app settings"
ON public.app_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Insert default setting for testing only mode
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('testing_only_mode', '{"enabled": false}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();