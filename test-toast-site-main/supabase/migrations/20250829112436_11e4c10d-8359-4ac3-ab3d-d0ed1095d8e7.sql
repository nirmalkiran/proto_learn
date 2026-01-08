-- Add unique constraint on user_id to prevent duplicate roles per user
-- First, remove any duplicate entries if they exist
DELETE FROM user_roles 
WHERE id NOT IN (
    SELECT DISTINCT ON (user_id) id 
    FROM user_roles 
    ORDER BY user_id, created_at DESC
);

-- Add unique constraint on user_id
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);