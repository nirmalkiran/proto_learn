-- Ensure name column exists and is nullable to avoid registration failures
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'self_hosted_agents' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.self_hosted_agents
      ADD COLUMN name TEXT;
  END IF;

  -- Relax NOT NULL if it was set
  BEGIN
    ALTER TABLE public.self_hosted_agents
      ALTER COLUMN name DROP NOT NULL;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;
END;
$$;
