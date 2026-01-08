import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Semantic search function called');

    // Get user from auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header missing' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { query, projectId, threshold = 0.7, maxResults = 10, artifactType } = body;

    if (!query || !query.trim()) {
      return new Response(
        JSON.stringify({ error: 'Search query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching for: "${query}" in project: ${projectId}`);

    // Generate embedding for the search query using Azure OpenAI
    // First, get the OpenAI config from integration_configs
    const { data: configData } = await supabase
      .from('integration_configs')
      .select('config')
      .eq('project_id', projectId)
      .eq('integration_id', 'openai')
      .single();

    let queryEmbedding: number[] | null = null;

    if (configData?.config) {
      const azureConfig = configData.config as any;
      
      if (azureConfig.endpoint && azureConfig.apiKey) {
        try {
          // Use configured embedding deployment or default to text-embedding-3-small
          const embeddingDeployment = azureConfig.embeddingDeployment || 'text-embedding-3-small';
          const apiVersion = azureConfig.apiVersion || '2024-02-15-preview';
          const embeddingEndpoint = `${azureConfig.endpoint}/openai/deployments/${embeddingDeployment}/embeddings?api-version=${apiVersion}`;
          
          console.log(`Using embedding deployment: ${embeddingDeployment}`);
          
          const embeddingResponse = await fetch(embeddingEndpoint, {
            method: 'POST',
            headers: {
              'api-key': azureConfig.apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              input: query,
            }),
          });

          if (embeddingResponse.ok) {
            const embeddingData = await embeddingResponse.json();
            queryEmbedding = embeddingData.data[0].embedding;
            console.log('Generated embedding with Azure OpenAI');
          } else {
            console.error('Failed to generate embedding:', await embeddingResponse.text());
          }
        } catch (embeddingError) {
          console.error('Error generating embedding:', embeddingError);
        }
      }
    }

    // If we have an embedding, use vector similarity search
    if (queryEmbedding) {
      // Use the match_qa_embeddings function
      const { data: matchResults, error: matchError } = await supabase.rpc('match_qa_embeddings', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: threshold,
        match_count: maxResults,
        p_project_id: projectId || null,
      });

      if (matchError) {
        console.error('Match error:', matchError);
        throw matchError;
      }

      // Filter by artifact type if specified
      let filteredResults = matchResults || [];
      if (artifactType) {
        filteredResults = filteredResults.filter((r: any) => r.artifact_type === artifactType);
      }

      console.log(`Found ${filteredResults.length} matching artifacts using vector search (threshold: ${threshold})`);
      
      // Log similarity scores for debugging
      if (filteredResults.length > 0) {
        const similarities = filteredResults.map((r: any) => r.similarity.toFixed(3));
        console.log(`Similarity scores: ${similarities.join(', ')}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          results: filteredResults,
          searchType: 'vector',
          threshold: threshold,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback to text-based search if embedding generation fails
    console.log('Falling back to text-based search');
    
    let textQuery = supabase
      .from('qa_embeddings')
      .select('id, project_id, artifact_type, artifact_id, content, metadata, is_approved')
      .eq('is_approved', true)
      .ilike('content', `%${query}%`);

    if (projectId) {
      textQuery = textQuery.eq('project_id', projectId);
    }

    if (artifactType) {
      textQuery = textQuery.eq('artifact_type', artifactType);
    }

    const { data: textResults, error: textError } = await textQuery.limit(maxResults);

    if (textError) {
      console.error('Text search error:', textError);
      throw textError;
    }

    // Add a fake similarity score for text results
    const resultsWithSimilarity = (textResults || []).map((r: any) => ({
      ...r,
      similarity: 0.7, // Placeholder similarity for text matches
    }));

    console.log(`Found ${resultsWithSimilarity.length} matching artifacts using text search`);

    return new Response(
      JSON.stringify({
        success: true,
        results: resultsWithSimilarity,
        searchType: 'text',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in semantic-search function:', error);
    return new Response(
      JSON.stringify({
        error: 'Search failed',
        details: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
