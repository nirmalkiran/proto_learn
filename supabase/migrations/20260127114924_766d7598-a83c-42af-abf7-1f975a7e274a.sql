-- Drop the existing unique constraint on menu_id alone
ALTER TABLE public.menu_config DROP CONSTRAINT IF EXISTS menu_config_menu_id_key;

-- Add a composite unique constraint on (project_id, menu_id)
-- This allows the same menu_id for different projects
ALTER TABLE public.menu_config 
ADD CONSTRAINT menu_config_project_menu_unique UNIQUE (project_id, menu_id);