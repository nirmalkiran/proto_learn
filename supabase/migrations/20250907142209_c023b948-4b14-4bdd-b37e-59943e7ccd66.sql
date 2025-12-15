-- Add git repository fields to projects table
ALTER TABLE public.projects 
ADD COLUMN git_repository_url TEXT,
ADD COLUMN git_branch TEXT DEFAULT 'main',
ADD COLUMN git_access_token_encrypted TEXT,
ADD COLUMN git_last_sync TIMESTAMP WITH TIME ZONE,
ADD COLUMN git_sync_status TEXT DEFAULT 'disconnected' CHECK (git_sync_status IN ('connected', 'error', 'syncing', 'disconnected'));

-- Create git_files table to track repository file structure
CREATE TABLE public.git_files (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_content TEXT,
    file_hash TEXT,
    file_type TEXT,
    last_modified TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(project_id, file_path)
);

-- Create git_commits table to track commit history
CREATE TABLE public.git_commits (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL,
    author_name TEXT,
    author_email TEXT,
    committed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(project_id, commit_hash)
);

-- Enable RLS on new tables
ALTER TABLE public.git_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.git_commits ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for git_files
CREATE POLICY "Project members can view git files" 
ON public.git_files 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.projects 
        WHERE projects.id = git_files.project_id 
        AND projects.created_by = auth.uid()
    ) 
    OR is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can create git files" 
ON public.git_files 
FOR INSERT 
WITH CHECK (is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can update git files" 
ON public.git_files 
FOR UPDATE 
USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can delete git files" 
ON public.git_files 
FOR DELETE 
USING (is_project_member(project_id, auth.uid()));

-- Create RLS policies for git_commits
CREATE POLICY "Project members can view git commits" 
ON public.git_commits 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.projects 
        WHERE projects.id = git_commits.project_id 
        AND projects.created_by = auth.uid()
    ) 
    OR is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can create git commits" 
ON public.git_commits 
FOR INSERT 
WITH CHECK (is_project_member(project_id, auth.uid()));

-- Add triggers for updated_at
CREATE TRIGGER update_git_files_updated_at
    BEFORE UPDATE ON public.git_files
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for better performance
CREATE INDEX idx_git_files_project_id ON public.git_files(project_id);
CREATE INDEX idx_git_files_file_path ON public.git_files(file_path);
CREATE INDEX idx_git_commits_project_id ON public.git_commits(project_id);
CREATE INDEX idx_git_commits_committed_at ON public.git_commits(committed_at DESC);