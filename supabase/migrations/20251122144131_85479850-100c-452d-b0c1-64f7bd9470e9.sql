-- Add readable_id column to user_stories table
ALTER TABLE user_stories ADD COLUMN IF NOT EXISTS readable_id TEXT;

-- Create function to generate unique user story IDs
CREATE OR REPLACE FUNCTION generate_unique_user_story_id(p_project_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_new_id TEXT;
BEGIN
  -- Get the count of existing user stories for this project
  SELECT COUNT(*) INTO v_count
  FROM user_stories
  WHERE project_id = p_project_id;
  
  -- Generate new ID in format US-001, US-002, etc.
  v_new_id := 'US-' || LPAD((v_count + 1)::TEXT, 3, '0');
  
  -- Check if ID already exists and increment if needed
  WHILE EXISTS (SELECT 1 FROM user_stories WHERE project_id = p_project_id AND readable_id = v_new_id) LOOP
    v_count := v_count + 1;
    v_new_id := 'US-' || LPAD((v_count + 1)::TEXT, 3, '0');
  END LOOP;
  
  RETURN v_new_id;
END;
$$;

-- Create trigger function to auto-generate readable_id
CREATE OR REPLACE FUNCTION set_user_story_readable_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.readable_id IS NULL THEN
    NEW.readable_id := generate_unique_user_story_id(NEW.project_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_set_user_story_readable_id ON user_stories;
CREATE TRIGGER trigger_set_user_story_readable_id
  BEFORE INSERT ON user_stories
  FOR EACH ROW
  EXECUTE FUNCTION set_user_story_readable_id();

-- Backfill existing user stories with readable IDs
DO $$
DECLARE
  story RECORD;
BEGIN
  FOR story IN 
    SELECT id, project_id 
    FROM user_stories 
    WHERE readable_id IS NULL
    ORDER BY created_at
  LOOP
    UPDATE user_stories 
    SET readable_id = generate_unique_user_story_id(story.project_id)
    WHERE id = story.id;
  END LOOP;
END $$;