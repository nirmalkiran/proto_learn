-- Create storage bucket for visual baselines
INSERT INTO storage.buckets (id, name, public)
VALUES ('visual-baselines', 'visual-baselines', false)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for visual-baselines bucket
CREATE POLICY "Allow authenticated users to view visual baselines"
ON storage.objects FOR SELECT
USING (bucket_id = 'visual-baselines' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to upload visual baselines"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'visual-baselines' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update visual baselines"
ON storage.objects FOR UPDATE
USING (bucket_id = 'visual-baselines' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to delete visual baselines"
ON storage.objects FOR DELETE
USING (bucket_id = 'visual-baselines' AND auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access to visual baselines"
ON storage.objects FOR ALL
USING (bucket_id = 'visual-baselines')
WITH CHECK (bucket_id = 'visual-baselines');

-- Add column to track if baseline is stored as URL
ALTER TABLE public.nocode_visual_baselines 
ADD COLUMN IF NOT EXISTS baseline_storage_path TEXT,
ADD COLUMN IF NOT EXISTS baseline_type TEXT DEFAULT 'base64';