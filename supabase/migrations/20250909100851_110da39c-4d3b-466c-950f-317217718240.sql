-- Fix the handle_new_user function by setting proper search_path
-- The issue is that the function has an empty search_path but references app_role type
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Insert into profiles table
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.email
  );
  
  -- Assign default 'tester' role to new user
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'tester'::app_role);
  
  RETURN NEW;
END;
$$;