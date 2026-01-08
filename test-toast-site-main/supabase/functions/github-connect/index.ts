// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConnectRequest {
  projectId: string;
  repositoryUrl: string;
  accessToken: string;
  branch: string;
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

    const { projectId, repositoryUrl, accessToken, branch }: ConnectRequest = await req.json();

    // Validate GitHub repository URL
    const githubUrlPattern = /^https:\/\/github\.com\/[\w\-\.]+\/[\w\-\.]+$/;
    if (!githubUrlPattern.test(repositoryUrl)) {
      throw new Error('Invalid GitHub repository URL');
    }

    // Extract owner and repo from URL
    const urlParts = repositoryUrl.replace('https://github.com/', '').split('/');
    const owner = urlParts[0];
    const repo = urlParts[1];

    // Validate access token by making a test API call
    console.log(`Attempting to connect to repository: ${owner}/${repo}`);
    
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Supabase-Function',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    console.log(`GitHub API response status: ${response.status}`);
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`GitHub API error response: Status ${response.status}, Body: ${errorBody}`);
      
      if (response.status === 401) {
        throw new Error('Invalid access token. Please check your GitHub token permissions.');
      } else if (response.status === 404) {
        throw new Error('Repository not found or access denied. Please check the repository URL and token permissions.');
      } else if (response.status === 403) {
        throw new Error('Access forbidden. Your token may not have the required permissions for this repository.');
      } else {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }
    }

    const repoData = await response.json();

    // Check if the branch exists
    const branchResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Supabase-Function',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!branchResponse.ok) {
      console.error(`Branch check failed: Status ${branchResponse.status}`);
      throw new Error(`Branch '${branch}' not found in repository. Please check the branch name.`);
    }

    // Encrypt and store the access token (simplified encryption for demo)
    const encryptedToken = btoa(accessToken); // In production, use proper encryption

    // Update project with repository information
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        git_repository_url: repositoryUrl,
        git_branch: branch,
        git_access_token_encrypted: encryptedToken,
        git_sync_status: 'connected',
        git_last_sync: new Date().toISOString(),
      })
      .eq('id', projectId);

    if (updateError) {
      throw updateError;
    }

    // Fetch repository file structure
    await syncRepositoryFiles(supabase, projectId, owner, repo, branch, accessToken);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Repository connected successfully',
        repository: {
          name: repoData.name,
          full_name: repoData.full_name,
          private: repoData.private,
          default_branch: repoData.default_branch,
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('GitHub connect error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to connect repository'
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
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Supabase-Function',
        'X-GitHub-Api-Version': '2022-11-28'
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

    // Clear existing files for this project
    await supabase
      .from('git_files')
      .delete()
      .eq('project_id', projectId);

    // Insert new files
    for (const file of files.slice(0, 50)) { // Limit to prevent overwhelming the database
      try {
        // Get file content
        const contentResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'Supabase-Function',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });

        if (contentResponse.ok) {
          const contentData = await contentResponse.json();
          const content = contentData.encoding === 'base64' ? atob(contentData.content) : contentData.content;

          await supabase
            .from('git_files')
            .insert({
              project_id: projectId,
              file_path: file.path,
              file_content: content,
              file_hash: file.sha,
              file_type: getFileType(file.path),
              last_modified: new Date().toISOString(),
            });
        }
      } catch (fileError) {
        console.error(`Error processing file ${file.path}:`, fileError);
        // Continue with other files
      }
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