-- Create or replace function to handle new user authentication
-- This will link Azure AD users to existing profiles or create new ones
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  existing_profile_id uuid;
BEGIN
  -- Extract email from new user
  user_email := NEW.email;
  
  -- Check if a profile already exists with this email
  SELECT id INTO existing_profile_id
  FROM public.profiles
  WHERE email = user_email
  LIMIT 1;
  
  IF existing_profile_id IS NOT NULL THEN
    -- Update existing profile with new user_id (Azure AD user)
    UPDATE public.profiles
    SET user_id = NEW.id,
        updated_at = now()
    WHERE id = existing_profile_id;
  ELSE
    -- Create new profile
    INSERT INTO public.profiles (user_id, email, display_name, created_at, updated_at)
    VALUES (
      NEW.id,
      user_email,
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(user_email, '@', 1)
      ),
      now(),
      now()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to automatically handle user profile on signup/login
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();