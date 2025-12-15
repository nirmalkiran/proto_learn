-- Create the app_role enum type that is referenced by database functions
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'tester', 'user');

-- The handle_new_user() function and other functions reference this type
-- but it was missing, causing signup failures