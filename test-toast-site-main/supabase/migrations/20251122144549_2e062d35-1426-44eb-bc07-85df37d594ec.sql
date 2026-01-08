-- Drop the auto-generation trigger and functions since we'll use actual IDs from Jira/Azure
DROP TRIGGER IF EXISTS trigger_set_user_story_readable_id ON user_stories;
DROP FUNCTION IF EXISTS set_user_story_readable_id();
DROP FUNCTION IF EXISTS generate_unique_user_story_id(UUID);

-- Clear auto-generated IDs (they'll be populated from Jira/Azure on next sync)
UPDATE user_stories SET readable_id = NULL WHERE readable_id LIKE 'US-%';