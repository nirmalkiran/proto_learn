-- Ensure agent_job_queue has required columns to support agent polling
ALTER TABLE public.agent_job_queue
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.self_hosted_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- Backfill defaults to avoid NOT NULL issues later if constraints are tightened
UPDATE public.agent_job_queue
SET
  status = COALESCE(status, 'pending'),
  priority = COALESCE(priority, 0),
  created_at = COALESCE(created_at, now())
WHERE TRUE;

-- Helpful indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='agent_job_queue' AND indexname='idx_agent_job_queue_project'
  ) THEN
    CREATE INDEX idx_agent_job_queue_project ON public.agent_job_queue(project_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='agent_job_queue' AND indexname='idx_agent_job_queue_status'
  ) THEN
    CREATE INDEX idx_agent_job_queue_status ON public.agent_job_queue(status);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='agent_job_queue' AND indexname='idx_agent_job_queue_agent'
  ) THEN
    CREATE INDEX idx_agent_job_queue_agent ON public.agent_job_queue(agent_id);
  END IF;
END;
$$;
