-- Create storage bucket for agent artifacts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-artifacts',
  'agent-artifacts',
  false,
  52428800, -- 50MB limit
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'application/json', 'text/plain', 'application/zip']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for agent-artifacts bucket
CREATE POLICY "Agents can upload artifacts"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'agent-artifacts');

CREATE POLICY "Authenticated users can view artifacts"
ON storage.objects
FOR SELECT
USING (bucket_id = 'agent-artifacts' AND auth.role() = 'authenticated');

CREATE POLICY "Service role can manage all artifacts"
ON storage.objects
FOR ALL
USING (bucket_id = 'agent-artifacts')
WITH CHECK (bucket_id = 'agent-artifacts');