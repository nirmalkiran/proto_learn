-- Ensure self_hosted_agents has api_token_hash column (needed for agent registration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'self_hosted_agents' AND column_name = 'api_token_hash'
  ) THEN
    ALTER TABLE public.self_hosted_agents
      ADD COLUMN api_token_hash TEXT;
  END IF;
END;
$$;

-- Optional: enforce NOT NULL if column exists but is nullable and you want parity with reference
-- Uncomment after backfilling if desired.
-- ALTER TABLE public.self_hosted_agents
--   ALTER COLUMN api_token_hash SET NOT NULL;
