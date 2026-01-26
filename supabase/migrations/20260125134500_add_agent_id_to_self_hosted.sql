-- Add agent_id column to self_hosted_agents if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='self_hosted_agents' AND column_name='agent_id') THEN
    ALTER TABLE public.self_hosted_agents ADD COLUMN agent_id text;
    CREATE UNIQUE INDEX idx_self_hosted_agents_agent_id ON public.self_hosted_agents(agent_id);
  END IF;
END $$;
