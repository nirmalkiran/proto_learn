import { useState, useEffect } from "react";
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { publicProjectIds } from "@/config/features";
import {
  Plus,
  FileText,
  Bot,
  ExternalLink,
  Settings,
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  Cloud,
  Trash2,
  CheckSquare,
  Square,
  Code,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { sanitizeHtml } from "@/lib/security";
import { JavaGenerationDialog } from "./JavaGenerationDialog";

interface TestCase {
  id: string;
  title: string;
  description: string;
  steps: string[];
  expectedResult: string;
  priority: "low" | "medium" | "high";
  status: "not-run" | "passed" | "failed" | "blocked";
  userStoryId: string;
  userStoryTitle: string;
  estimatedTime: string;
}

interface UserStory {
  id: string;
  readable_id?: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  source: "manual" | "jira" | "azure";
  priority: "low" | "medium" | "high";
  status: "draft" | "ready" | "in-progress" | "completed";
  testCasesGenerated: number;
  boardId?: string;
  boardName?: string;
  sprintId?: string;
  sprintName?: string;
}

interface UserStoriesProps {
  onViewChange: (view: string) => void;
  projectId: string;
}

export const UserStories = ({ onViewChange, projectId }: UserStoriesProps) => {
  const { toast } = useToast();
  const { session } = useAuth();
  const [stories, setStories] = useState<UserStory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [generatingTestCases, setGeneratingTestCases] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newStory, setNewStory] = useState<{
    title: string;
    description: string;
    acceptanceCriteria: string;
    priority: "low" | "medium" | "high";
  }>({
    title: "",
    description: "",
    acceptanceCriteria: "",
    priority: "medium",
  });

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  // Board selection states
  const [selectedBoard, setSelectedBoard] = useState("all");
  const [availableBoards, setAvailableBoards] = useState<{ id: string; name: string; source: string }[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  
  // Sprint selection states
  const [selectedSprint, setSelectedSprint] = useState("all");
  const [availableSprints, setAvailableSprints] = useState<{ id: string; name: string; state: string }[]>([]);
  const [loadingSprints, setLoadingSprints] = useState(false);

  // Custom prompt states for regeneration
  const [showCustomPromptDialog, setShowCustomPromptDialog] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedStoryForRegenerate, setSelectedStoryForRegenerate] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  // Custom prompt states for initial generation
  const [showInitialGenerationDialog, setShowInitialGenerationDialog] = useState(false);
  const [selectedStoryForGeneration, setSelectedStoryForGeneration] = useState<string | null>(null);

  // Multiple selection states
  const [selectedStories, setSelectedStories] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncingSelected, setIsSyncingSelected] = useState(false);

  // Java Generation Dialog states
  const [showJavaGenerationDialog, setShowJavaGenerationDialog] = useState(false);
  const [selectedStoryForAutomation, setSelectedStoryForAutomation] = useState<string | null>(null);

  // Filtered stories
  const filteredStories = stories.filter((story) => {
    const matchesSearch =
      story.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      story.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = priorityFilter === "all" || story.priority === priorityFilter;
    const matchesStatus = statusFilter === "all" || story.status === statusFilter;
    const matchesSource = sourceFilter === "all" || story.source === sourceFilter;

    return matchesSearch && matchesPriority && matchesStatus && matchesSource;
  });

  // Group stories by board and sprint
  const groupedStories = filteredStories.reduce(
    (groups, story) => {
      const boardName = story.boardName || "No Board";
      const sprintName = story.sprintName || "No Sprint";
      
      if (!groups[boardName]) {
        groups[boardName] = {};
      }
      if (!groups[boardName][sprintName]) {
        groups[boardName][sprintName] = [];
      }
      groups[boardName][sprintName].push(story);
      return groups;
    },
    {} as Record<string, Record<string, UserStory[]>>,
  );

  // Sort board names to ensure consistent ordering
  const sortedBoardNames = Object.keys(groupedStories).sort((a, b) => {
    // Put "No Board" last
    if (a === "No Board") return 1;
    if (b === "No Board") return -1;
    return a.localeCompare(b);
  });

  // Load saved configurations from database (project-specific)
  const loadSavedConfigurations = async (): Promise<any> => {
    try {
      const { data, error } = await (supabase as any)
        .from("integration_configs")
        .select("integration_id, config, enabled, last_sync")
        .eq("project_id", projectId);

      if (error || !data) {
        return {};
      }

      // Transform database records into the expected config format
      const configs: any = {};
      data.forEach((record: any) => {
        configs[record.integration_id] = {
          ...record.config,
          enabled: record.enabled,
          lastSync: record.last_sync,
        };
      });

      return configs;
    } catch {
      return {};
    }
  };

  // Fetch available boards from integrations
  const fetchAvailableBoards = async () => {
    const savedConfigs = await loadSavedConfigurations();
    const boards: { id: string; name: string; source: string }[] = [];

    console.log("Fetching available boards...", {
      jiraEnabled: savedConfigs.jira?.enabled,
      azureEnabled: savedConfigs["azure-devops"]?.enabled,
      savedConfigs: savedConfigs,
    });

    setLoadingBoards(true);

    try {
      // Fetch Jira boards
      if (
        savedConfigs.jira?.enabled &&
        savedConfigs.jira?.url &&
        savedConfigs.jira?.email &&
        savedConfigs.jira?.apiToken &&
        savedConfigs.jira?.projectKey
      ) {
        const { url, email, apiToken, projectKey } = savedConfigs.jira;

        try {
          console.log("Fetching Jira boards...");
          const response = await fetch(`https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/jira-integration`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              jiraUrl: url,
              email: email,
              apiToken: apiToken,
              projectKey: projectKey,
              action: "get-boards",
            }),
          });

          const data = await response.json();
          console.log("Jira boards response:", data);
          if (data.success && data.boards) {
            data.boards.forEach((board: any) => {
              boards.push({
                id: board.id,
                name: board.name,
                source: "jira",
              });
            });
          }
        } catch (error) {
          console.error("Failed to fetch Jira boards:", error);
        }
      }

      // Fetch Azure DevOps boards
      if (
        savedConfigs["azure-devops"]?.enabled &&
        savedConfigs["azure-devops"]?.organizationUrl &&
        savedConfigs["azure-devops"]?.projectName &&
        savedConfigs["azure-devops"]?.personalAccessToken
      ) {
        const { organizationUrl, projectName, personalAccessToken } = savedConfigs["azure-devops"];

        try {
          console.log("Fetching Azure DevOps boards...");
          const response = await fetch(
            `https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/azure-devops-integration`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                organizationUrl,
                projectName,
                personalAccessToken,
                action: "get-boards",
              }),
            },
          );

          const data = await response.json();
          console.log("Azure DevOps boards response:", data);
          if (data.success && data.boards) {
            data.boards.forEach((board: any) => {
              boards.push({
                id: board.id,
                name: board.name,
                source: "azure",
              });
            });
          }
        } catch (error) {
          console.error("Failed to fetch Azure DevOps boards:", error);
        }
      }

      console.log("Total boards found:", boards.length);
      setAvailableBoards(boards);

      if (boards.length === 0) {
        toast({
          title: "No Boards Found",
          description: "Please configure your integrations first or ensure you have boards in your configured projects",
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Error fetching boards:", error);
      toast({
        title: "Error",
        description: "Failed to fetch available boards",
        variant: "destructive",
      });
    } finally {
      setLoadingBoards(false);
    }
  };

  // Extract text from Jira's Atlassian Document Format (ADF)
  const extractTextFromJiraContent = (content: any): string => {
    if (typeof content === "string") return content;
    if (!content) return "No description available";

    if (content.content && Array.isArray(content.content)) {
      const textParts: string[] = [];

      const extractText = (node: any) => {
        if (node.type === "text" && node.text) {
          textParts.push(node.text);
        } else if (node.content && Array.isArray(node.content)) {
          node.content.forEach(extractText);
        }
      };

      content.content.forEach(extractText);
      return textParts.join(" ").trim() || "No description available";
    }

    return "No description available";
  };

  // Load stories from database for current project
  const loadStoriesFromDatabase = async () => {
    const isPublicProject = publicProjectIds.includes(projectId as any);
    if ((!session?.user?.id && !isPublicProject) || !projectId) return;

    setIsLoading(true);
    try {
      const { data: dbStories, error } = await supabase
        .from("user_stories")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const transformedStories: UserStory[] = await Promise.all(
        (dbStories || []).map(async (story) => {
          // Count test cases for this story
          const { count } = await supabase
            .from("test_cases")
            .select("*", { count: "exact", head: true })
            .eq("user_story_id", story.id)
            .eq("project_id", projectId);

          return {
            id: story.id,
            readable_id: story.readable_id,
            title: story.title,
            description: story.description || "",
            acceptanceCriteria: story.acceptance_criteria || "",
            source: "manual" as const,
            priority: story.priority as "low" | "medium" | "high",
            status: story.status as "draft" | "ready" | "in-progress" | "completed",
            testCasesGenerated: count || 0,
            boardId: story.board_id,
            boardName: story.board_name,
            sprintId: story.sprint_id,
            sprintName: story.sprint_name,
          };
        }),
      );

      setStories(transformedStories);
    } catch (error) {
      console.error("Error loading stories from database:", error);
      toast({
        title: "Error",
        description: "Failed to load user stories from database",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch available sprints based on selected board
  const fetchAvailableSprints = async () => {
    if (!selectedBoard || selectedBoard === "all") {
      setAvailableSprints([]);
      setSelectedSprint("all");
      return;
    }

    const savedConfigs = await loadSavedConfigurations();
    const selectedBoardInfo = availableBoards.find((board) => board.id === selectedBoard);
    
    if (!selectedBoardInfo) {
      return;
    }

    setLoadingSprints(true);

    try {
      if (selectedBoardInfo.source === "jira" && savedConfigs.jira?.enabled) {
        const { url, email, apiToken, projectKey } = savedConfigs.jira;
        
        const response = await fetch(`https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/jira-integration`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jiraUrl: url,
            email: email,
            apiToken: apiToken,
            projectKey: projectKey,
            boardId: selectedBoard,
            action: "get-sprints",
          }),
        });

        const data = await response.json();
        if (data.success && data.sprints) {
          setAvailableSprints(data.sprints);
        }
      } else if (selectedBoardInfo.source === "azure" && savedConfigs["azure-devops"]?.enabled) {
        const { organizationUrl, projectName, personalAccessToken } = savedConfigs["azure-devops"];
        
        const response = await fetch(`https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/azure-devops-integration`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationUrl,
            projectName,
            personalAccessToken,
            boardId: selectedBoard,
            action: "get-sprints",
          }),
        });

        const data = await response.json();
        if (data.success && data.sprints) {
          setAvailableSprints(data.sprints);
        }
      }
    } catch (error) {
      console.error("Error fetching sprints:", error);
      toast({
        title: "Error",
        description: "Failed to fetch available sprints",
        variant: "destructive",
      });
    } finally {
      setLoadingSprints(false);
    }
  };

  // Load stories from external integrations and sync to database
  const syncFromIntegrations = async (boardId?: string, sprintId?: string) => {
    if (!session?.user?.id || !projectId) {
      toast({
        title: "Error",
        description: "Please make sure you're logged in and have a project",
        variant: "destructive",
      });
      return;
    }

    // Check if user is a project member before syncing
    const { data: memberCheck } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", session.user.id)
      .single();

    if (!memberCheck) {
      toast({
        title: "Access Denied",
        description: "You must be a project member to sync user stories",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    const savedConfigs = await loadSavedConfigurations();
    let syncedCount = 0;

    try {
      // Sync Jira stories
      if (savedConfigs.jira?.enabled) {
        const { url, email, apiToken, projectKey } = savedConfigs.jira;

        if (url && email && apiToken && projectKey) {
          try {
            const requestBody: any = {
              jiraUrl: url,
              email: email,
              apiToken: apiToken,
              projectKey: projectKey,
            };

            // Add board filter if specific board is selected
            if (boardId && boardId !== "all") {
              const selectedBoardInfo = availableBoards.find(
                (board) => board.id === boardId && board.source === "jira",
              );
              if (selectedBoardInfo) {
                requestBody.boardId = boardId;
              }
            }
            
            // Add sprint filter if specific sprint is selected
            if (sprintId && sprintId !== "all") {
              requestBody.sprintId = sprintId;
            }

            const response = await fetch(`https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/jira-integration`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestBody),
            });

            const data = await response.json();

            if (data.success && data.stories) {
              for (const story of data.stories) {
                // Get board name from availableBoards if boardId is provided
                let storyBoardName = null;
                let storySprintName = null;
                
                if (requestBody.boardId) {
                  const selectedBoardInfo = availableBoards.find(
                    (board) => board.id === requestBody.boardId && board.source === "jira",
                  );
                  storyBoardName = selectedBoardInfo?.name || null;
                }
                
                // Get sprint name if sprintId is provided
                if (requestBody.sprintId) {
                  const selectedSprintInfo = availableSprints.find(
                    (sprint) => sprint.id === requestBody.sprintId
                  );
                  storySprintName = selectedSprintInfo?.name || null;
                }

                // Check if story already exists by title and project_id
                const { data: existingStory } = await supabase
                  .from("user_stories")
                  .select("id")
                  .eq("project_id", projectId)
                  .eq("title", story.title)
                  .single();

                if (existingStory) {
                  // Update existing story
                  const { error } = await supabase
                    .from("user_stories")
                    .update({
                      readable_id: story.key || story.id || null,
                      description: extractTextFromJiraContent(story.description),
                      acceptance_criteria: story.acceptanceCriteria || "",
                      priority: story.priority?.toLowerCase() || "medium",
                      status: story.status?.toLowerCase().replace(" ", "-") || "draft",
                      board_id: requestBody.boardId || null,
                      board_name: storyBoardName,
                      sprint_id: requestBody.sprintId || null,
                      sprint_name: storySprintName,
                    })
                    .eq("id", existingStory.id);

                  if (!error) {
                    syncedCount++;
                  }
                } else {
                  // Insert new story (let database generate UUID)
                  const { error } = await supabase.from("user_stories").insert({
                    project_id: projectId,
                    readable_id: story.key || story.id || null,
                    title: story.title,
                    description: extractTextFromJiraContent(story.description),
                    acceptance_criteria: story.acceptanceCriteria || "",
                    priority: story.priority?.toLowerCase() || "medium",
                    status: story.status?.toLowerCase().replace(" ", "-") || "draft",
                    board_id: requestBody.boardId || null,
                    board_name: storyBoardName,
                    sprint_id: requestBody.sprintId || null,
                    sprint_name: storySprintName,
                  });

                  if (!error) {
                    syncedCount++;
                  }
                }
              }
            }
          } catch (error) {
            console.error("Failed to sync Jira stories:", error);
          }
        }
      }

      // Sync Azure DevOps stories
      if (savedConfigs["azure-devops"]?.enabled) {
        const { organizationUrl, projectName, personalAccessToken } = savedConfigs["azure-devops"];

        if (organizationUrl && projectName && personalAccessToken) {
          try {
            const requestBody: any = {
              organizationUrl,
              projectName,
              personalAccessToken,
            };

            // Add board filter if specific board is selected
            if (boardId && boardId !== "all") {
              const selectedBoardInfo = availableBoards.find(
                (board) => board.id === boardId && board.source === "azure",
              );
              if (selectedBoardInfo) {
                requestBody.boardId = boardId;
              }
            }
            
            // Add sprint filter if specific sprint is selected
            if (sprintId && sprintId !== "all") {
              requestBody.sprintId = sprintId;
            }

            const response = await fetch(
              `https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/azure-devops-integration`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
              },
            );

            const data = await response.json();

            if (data.success && data.stories) {
              for (const story of data.stories) {
                // Get board name from availableBoards if boardId is provided
                let storyBoardName = null;
                let storySprintName = null;
                
                if (requestBody.boardId) {
                  const selectedBoardInfo = availableBoards.find(
                    (board) => board.id === requestBody.boardId && board.source === "azure",
                  );
                  storyBoardName = selectedBoardInfo?.name || null;
                }
                
                // Get sprint name if sprintId is provided
                if (requestBody.sprintId) {
                  const selectedSprintInfo = availableSprints.find(
                    (sprint) => sprint.id === requestBody.sprintId
                  );
                  storySprintName = selectedSprintInfo?.name || null;
                }

                // Check if story already exists by title and project_id
                const { data: existingStory } = await supabase
                  .from("user_stories")
                  .select("id")
                  .eq("project_id", projectId)
                  .eq("title", story.title)
                  .single();

                if (existingStory) {
                  // Update existing story
                  const { error } = await supabase
                    .from("user_stories")
                    .update({
                      readable_id: story.key || story.id || null,
                      description: story.description,
                      acceptance_criteria: story.acceptanceCriteria || "",
                      priority: story.priority || "medium",
                      status: story.status || "draft",
                      board_id: requestBody.boardId || null,
                      board_name: storyBoardName,
                      sprint_id: requestBody.sprintId || null,
                      sprint_name: storySprintName,
                    })
                    .eq("id", existingStory.id);

                  if (!error) {
                    syncedCount++;
                  }
                } else {
                  // Insert new story (let database generate UUID)
                  const { error } = await supabase.from("user_stories").insert({
                    project_id: projectId,
                    readable_id: story.key || story.id || null,
                    title: story.title,
                    description: story.description,
                    acceptance_criteria: story.acceptanceCriteria || "",
                    priority: story.priority || "medium",
                    status: story.status || "draft",
                    board_id: requestBody.boardId || null,
                    board_name: storyBoardName,
                    sprint_id: requestBody.sprintId || null,
                    sprint_name: storySprintName,
                  });

                  if (!error) {
                    syncedCount++;
                  }
                }
              }
            }
          } catch (error) {
            console.error("Failed to sync Azure DevOps stories:", error);
          }
        }
      }

      if (syncedCount > 0) {
        toast({
          title: "Sync Complete",
          description: `Synced ${syncedCount} user stories from external systems`,
        });
        // Reload stories from database
        await loadStoriesFromDatabase();
      } else {
        toast({
          title: "No Changes",
          description: "No new stories to sync from external systems",
        });
      }
    } catch (error) {
      console.error("Error syncing from integrations:", error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync stories from external integrations",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Load stories on component mount
  useEffect(() => {
    const isPublicProject = publicProjectIds.includes(projectId as any);
    if ((session?.user?.id || isPublicProject) && projectId) {
      loadStoriesFromDatabase();
    }
  }, [session?.user?.id, projectId]);

  // Load available boards when integrations change
  useEffect(() => {
    const checkIntegrations = async () => {
      if (session?.user?.id && projectId) {
        const savedConfigs = await loadSavedConfigurations();
        if (savedConfigs.jira?.enabled || savedConfigs["azure-devops"]?.enabled) {
          fetchAvailableBoards();
        }
      }
    };
    checkIntegrations();
  }, [session?.user?.id, projectId]);

  // Also fetch boards on component mount
  useEffect(() => {
    if (session?.user?.id && projectId) {
      fetchAvailableBoards();
    }
  }, [session?.user?.id, projectId]);

  const handleAddStory = async () => {
    if (!newStory.title || !newStory.description) {
      toast({
        title: "Error",
        description: "Please fill in title and description",
        variant: "destructive",
      });
      return;
    }

    if (!session?.user?.id || !projectId) {
      toast({
        title: "Error",
        description: "Please make sure you're logged in",
        variant: "destructive",
      });
      return;
    }

    // Check if user is a project member before creating story
    const { data: memberCheck } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", session.user.id)
      .single();

    if (!memberCheck) {
      toast({
        title: "Access Denied",
        description: "You must be a project member to create user stories",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_stories")
        .insert({
          project_id: projectId,
          title: newStory.title,
          description: newStory.description,
          acceptance_criteria: newStory.acceptanceCriteria,
          priority: newStory.priority,
          status: "draft",
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const newUserStory: UserStory = {
        id: data.id,
        title: data.title,
        description: data.description || "",
        acceptanceCriteria: data.acceptance_criteria || "",
        source: "manual",
        priority: data.priority as "low" | "medium" | "high",
        status: data.status as "draft" | "ready" | "in-progress" | "completed",
        testCasesGenerated: 0,
      };

      setStories((prev) => [newUserStory, ...prev]);
      setNewStory({ title: "", description: "", acceptanceCriteria: "", priority: "medium" });
      setShowAddForm(false);

      toast({
        title: "Success",
        description: "User story created and saved to database",
      });
    } catch (error) {
      console.error("Error creating story:", error);
      toast({
        title: "Error",
        description: "Failed to create user story",
        variant: "destructive",
      });
    }
  };

  const generateTestCases = async (storyId: string, customPrompt?: string, imageFiles?: File[]) => {
    const story = stories.find((s) => s.id === storyId);
    if (!story) return;

    if (!session?.access_token) {
      toast({
        title: "Authentication Error",
        description: "Please log in to generate test cases",
        variant: "destructive",
      });
      return;
    }

    // Check if Azure OpenAI is configured
    const savedConfigs = await loadSavedConfigurations();
    const azureConfig = savedConfigs.openai;
    if (!azureConfig?.endpoint || !azureConfig?.apiKey || !azureConfig?.deploymentId) {
      toast({
        title: "Azure OpenAI Not Configured",
        description: "Please configure Azure OpenAI in integrations first",
        variant: "destructive",
      });
      return;
    }

    setGeneratingTestCases(storyId);

    try {
      let requestBody: any = {
        story: {
          id: story.id,
          project_id: projectId,
          title: story.title,
          description: story.description,
          acceptanceCriteria: story.acceptanceCriteria,
          priority: story.priority,
          issueType: "Story",
        },
        azureConfig,
        customPrompt,
      };

      // Convert images to base64 if provided
      if (imageFiles && imageFiles.length > 0) {
        const imageDataArray = [];
        for (const image of imageFiles) {
          const reader = new FileReader();
          const imageData = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(image);
          });
          imageDataArray.push({
            data: imageData,
            type: image.type,
            name: image.name,
          });
        }
        requestBody.imageData = imageDataArray;
      }

      const response = await fetch(`https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/generate-test-cases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success && data.testCases) {
        if (!projectId) {
          throw new Error("No project selected");
        }

        // Delete existing test cases for this user story (for regeneration)
        await supabase.from("test_cases").delete().eq("user_story_id", storyId).eq("project_id", projectId);

        // Save new test cases to database
        const testCasesToInsert = data.testCases.map((testCase: any) => ({
          project_id: projectId,
          user_story_id: storyId,
          title: testCase.title || testCase.name || "Test Case",
          description: testCase.description || "",
          steps: testCase.steps ? (Array.isArray(testCase.steps) ? testCase.steps.join("\n") : testCase.steps) : "",
          expected_result: testCase.expectedResult || testCase.expected || "",
          priority: (testCase.priority || "medium").toLowerCase(),
          status: "draft",
        }));

        const { error: insertError } = await supabase.from("test_cases").insert(testCasesToInsert);

        if (insertError) {
          throw insertError;
        }

        // Update story status in database
        await supabase
          .from("user_stories")
          .update({ status: "completed" })
          .eq("id", storyId)
          .eq("project_id", projectId);

        // Update local state with actual count from database
        const updatedStories = stories.map((s) =>
          s.id === storyId ? { ...s, testCasesGenerated: data.testCases.length, status: "completed" as const } : s,
        );
        setStories(updatedStories);

        toast({
          title: "Test Cases Generated & Saved",
          description: `Generated and saved ${data.testCases.length} test cases for this story`,
        });
      }
    } catch (error) {
      console.error("Error generating test cases:", error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate test cases. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGeneratingTestCases(null);
    }
  };

  const deleteUserStory = async (storyId: string, storyTitle: string) => {
    try {
      // First delete all associated test cases
      const { error: testCasesError } = await supabase.from("test_cases").delete().eq("user_story_id", storyId);

      if (testCasesError) throw testCasesError;

      // Then delete the user story
      const { error } = await supabase.from("user_stories").delete().eq("id", storyId);

      if (error) throw error;

      // Remove from local state
      setStories((prev) => prev.filter((story) => story.id !== storyId));

      toast({
        title: "User Story Deleted",
        description: `"${storyTitle}" and its test cases have been deleted successfully`,
      });
    } catch (error) {
      console.error("Error deleting user story:", error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete user story",
        variant: "destructive",
      });
    }
  };

  const deleteMultipleStories = async (storyIds: string[]) => {
    setIsDeleting(true);
    try {
      // First delete all associated test cases for all selected stories
      const { error: testCasesError } = await supabase.from("test_cases").delete().in("user_story_id", storyIds);

      if (testCasesError) throw testCasesError;

      // Then delete all selected user stories
      const { error } = await supabase.from("user_stories").delete().in("id", storyIds);

      if (error) throw error;

      // Remove from local state
      setStories((prev) => prev.filter((story) => !storyIds.includes(story.id)));

      // Clear selection
      setSelectedStories(new Set());

      toast({
        title: "User Stories Deleted",
        description: `Successfully deleted ${storyIds.length} user stories and their test cases`,
      });
    } catch (error) {
      console.error("Error deleting multiple user stories:", error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete selected user stories",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Sync selected user stories from integrations
  const syncSelectedStories = async () => {
    if (selectedStories.size === 0) return;

    if (!session?.user?.id || !projectId) {
      toast({
        title: "Error",
        description: "Please make sure you're logged in and have a project",
        variant: "destructive",
      });
      return;
    }

    setIsSyncingSelected(true);
    const savedConfigs = await loadSavedConfigurations();
    let syncedCount = 0;

    try {
      const selectedStoryList = stories.filter((s) => selectedStories.has(s.id));
      
      for (const story of selectedStoryList) {
        // Determine which integration to use based on the story's board source
        const boardInfo = availableBoards.find((b) => b.id === story.boardId);
        const source = boardInfo?.source;

        if (!story.readable_id) {
          console.log(`Skipping story "${story.title}" - no readable_id for external sync`);
          continue;
        }

        try {
          if (source === "jira" && savedConfigs.jira?.enabled) {
            const { url, email, apiToken, projectKey } = savedConfigs.jira;
            
            const response = await fetch(`https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/jira-integration`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                jiraUrl: url,
                email: email,
                apiToken: apiToken,
                projectKey: projectKey,
                issueKey: story.readable_id,
                action: "get-issue",
              }),
            });

            const data = await response.json();
            
            if (data.success && data.issue) {
              const updatedStory = data.issue;
              const { error } = await supabase
                .from("user_stories")
                .update({
                  title: updatedStory.title || story.title,
                  description: extractTextFromJiraContent(updatedStory.description),
                  acceptance_criteria: updatedStory.acceptanceCriteria || story.acceptanceCriteria,
                  priority: updatedStory.priority?.toLowerCase() || story.priority,
                  status: updatedStory.status?.toLowerCase().replace(" ", "-") || story.status,
                })
                .eq("id", story.id);

              if (!error) {
                syncedCount++;
              }
            }
          } else if (source === "azure" && savedConfigs["azure-devops"]?.enabled) {
            const { organizationUrl, projectName, personalAccessToken } = savedConfigs["azure-devops"];
            
            const response = await fetch(
              `https://lwlqfrsqwyvwqveqksuz.supabase.co/functions/v1/azure-devops-integration`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  organizationUrl,
                  projectName,
                  personalAccessToken,
                  workItemId: story.readable_id,
                  action: "get-work-item",
                }),
              },
            );

            const data = await response.json();
            
            if (data.success && data.workItem) {
              const updatedStory = data.workItem;
              const { error } = await supabase
                .from("user_stories")
                .update({
                  title: updatedStory.title || story.title,
                  description: updatedStory.description || story.description,
                  acceptance_criteria: updatedStory.acceptanceCriteria || story.acceptanceCriteria,
                  priority: updatedStory.priority || story.priority,
                  status: updatedStory.status || story.status,
                })
                .eq("id", story.id);

              if (!error) {
                syncedCount++;
              }
            }
          } else {
            console.log(`Skipping story "${story.title}" - no matching integration found`);
          }
        } catch (error) {
          console.error(`Failed to sync story "${story.title}":`, error);
        }
      }

      if (syncedCount > 0) {
        toast({
          title: "Sync Complete",
          description: `Updated ${syncedCount} user stor${syncedCount === 1 ? "y" : "ies"} from external systems`,
        });
        await loadStoriesFromDatabase();
        setSelectedStories(new Set());
      } else {
        toast({
          title: "No Updates",
          description: "No stories were updated. Make sure selected stories have external IDs and matching integrations.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Error syncing selected stories:", error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync selected stories from external integrations",
        variant: "destructive",
      });
    } finally {
      setIsSyncingSelected(false);
    }
  };

  const handleSelectStory = (storyId: string, checked: boolean) => {
    setSelectedStories((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(storyId);
      } else {
        newSet.delete(storyId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStories(new Set(filteredStories.map((story) => story.id)));
    } else {
      setSelectedStories(new Set());
    }
  };

  const isAllSelected = filteredStories.length > 0 && selectedStories.size === filteredStories.length;
  const isIndeterminate = selectedStories.size > 0 && selectedStories.size < filteredStories.length;

  // Handle indeterminate state for select all checkbox
  const selectAllChecked = isAllSelected ? true : isIndeterminate ? "indeterminate" : false;

  const handleRegenerateClick = (storyId: string) => {
    setSelectedStoryForRegenerate(storyId);
    setCustomPrompt("");
    setShowCustomPromptDialog(true);
  };

  const handleCustomRegenerate = async () => {
    if (!selectedStoryForRegenerate) return;

    setShowCustomPromptDialog(false);
    await generateTestCases(
      selectedStoryForRegenerate,
      customPrompt || undefined,
      uploadedImages.length > 0 ? uploadedImages : undefined,
    );
    setSelectedStoryForRegenerate(null);
    setCustomPrompt("");
    setUploadedImages([]);
    setImagePreviews([]);
  };

  const handleGenerateClick = (storyId: string) => {
    setSelectedStoryForGeneration(storyId);
    setCustomPrompt("");
    setShowInitialGenerationDialog(true);
  };

  const handleCustomGenerate = async () => {
    if (!selectedStoryForGeneration) return;

    setShowInitialGenerationDialog(false);
    await generateTestCases(
      selectedStoryForGeneration,
      customPrompt || undefined,
      uploadedImages.length > 0 ? uploadedImages : undefined,
    );
    setSelectedStoryForGeneration(null);
    setCustomPrompt("");
    setUploadedImages([]);
    setImagePreviews([]);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      Array.from(files).forEach((file) => {
        if (uploadedImages.length < 5) {
          // Limit to 5 images
          setUploadedImages((prev) => [...prev, file]);
          const reader = new FileReader();
          reader.onload = () => {
            setImagePreviews((prev) => [...prev, reader.result as string]);
          };
          reader.readAsDataURL(file);
        }
      });
    }
    // Reset the input
    event.target.value = "";
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const removeAllImages = () => {
    setUploadedImages([]);
    setImagePreviews([]);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-destructive text-destructive-foreground";
      case "medium":
        return "bg-warning text-warning-foreground";
      case "low":
        return "bg-success text-success-foreground";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "jira":
        return <ExternalLink className="h-3 w-3" />;
      case "azure":
        return <ExternalLink className="h-3 w-3" />;
      default:
        return <FileText className="h-3 w-3" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">User Stories</h2>
          <p className="text-muted-foreground">Manage user stories and generate test cases with AI</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedBoard} onValueChange={(value) => {
            setSelectedBoard(value);
            setSelectedSprint("all");
            setAvailableSprints([]);
          }}>
            <SelectTrigger className="w-48 bg-card z-50">
              <SelectValue placeholder={availableBoards.length > 0 ? "Select Board" : "No boards available"} />
            </SelectTrigger>
            <SelectContent className="bg-background border shadow-lg z-50 min-w-[200px]">
              {availableBoards.length > 0 ? (
                <>
                  <SelectItem value="all">All Boards</SelectItem>
                  {availableBoards.map((board) => (
                    <SelectItem key={board.id} value={board.id}>
                      <div className="flex items-center gap-2">
                        {board.source === "jira" ? (
                          <ExternalLink className="h-3 w-3" />
                        ) : (
                          <ExternalLink className="h-3 w-3" />
                        )}
                        {board.name} ({board.source.toUpperCase()})
                      </div>
                    </SelectItem>
                  ))}
                </>
              ) : (
                <SelectItem value="none" disabled>
                  Configure integrations to see boards
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          
          <Select 
            value={selectedSprint} 
            onValueChange={setSelectedSprint}
            disabled={selectedBoard === "all" || loadingSprints}
          >
            <SelectTrigger className="w-48 bg-card z-50">
              <SelectValue placeholder={loadingSprints ? "Loading..." : "Select Sprint"} />
            </SelectTrigger>
            <SelectContent className="bg-background border shadow-lg z-50 min-w-[200px]">
              {availableSprints.length > 0 ? (
                <>
                  <SelectItem value="all">All Sprints</SelectItem>
                  {availableSprints.map((sprint) => (
                    <SelectItem key={sprint.id} value={sprint.id}>
                      {sprint.name} {sprint.state && `(${sprint.state})`}
                    </SelectItem>
                  ))}
                </>
              ) : (
                <SelectItem value="none" disabled>
                  {selectedBoard === "all" ? "Select a board first" : "No sprints available"}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          
          <Button
            variant="outline"
            onClick={fetchAvailableSprints}
            disabled={loadingSprints || selectedBoard === "all"}
            title="Fetch sprints for selected board"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingSprints ? "animate-spin" : ""}`} />
            {loadingSprints ? "Loading..." : "Fetch Sprints"}
          </Button>
          
          <Button
            variant="outline"
            onClick={() => syncFromIntegrations(selectedBoard, selectedSprint)}
            disabled={isSyncing || loadingBoards}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync from Integrations"}
          </Button>
          <Button
            variant="outline"
            onClick={fetchAvailableBoards}
            disabled={loadingBoards}
            title="Refresh available boards"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingBoards ? "animate-spin" : ""}`} />
            {loadingBoards ? "Loading..." : "Refresh Boards"}
          </Button>
          <Button variant="gradient" onClick={() => setShowAddForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Story
          </Button>
        </div>
      </div>

      {/* Sync Info Card */}
      <Card className="shadow-card border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Database Integration</p>
              <p className="text-sm text-muted-foreground">
                User stories are automatically saved to your database. Use the "Sync from Integrations" button to import
                stories from Jira or Azure DevOps.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search user stories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Source</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="jira">Jira</SelectItem>
                  <SelectItem value="azure">Azure</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Story Form */}
      {showAddForm && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Add New User Story</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Story title"
              value={newStory.title}
              onChange={(e) => setNewStory({ ...newStory, title: e.target.value })}
            />
            <Textarea
              placeholder="Story description (As a... I want... So that...)"
              value={newStory.description}
              onChange={(e) => setNewStory({ ...newStory, description: e.target.value })}
              rows={3}
            />
            <Textarea
              placeholder="Acceptance criteria"
              value={newStory.acceptanceCriteria}
              onChange={(e) => setNewStory({ ...newStory, acceptanceCriteria: e.target.value })}
              rows={4}
            />
            <Select
              value={newStory.priority}
              onValueChange={(value: "low" | "medium" | "high") => setNewStory({ ...newStory, priority: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button onClick={handleAddStory} disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Story"}
              </Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card className="shadow-card">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Loading user stories from database...</p>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && stories.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="py-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No User Stories Found</h3>
            <p className="text-muted-foreground mb-4">
              Create your first user story manually or sync from your external integrations like Jira or Azure DevOps.
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="gradient" onClick={() => setShowAddForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Story
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Filtered Results */}
      {!isLoading && stories.length > 0 && filteredStories.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="py-8 text-center">
            <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Stories Match Your Filters</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your search terms or filters to see more results.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Bulk Actions Bar */}
      {selectedStories.size > 0 && (
        <Card className="shadow-card border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckSquare className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  {selectedStories.size} user stor{selectedStories.size === 1 ? "y" : "ies"} selected
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedStories(new Set())}>
                  Clear Selection
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncSelectedStories}
                  disabled={isSyncingSelected}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingSelected ? "animate-spin" : ""}`} />
                  {isSyncingSelected ? "Syncing..." : `Sync Selected (${selectedStories.size})`}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isDeleting}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {isDeleting ? "Deleting..." : `Delete Selected (${selectedStories.size})`}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Multiple User Stories</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete {selectedStories.size} user stor
                        {selectedStories.size === 1 ? "y" : "ies"}? This will also delete all associated test cases.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMultipleStories(Array.from(selectedStories))}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete All Selected
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stories Table */}
      {!isLoading && filteredStories.length > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectAllChecked}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all stories"
                      className="ml-2"
                    />
                  </TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Test Cases</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBoardNames.map((boardName) => {
                  const sprints = groupedStories[boardName];
                  const sortedSprintNames = Object.keys(sprints).sort((a, b) => {
                    // Put "No Sprint" last
                    if (a === "No Sprint") return 1;
                    if (b === "No Sprint") return -1;
                    return a.localeCompare(b);
                  });
                  
                  const totalStoriesInBoard = Object.values(sprints).reduce(
                    (sum, stories) => sum + stories.length,
                    0
                  );

                  return (
                    <React.Fragment key={boardName}>
                      {/* Board Group Header */}
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={8} className="font-semibold text-primary">
                          {boardName} ({totalStoriesInBoard} stories)
                        </TableCell>
                      </TableRow>
                      {/* Sprints in this board */}
                      {sortedSprintNames.map((sprintName) => (
                        <React.Fragment key={`${boardName}-${sprintName}`}>
                          {/* Sprint Sub-Header */}
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={8} className="font-medium text-primary/80 pl-8">
                              📋 {sprintName} ({sprints[sprintName].length} stories)
                            </TableCell>
                          </TableRow>
                          {/* Stories in this sprint */}
                          {sprints[sprintName].map((story) => (
                            <TableRow key={story.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedStories.has(story.id)}
                                  onCheckedChange={(checked) => handleSelectStory(story.id, checked as boolean)}
                                  aria-label={`Select ${story.title}`}
                                  className="ml-2"
                                />
                              </TableCell>
                              <TableCell className="font-mono text-sm font-semibold text-primary">
                                {story.readable_id || 'N/A'}
                              </TableCell>
                              <TableCell className="font-medium max-w-48">
                                <div className="truncate" title={story.title}>
                                  {story.title}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-64">
                                <div className="truncate text-muted-foreground" title={sanitizeHtml(story.description)}>
                                  {sanitizeHtml(story.description)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={getPriorityColor(story.priority)}>{story.priority}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{story.status}</Badge>
                              </TableCell>
                              <TableCell>
                                {story.testCasesGenerated > 0 ? (
                                  <span className="text-sm text-muted-foreground">{story.testCasesGenerated} cases</span>
                                ) : (
                                  <span className="text-sm text-muted-foreground">None</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  {story.testCasesGenerated === 0 ? (
                                    <Button
                                      variant="gradient"
                                      size="sm"
                                      onClick={() => handleGenerateClick(story.id)}
                                      disabled={generatingTestCases === story.id}
                                    >
                                      {generatingTestCases === story.id ? (
                                        <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                                      ) : (
                                        <Sparkles className="mr-1 h-3 w-3" />
                                      )}
                                      {generatingTestCases === story.id ? "Generating..." : "Generate"}
                                    </Button>
                                  ) : (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleRegenerateClick(story.id)}
                                        disabled={generatingTestCases === story.id}
                                      >
                                        <RefreshCw className="mr-1 h-3 w-3" />
                                        Regenerate
                                      </Button>
                                      <Button variant="outline" size="sm" onClick={() => onViewChange("test-cases")}>
                                        <FileText className="mr-1 h-3 w-3" />
                                        View
                                      </Button>
                                    </>
                                  )}

                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="outline" size="sm">
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete User Story</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to delete this user story? This will also delete all
                                          associated test cases. This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteUserStory(story.id, story.title)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Custom Prompt Dialog for Initial Generation */}
      <Dialog open={showInitialGenerationDialog} onOpenChange={setShowInitialGenerationDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Customize Test Case Generation</DialogTitle>
            <DialogDescription>
              Add specific instructions and optionally upload an image to help generate test cases.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="custom-prompt-initial">Custom Instructions (Optional)</Label>
              <Textarea
                id="custom-prompt-initial"
                placeholder="e.g., Focus on security testing, Include edge cases for invalid inputs, Generate tests for mobile responsiveness..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-upload-initial">Upload Images (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Upload screenshots, mockups, or diagrams to help generate more specific test cases (max 5 images)
              </p>
              <div className="flex items-center gap-4">
                <input
                  id="image-upload-initial"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById("image-upload-initial")?.click()}
                  className="flex items-center gap-2"
                  disabled={uploadedImages.length >= 5}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  Upload Images ({uploadedImages.length}/5)
                </Button>
                {uploadedImages.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={removeAllImages}
                    className="text-destructive hover:text-destructive"
                  >
                    Remove All
                  </Button>
                )}
              </div>

              {imagePreviews.length > 0 && (
                <div className="mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative">
                        <img
                          src={preview}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-24 object-cover rounded-md border"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeImage(index)}
                          className="absolute top-1 right-1 h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          ×
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {uploadedImages[index]?.name} ({Math.round((uploadedImages[index]?.size || 0) / 1024)}KB)
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInitialGenerationDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCustomGenerate} disabled={generatingTestCases !== null}>
              {generatingTestCases !== null ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {generatingTestCases !== null ? "Generating..." : "Generate Test Cases"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Prompt Dialog for Regeneration */}
      <Dialog open={showCustomPromptDialog} onOpenChange={setShowCustomPromptDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Customize Test Case Generation</DialogTitle>
            <DialogDescription>
              Add specific instructions and optionally upload an image to help regenerate test cases.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="custom-prompt">Custom Instructions (Optional)</Label>
              <Textarea
                id="custom-prompt"
                placeholder="e.g., Focus on security testing, Include edge cases for invalid inputs, Generate tests for mobile responsiveness..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-upload">Upload Images (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Upload screenshots, mockups, or diagrams to help generate more specific test cases (max 5 images)
              </p>
              <div className="flex items-center gap-4">
                <input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById("image-upload")?.click()}
                  className="flex items-center gap-2"
                  disabled={uploadedImages.length >= 5}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  Upload Images ({uploadedImages.length}/5)
                </Button>
                {uploadedImages.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={removeAllImages}
                    className="text-destructive hover:text-destructive"
                  >
                    Remove All
                  </Button>
                )}
              </div>

              {imagePreviews.length > 0 && (
                <div className="mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative">
                        <img
                          src={preview}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-24 object-cover rounded-md border"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeImage(index)}
                          className="absolute top-1 right-1 h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          ×
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {uploadedImages[index]?.name} ({Math.round((uploadedImages[index]?.size || 0) / 1024)}KB)
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomPromptDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCustomRegenerate} disabled={generatingTestCases !== null}>
              {generatingTestCases !== null ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {generatingTestCases !== null ? "Generating..." : "Generate Test Cases"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Java Generation Dialog */}
      <JavaGenerationDialog
        open={showJavaGenerationDialog}
        onOpenChange={setShowJavaGenerationDialog}
        onGenerate={(mockupFiles, htmlDom, selectedElements, selectedTestCases) => {
          console.log('Generate automation with:', { mockupFiles, htmlDom, selectedElements, selectedTestCases });
          toast({
            title: "Generating Automation",
            description: `Starting automation generation for ${selectedTestCases?.length || 0} test cases`,
          });
          // Handle automation generation logic here
        }}
        projectId={projectId}
        userStoryId={selectedStoryForAutomation || undefined}
      />
    </div>
  );
};
