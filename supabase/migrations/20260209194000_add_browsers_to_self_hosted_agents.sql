diff --git a/c:\Users\NirmalKiran\Documents\WISPR_DATA\proto_learn\supabase/migrations/20260209200000_sync_self_hosted_agents_columns.sql b/c:\Users\NirmalKiran\Documents\WISPR_DATA\proto_learn\supabase/migrations/20260209200000_sync_self_hosted_agents_columns.sql
new file mode 100644
--- /dev/null
+++ b/c:\Users\NirmalKiran\Documents\WISPR_DATA\proto_learn\supabase/migrations/20260209200000_sync_self_hosted_agents_columns.sql
@@ -0,0 +1,61 @@
+-- Align self_hosted_agents schema to support agent registration (no drops; only additive/alter)
+-- Mirrors the reference schema used in test-toast-site-main(6)
+
+-- Core columns
+ALTER TABLE public.self_hosted_agents
+  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
+  ADD COLUMN IF NOT EXISTS agent_id TEXT,
+  ADD COLUMN IF NOT EXISTS agent_name TEXT,
+  ADD COLUMN IF NOT EXISTS api_token_hash TEXT,
+  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline',
+  ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4,
+  ADD COLUMN IF NOT EXISTS running_jobs INTEGER DEFAULT 0,
+  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb,
+  ADD COLUMN IF NOT EXISTS browsers TEXT[] DEFAULT ARRAY['chromium'],
+  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ,
+  ADD COLUMN IF NOT EXISTS created_by UUID,
+  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
+  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
+
+-- Optional: backfill uniqueness/index on agent_id (without forcing if it already exists)
+DO $$
+BEGIN
+  IF NOT EXISTS (
+    SELECT 1 FROM pg_indexes
+    WHERE schemaname = 'public'
+      AND tablename = 'self_hosted_agents'
+      AND indexname = 'self_hosted_agents_agent_id_key'
+  ) THEN
+    -- Use a unique index to match the reference schema; will fail if duplicates already exist
+    BEGIN
+      CREATE UNIQUE INDEX self_hosted_agents_agent_id_key ON public.self_hosted_agents(agent_id);
+    EXCEPTION WHEN duplicate_table THEN
+      -- ignore if it races
+      NULL;
+    END;
+  END IF;
+END;
+$$;
+
+-- Optional: project_id/status indexes for faster lookups (safe, additive)
+DO $$
+BEGIN
+  IF NOT EXISTS (
+    SELECT 1 FROM pg_indexes
+    WHERE schemaname = 'public'
+      AND tablename = 'self_hosted_agents'
+      AND indexname = 'idx_self_hosted_agents_project'
+  ) THEN
+    CREATE INDEX idx_self_hosted_agents_project ON public.self_hosted_agents(project_id);
+  END IF;
+
+  IF NOT EXISTS (
+    SELECT 1 FROM pg_indexes
+    WHERE schemaname = 'public'
+      AND tablename = 'self_hosted_agents'
+      AND indexname = 'idx_self_hosted_agents_status'
+  ) THEN
+    CREATE INDEX idx_self_hosted_agents_status ON public.self_hosted_agents(status);
+  END IF;
+END;
+$$;
