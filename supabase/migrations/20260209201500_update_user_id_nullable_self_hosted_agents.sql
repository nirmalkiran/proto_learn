-- Ensure user_id column exists and is nullable to allow agent registration without a user context
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'self_hosted_agents' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.self_hosted_agents
      ADD COLUMN user_id UUID;
  END IF;

  -- Relax NOT NULL if present
  BEGIN
    ALTER TABLE public.self_hosted_agents
      ALTER COLUMN user_id DROP NOT NULL;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;
END;
$$;
