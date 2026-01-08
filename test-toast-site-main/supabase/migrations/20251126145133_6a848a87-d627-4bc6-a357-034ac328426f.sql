-- Create menu configuration table
CREATE TABLE public.menu_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id text NOT NULL UNIQUE,
  label text NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.menu_config ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view menu config
CREATE POLICY "Anyone can view menu config"
ON public.menu_config
FOR SELECT
USING (true);

-- Policy: Only admins can modify menu config
CREATE POLICY "Admins can insert menu config"
ON public.menu_config
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update menu config"
ON public.menu_config
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete menu config"
ON public.menu_config
FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_menu_config_updated_at
BEFORE UPDATE ON public.menu_config
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Insert default menu items
INSERT INTO public.menu_config (menu_id, label, is_visible, display_order) VALUES
  ('dashboard', 'Dashboard', true, 1),
  ('projects', 'Projects', true, 2),
  ('user-stories', 'User Stories', true, 3),
  ('test-plan', 'Test Plan', true, 4),
  ('test-cases', 'Test Cases', true, 5),
  ('repository', 'Repository', true, 6),
  ('api', 'API', true, 7),
  ('defects', 'Defects', true, 8),
  ('test-report', 'Test Report', true, 9),
  ('integrations', 'Integrations', true, 10),
  ('analytics', 'AI Analytics', true, 11),
  ('knowledge-base', 'Knowledge Base', true, 12),
  ('role-manager', 'Role Manager', true, 13);