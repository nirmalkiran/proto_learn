-- Add board columns to user_stories table
ALTER TABLE public.user_stories 
ADD COLUMN board_id text,
ADD COLUMN board_name text;