// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncRequest {
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

    const { projectId }: SyncRequest = await req.json();

    // Get project git configuration
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('git_repository_url, git_branch, git_access_token_encrypted')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      throw new Error('Project not found or not connected to a repository');
    }

    if (!project.git_repository_url || !project.git_access_token_encrypted) {
      throw new Error('Repository not configured for this project');
    }

    // Decrypt access token (simplified decryption for demo)
    const accessToken = atob(project.git_access_token_encrypted);

    // Extract owner and repo from URL
    const urlParts = project.git_repository_url.replace('https://github.com/', '').split('/');
    const owner = urlParts[0];
    const repo = urlParts[1];
    const branch = project.git_branch || 'main';

    // Update sync status
    await supabase
      .from('projects')
      .update({ git_sync_status: 'syncing' })
      .eq('id', projectId);

    // Sync repository files
    await syncRepositoryFiles(supabase, projectId, owner, repo, branch, accessToken);

    // Update sync status and timestamp
    await supabase
      .from('projects')
      .update({
        git_sync_status: 'connected',
        git_last_sync: new Date().toISOString(),
      })
      .eq('id', projectId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Repository synchronized successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('GitHub sync error:', error);

    // Update sync status to error
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const { projectId } = await req.json();
      await supabase
        .from('projects')
        .update({ git_sync_status: 'error' })
        .eq('id', projectId);
    } catch (updateError) {
      console.error('Error updating sync status:', updateError);
    }

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to sync repository'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

async function syncRepositoryFiles(supabase: any, projectId: string, owner: string, repo: string, branch: string, accessToken: string) {
  try {
    // Get repository tree
    const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Supabase-Function'
      }
    });

    if (!treeResponse.ok) {
      throw new Error('Failed to fetch repository tree');
    }

    const treeData = await treeResponse.json();

    // Filter for files (not directories) and common test file extensions
    const testFileExtensions = ['.java', '.py', '.js', '.ts', '.cs', '.md', '.txt', '.json', '.xml', '.yml', '.yaml'];
    const files = treeData.tree.filter((item: any) => 
      item.type === 'blob' && 
      testFileExtensions.some(ext => item.path.endsWith(ext))
    );

    // Get existing files to compare
    const { data: existingFiles } = await supabase
      .from('git_files')
      .select('file_path, file_hash')
      .eq('project_id', projectId);

    const existingFileMap = new Map(existingFiles?.map((f: any) => [f.file_path, f.file_hash]) || []);

    // Process files in smaller batches to avoid WORKER_LIMIT
    // Limit to 20 files and skip files larger than 1MB
    const MAX_FILE_SIZE = 1024 * 1024; // 1MB
    const filesToProcess = files.slice(0, 20);
    
    console.log(`Processing ${filesToProcess.length} files`);
    
    for (const file of filesToProcess) {
      try {
        // Check if file needs updating
        if (existingFileMap.get(file.path) === file.sha) {
          continue; // File hasn't changed
        }

        // Skip very large files to prevent memory issues
        if (file.size && file.size > MAX_FILE_SIZE) {
          console.log(`Skipping large file: ${file.path} (${file.size} bytes)`);
          continue;
        }

        // Get file content
        const contentResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`, {
          headers: {
            'Authorization': `token ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Supabase-Function'
          }
        });

        if (contentResponse.ok) {
          const contentData = await contentResponse.json();
          
          // Additional check for file size in response
          if (contentData.size && contentData.size > MAX_FILE_SIZE) {
            console.log(`Skipping large file from response: ${file.path} (${contentData.size} bytes)`);
            continue;
          }
          
          const content = contentData.encoding === 'base64' ? atob(contentData.content) : contentData.content;

          // Upsert file
          await supabase
            .from('git_files')
            .upsert({
              project_id: projectId,
              file_path: file.path,
              file_content: content,
              file_hash: file.sha,
              file_type: getFileType(file.path),
              last_modified: new Date().toISOString(),
            }, {
              onConflict: 'project_id,file_path'
            });
          
          // Small delay to prevent rate limiting and reduce resource usage
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (fileError) {
        console.error(`Error processing file ${file.path}:`, fileError);
        // Continue with other files
      }
    }
    
    console.log(`Completed processing ${filesToProcess.length} files`);

    // Remove files that no longer exist in the repository
    const currentFilePaths = files.map((f: any) => f.path);
    const filesToDelete = Array.from(existingFileMap.keys()).filter(path => !currentFilePaths.includes(path));

    if (filesToDelete.length > 0) {
      await supabase
        .from('git_files')
        .delete()
        .eq('project_id', projectId)
        .in('file_path', filesToDelete);
    }

  } catch (error) {
    console.error('Error syncing repository files:', error);
    throw error;
  }
}

function getFileType(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'java': return 'java';
    case 'js': return 'javascript';
    case 'ts': return 'typescript';
    case 'py': return 'python';
    case 'cs': return 'csharp';
    case 'md': return 'markdown';
    case 'json': return 'json';
    case 'xml': return 'xml';
    case 'yml':
    case 'yaml': return 'yaml';
    default: return 'text';
  }
}