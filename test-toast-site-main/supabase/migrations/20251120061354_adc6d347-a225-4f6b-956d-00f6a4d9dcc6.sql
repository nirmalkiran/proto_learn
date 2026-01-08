-- Add sprint columns to user_stories table
ALTER TABLE user_stories 
ADD COLUMN IF NOT EXISTS sprint_id text,
ADD COLUMN IF NOT EXISTS sprint_name text;