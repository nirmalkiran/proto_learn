-- Align self_hosted_agents to reference schema; additive/backfill only (no drops)
-- Safe for existing data: fill nulls before setting NOT NULL where practical.

-- 1) Ensure columns exist
ALTER TABLE public.self_hosted_agents
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS agent_id TEXT,
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS api_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS running_jobs INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS browsers TEXT[] DEFAULT ARRAY['chromium'],
  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS user_id UUID;

-- 2) Backfill existing rows to avoid NOT NULL violations
UPDATE public.self_hosted_agents
SET
  agent_id       = COALESCE(agent_id, id::text),
  agent_name     = COALESCE(agent_name, agent_id, 'unnamed-agent'),
  api_token_hash = COALESCE(api_token_hash, 'legacy-token-' || md5(gen_random_uuid()::text)),
  status         = COALESCE(status, 'offline'),
  capacity       = COALESCE(capacity, 4),
  running_jobs   = COALESCE(running_jobs, 0),
  config         = COALESCE(config, '{}'::jsonb),
  browsers       = COALESCE(browsers, ARRAY['chromium']),
  created_at     = COALESCE(created_at, now()),
  updated_at     = COALESCE(updated_at, now())
WHERE TRUE;

-- 3) Add indexes if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='self_hosted_agents' AND indexname='self_hosted_agents_agent_id_key'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX self_hosted_agents_agent_id_key ON public.self_hosted_agents(agent_id);
    EXCEPTION WHEN duplicate_table THEN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='self_hosted_agents' AND indexname='idx_self_hosted_agents_project'
  ) THEN
    CREATE INDEX idx_self_hosted_agents_project ON public.self_hosted_agents(project_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='self_hosted_agents' AND indexname='idx_self_hosted_agents_status'
  ) THEN
    CREATE INDEX idx_self_hosted_agents_status ON public.self_hosted_agents(status);
  END IF;
END;
$$;

-- 4) Tighten constraints where safe (agent_id, agent_name, api_token_hash, status, capacity, running_jobs)
ALTER TABLE public.self_hosted_agents
  ALTER COLUMN agent_id SET NOT NULL,
  ALTER COLUMN agent_name SET NOT NULL,
  ALTER COLUMN api_token_hash SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN capacity SET NOT NULL,
  ALTER COLUMN running_jobs SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- Note: project_id/user_id remain nullable to avoid blocking legacy rows; adjust later if desired.
