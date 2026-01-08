-- Enable RLS on automation_results table if not already enabled
ALTER TABLE IF EXISTS public.automation_results ENABLE ROW LEVEL SECURITY;

-- Update the handle_new_user function to properly handle Azure AD users
-- without trying to update existing profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  user_display_name text;
BEGIN
  -- Extract email from new user
  user_email := NEW.email;
  
  -- Extract display name from metadata or email
  user_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'display_name',
    split_part(user_email, '@', 1)
  );
  
  -- Always create a new profile for the new auth user
  -- This maintains data integrity as each auth.users entry gets its own profile
  INSERT INTO public.profiles (user_id, email, display_name, created_at, updated_at)
  VALUES (
    NEW.id,
    user_email,
    user_display_name,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    updated_at = now();
  
  -- Assign default 'tester' role to new user
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'tester'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();