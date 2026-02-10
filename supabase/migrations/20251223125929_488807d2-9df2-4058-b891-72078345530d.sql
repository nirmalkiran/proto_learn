-- Add Self-Hosted Agents menu item
INSERT INTO menu_config (menu_id, label, is_visible, display_order)
VALUES ('agents', 'Self-Hosted Agents', true, 16)
ON CONFLICT (menu_id) DO UPDATE SET is_visible = true, label = 'Self-Hosted Agents';