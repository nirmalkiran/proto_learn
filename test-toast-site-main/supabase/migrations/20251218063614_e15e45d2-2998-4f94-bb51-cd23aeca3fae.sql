-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Table to store vector embeddings of QA artifacts
CREATE TABLE public.qa_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL, -- 'test_case', 'automation_step', 'defect', 'user_story'
  artifact_id UUID NOT NULL,
  content TEXT NOT NULL, -- Original text content
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional context (priority, tags, etc.)
  is_approved BOOLEAN DEFAULT false,
  approval_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Table to store feedback on AI-generated content
CREATE TABLE public.qa_ai_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL, -- 'test_case', 'automation_step', 'defect_analysis'
  artifact_id UUID,
  action TEXT NOT NULL, -- 'approved', 'edited', 'rejected'
  original_content TEXT NOT NULL,
  edited_content TEXT, -- NULL if approved without edits
  feedback_notes TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to track proven patterns that work well
CREATE TABLE public.qa_proven_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_type TEXT NOT NULL, -- 'test_case_template', 'automation_flow', 'defect_resolution'
  pattern_name TEXT NOT NULL,
  pattern_content JSONB NOT NULL, -- Structured pattern data
  description TEXT,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  confidence_score NUMERIC(3,2) DEFAULT 0.50, -- 0.00 to 1.00
  project_ids UUID[] DEFAULT '{}', -- Projects where this pattern is used
  tags TEXT[] DEFAULT '{}',
  is_global BOOLEAN DEFAULT false, -- Available across all projects
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Table to store organization QA standards
CREATE TABLE public.qa_standards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  standard_type TEXT NOT NULL, -- 'test_case_format', 'naming_convention', 'priority_rules', 'automation_guidelines'
  name TEXT NOT NULL,
  rules JSONB NOT NULL, -- Structured rules
  examples JSONB DEFAULT '[]'::jsonb, -- Example implementations
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX idx_qa_embeddings_project ON public.qa_embeddings(project_id);
CREATE INDEX idx_qa_embeddings_artifact ON public.qa_embeddings(artifact_type, artifact_id);
CREATE INDEX idx_qa_embeddings_approved ON public.qa_embeddings(is_approved) WHERE is_approved = true;

CREATE INDEX idx_qa_ai_feedback_project ON public.qa_ai_feedback(project_id);
CREATE INDEX idx_qa_ai_feedback_artifact ON public.qa_ai_feedback(artifact_type, artifact_id);
CREATE INDEX idx_qa_ai_feedback_user ON public.qa_ai_feedback(user_id);

CREATE INDEX idx_qa_proven_patterns_type ON public.qa_proven_patterns(pattern_type);
CREATE INDEX idx_qa_proven_patterns_confidence ON public.qa_proven_patterns(confidence_score DESC);
CREATE INDEX idx_qa_proven_patterns_global ON public.qa_proven_patterns(is_global) WHERE is_global = true;

CREATE INDEX idx_qa_standards_project ON public.qa_standards(project_id);
CREATE INDEX idx_qa_standards_type ON public.qa_standards(standard_type);

-- Enable Row Level Security
ALTER TABLE public.qa_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_proven_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_standards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for qa_embeddings
CREATE POLICY "Users can view embeddings for their projects"
ON public.qa_embeddings FOR SELECT
USING (is_project_member(project_id, auth.uid()) OR 
       EXISTS (SELECT 1 FROM projects WHERE projects.id = qa_embeddings.project_id AND projects.created_by = auth.uid()));

CREATE POLICY "Users can create embeddings for their projects"
ON public.qa_embeddings FOR INSERT
WITH CHECK (is_project_member(project_id, auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Users can update embeddings in their projects"
ON public.qa_embeddings FOR UPDATE
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Users can delete embeddings in their projects"
ON public.qa_embeddings FOR DELETE
USING (is_project_member(project_id, auth.uid()));

-- RLS Policies for qa_ai_feedback
CREATE POLICY "Users can view feedback for their projects"
ON public.qa_ai_feedback FOR SELECT
USING (is_project_member(project_id, auth.uid()) OR 
       EXISTS (SELECT 1 FROM projects WHERE projects.id = qa_ai_feedback.project_id AND projects.created_by = auth.uid()));

CREATE POLICY "Users can create feedback"
ON public.qa_ai_feedback FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own feedback"
ON public.qa_ai_feedback FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own feedback"
ON public.qa_ai_feedback FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for qa_proven_patterns
CREATE POLICY "Users can view global patterns or patterns from their projects"
ON public.qa_proven_patterns FOR SELECT
USING (is_global = true OR 
       auth.uid() = created_by OR
       EXISTS (SELECT 1 FROM unnest(project_ids) AS pid WHERE is_project_member(pid, auth.uid())));

CREATE POLICY "Users can create patterns"
ON public.qa_proven_patterns FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own patterns"
ON public.qa_proven_patterns FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own patterns"
ON public.qa_proven_patterns FOR DELETE
USING (auth.uid() = created_by);

-- RLS Policies for qa_standards
CREATE POLICY "Users can view standards for their projects"
ON public.qa_standards FOR SELECT
USING (is_project_member(project_id, auth.uid()) OR 
       EXISTS (SELECT 1 FROM projects WHERE projects.id = qa_standards.project_id AND projects.created_by = auth.uid()));

CREATE POLICY "Users can create standards for their projects"
ON public.qa_standards FOR INSERT
WITH CHECK (is_project_member(project_id, auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Users can update standards in their projects"
ON public.qa_standards FOR UPDATE
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Users can delete standards in their projects"
ON public.qa_standards FOR DELETE
USING (is_project_member(project_id, auth.uid()));

-- Trigger for updating updated_at timestamps
CREATE TRIGGER update_qa_embeddings_updated_at
BEFORE UPDATE ON public.qa_embeddings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qa_proven_patterns_updated_at
BEFORE UPDATE ON public.qa_proven_patterns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qa_standards_updated_at
BEFORE UPDATE ON public.qa_standards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();