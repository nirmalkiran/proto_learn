-- Add Security Testing to menu_config
INSERT INTO menu_config (menu_id, label, is_visible, display_order)
VALUES ('security-testing', 'Security Testing', true, 9)
ON CONFLICT (menu_id) DO UPDATE SET label = 'Security Testing', updated_at = now();

-- Update display_order for items that should come after Security Testing
UPDATE menu_config SET display_order = display_order + 1 
WHERE display_order >= 9 AND menu_id != 'security-testing';