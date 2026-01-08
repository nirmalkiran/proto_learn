import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DownloadRequest {
  projectId: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { projectId }: DownloadRequest = await req.json();

    console.log('Repository download request for project:', projectId);

    // Get project info
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('name, git_repository_url, git_branch')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      throw new Error('Project not found');
    }

    console.log(`Project: ${project.name}, Repository: ${project.git_repository_url}`);

    // Check if files exist in database
    const { count, error: countError } = await supabase
      .from('git_files')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    if (countError) {
      throw new Error(`Failed to check files: ${countError.message}`);
    }

    console.log(`Found ${count || 0} files in database`);

    if (!count || count === 0) {
      throw new Error('No files found in database. Please sync the repository first.');
    }

    // Return success with project info
    // Client will fetch files directly from database to avoid memory issues
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          projectName: project.name,
          repositoryUrl: project.git_repository_url,
          branch: project.git_branch || 'main',
          fileCount: count
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Repository download error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to prepare repository download'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
