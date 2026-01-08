// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CommitRequest {
  projectId: string;
  message: string;
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

    const { projectId, message }: CommitRequest = await req.json();

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

    // Get current user info for commit author
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Supabase-Function'
      }
    });

    if (!userResponse.ok) {
      throw new Error('Failed to get user information');
    }

    const userData = await userResponse.json();

    // Get modified files from database
    const { data: modifiedFiles, error: filesError } = await supabase
      .from('git_files')
      .select('file_path, file_content')
      .eq('project_id', projectId);

    if (filesError || !modifiedFiles || modifiedFiles.length === 0) {
      throw new Error('No files to commit');
    }

    // Get the latest commit SHA for the branch
    const branchResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}`, {
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Supabase-Function'
      }
    });

    if (!branchResponse.ok) {
      throw new Error('Failed to get branch information');
    }

    const branchData = await branchResponse.json();
    const latestCommitSha = branchData.commit.sha;

    // Create a new tree with the modified files
    const treeItems = modifiedFiles.map(file => ({
      path: file.file_path,
      mode: '100644',
      type: 'blob',
      content: file.file_content
    }));

    const createTreeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Supabase-Function',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tree: treeItems,
        base_tree: latestCommitSha
      })
    });

    if (!createTreeResponse.ok) {
      const errorData = await createTreeResponse.json();
      throw new Error(`Failed to create tree: ${errorData.message}`);
    }

    const treeData = await createTreeResponse.json();

    // Create a new commit
    const createCommitResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Supabase-Function',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        tree: treeData.sha,
        parents: [latestCommitSha],
        author: {
          name: userData.name || userData.login,
          email: userData.email || `${userData.login}@users.noreply.github.com`,
          date: new Date().toISOString()
        },
        committer: {
          name: userData.name || userData.login,
          email: userData.email || `${userData.login}@users.noreply.github.com`,
          date: new Date().toISOString()
        }
      })
    });

    if (!createCommitResponse.ok) {
      const errorData = await createCommitResponse.json();
      throw new Error(`Failed to create commit: ${errorData.message}`);
    }

    const commitData = await createCommitResponse.json();

    // Update the branch reference
    const updateRefResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Supabase-Function',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sha: commitData.sha
      })
    });

    if (!updateRefResponse.ok) {
      const errorData = await updateRefResponse.json();
      throw new Error(`Failed to update branch: ${errorData.message}`);
    }

    // Store commit in database
    await supabase
      .from('git_commits')
      .insert({
        project_id: projectId,
        commit_hash: commitData.sha,
        commit_message: message,
        author_name: userData.name || userData.login,
        author_email: userData.email || `${userData.login}@users.noreply.github.com`,
        committed_at: new Date().toISOString(),
      });

    // Update project sync status
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
        message: 'Changes committed and pushed successfully',
        commit: {
          sha: commitData.sha,
          message: message,
          author: userData.name || userData.login,
          url: commitData.html_url
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('GitHub commit error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to commit changes'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});