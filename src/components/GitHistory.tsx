import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GitCommit, Calendar, User, MessageSquare, Upload } from "lucide-react";

interface GitCommitData {
  id: string;
  commit_hash: string;
  message: string | null;
  author: string | null;
  committed_at: string;
  project_id: string;
  user_id: string;
  created_at: string;
}

interface GitHistoryProps {
  projectId: string;
}

const GitHistory: React.FC<GitHistoryProps> = ({ projectId }) => {
  const { toast } = useToast();
  const [commits, setCommits] = useState<GitCommitData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    fetchCommits();
  }, [projectId]);

  const fetchCommits = async () => {
    try {
      const { data, error } = await supabase
        .from("git_commits")
        .select("*")
        .eq("project_id", projectId)
        .order("committed_at", { ascending: false });

      if (error) throw error;
      setCommits(data || []);
    } catch (error) {
      console.error("Error fetching commits:", error);
      toast({
        title: "Error",
        description: "Failed to load commit history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createCommit = async () => {
    if (!commitMessage.trim()) {
      toast({
        title: "Error",
        description: "Please enter a commit message",
        variant: "destructive",
      });
      return;
    }

    setCommitting(true);
    try {
      // Call edge function to commit and push changes
      const { data, error } = await supabase.functions.invoke("github-commit", {
        body: {
          projectId,
          message: commitMessage,
        },
      });

      if (error) throw error;

      setCommitMessage("");
      setShowCommitDialog(false);
      await fetchCommits();

      toast({
        title: "Success",
        description: "Changes committed and pushed successfully",
      });
    } catch (error: any) {
      console.error("Error creating commit:", error);
      toast({
        title: "Commit Failed",
        description: error.message || "Failed to commit changes",
        variant: "destructive",
      });
    } finally {
      setCommitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  const getCommitAvatarUrl = (email: string) => {
    // Simple Gravatar implementation
    const hash = btoa(email.toLowerCase().trim()).replace(/=/g, '');
    return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=32`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <GitCommit className="w-5 h-5" />
            Commit History
          </CardTitle>
          <Dialog open={showCommitDialog} onOpenChange={setShowCommitDialog}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="w-4 h-4 mr-2" />
                Commit & Push
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Commit Changes</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  placeholder="Commit message..."
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  rows={3}
                />
                <Button onClick={createCommit} disabled={committing}>
                  {committing ? "Committing..." : "Commit & Push"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : commits.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <GitCommit className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No commits yet</p>
            <p className="text-sm">Make your first commit to see history here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {commits.map((commit) => (
              <div
                key={commit.id}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={getCommitAvatarUrl(commit.author || 'unknown')}
                    alt={commit.author || 'Unknown'}
                    className="w-8 h-8 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm truncate">
                        {commit.message || 'No message'}
                      </p>
                      <Badge variant="outline" className="text-xs font-mono">
                        {commit.commit_hash.substring(0, 7)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {commit.author || 'Unknown'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(commit.committed_at)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GitHistory;