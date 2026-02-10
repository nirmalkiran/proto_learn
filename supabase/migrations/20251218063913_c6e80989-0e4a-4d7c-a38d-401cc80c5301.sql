-- Create a function for semantic similarity search using pgvector
CREATE OR REPLACE FUNCTION match_qa_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5,
  p_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  artifact_type text,
  artifact_id uuid,
  content text,
  metadata jsonb,
  is_approved boolean,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    qe.id,
    qe.project_id,
    qe.artifact_type,
    qe.artifact_id,
    qe.content,
    qe.metadata,
    qe.is_approved,
    1 - (qe.embedding <=> query_embedding) AS similarity
  FROM qa_embeddings qe
  WHERE 
    (p_project_id IS NULL OR qe.project_id = p_project_id)
    AND qe.is_approved = true
    AND 1 - (qe.embedding <=> query_embedding) > match_threshold
  ORDER BY qe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;