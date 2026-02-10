-- WARNING: This migration drops and recreates self_hosted_agents.
-- All existing rows in self_hosted_agents will be lost.
-- Ensure you have backups before running in production.

DROP TABLE IF EXISTS public.self_hosted_agents CASCADE;

CREATE TABLE public.self_hosted_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_id TEXT UNIQUE NOT NULL,          -- e.g., "WISPR-RUNNER-IND-01"
  agent_name TEXT NOT NULL,
  api_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline', -- online, offline, busy
  capacity INTEGER NOT NULL DEFAULT 4,
  running_jobs INTEGER NOT NULL DEFAULT 0,
  config JSONB DEFAULT '{}'::jsonb,       -- agent.config.json settings
  browsers TEXT[] DEFAULT ARRAY['chromium'],
  last_heartbeat TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_self_hosted_agents_project ON public.self_hosted_agents(project_id);
CREATE INDEX idx_self_hosted_agents_status ON public.self_hosted_agents(status);
