-- Create storage bucket for test plan templates
INSERT INTO storage.buckets (id, name, public) VALUES ('test-plan-templates', 'test-plan-templates', false);

-- Create policies for test plan templates bucket
CREATE POLICY "Users can view their own templates" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'test-plan-templates' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own templates" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'test-plan-templates' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own templates" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'test-plan-templates' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own templates" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'test-plan-templates' AND auth.uid()::text = (storage.foldername(name))[1]);