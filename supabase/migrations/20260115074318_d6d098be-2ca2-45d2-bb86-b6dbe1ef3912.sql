-- Add Architecture menu item to menu_config
INSERT INTO public.menu_config (menu_id, label, is_visible, display_order) 
VALUES ('architecture', 'Architecture', true, 13)
ON CONFLICT (menu_id) DO NOTHING;