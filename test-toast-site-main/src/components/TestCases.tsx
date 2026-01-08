import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAILearning } from "@/hooks/useAILearning";
import { supabase } from "@/integrations/supabase/client";
import { publicProjectIds } from "@/config/features";
import { TestTube, CheckCircle, XCircle, Clock, Search, Download, Upload, Code2, ChevronDown, ChevronRight, Trash2, Edit3, Save, X, Plus, FolderPlus, Folder, FolderOpen, Flag, MoreHorizontal, Filter, Archive, Copy, Settings, Sparkles, RefreshCw, Brain, Shield } from "lucide-react";
import { TestCaseApprovalDialog } from "@/components/TestCaseApprovalDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { JavaGenerationDialog } from "@/components/JavaGenerationDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import * as XLSX from "xlsx";
interface StructuredTestStep {
  stepNumber: number;
  action: string;
  testData: string;
  expectedResult: string;
}
interface TestCase {
  id: string;
  readableId?: string;
  title: string;
  description: string;
  steps: string[];
  structuredSteps: StructuredTestStep[];
  testData?: string;
  expectedResult: string;
  priority: "low" | "medium" | "high";
  status: "draft" | "not-run" | "passed" | "failed" | "blocked";
  automated: boolean;
  userStoryId: string;
  userStoryTitle: string;
  estimatedTime: string;
  folderId?: string;
}
interface TestCaseFolder {
  id: string;
  name: string;
  projectId: string;
  userStoryId?: string;
  isCustom: boolean;
  testCaseCount: number;
}
interface IntegrationTestGroup {
  id: string;
  name: string;
  testCaseIds: string[];
  createdAt: Date;
}
interface TestCasesProps {
  projectId: string;
}
export const TestCases = ({
  projectId
}: TestCasesProps) => {
  const {
    toast
  } = useToast();
  const {
    session
  } = useAuth();
  const { trackTestCaseFeedback, generateTestCasesWithLearning, isStoringFeedback, storeEmbedding, safetyControls } = useAILearning(projectId);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [folders, setFolders] = useState<TestCaseFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<TestCase>>({});
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTestCaseIds, setSelectedTestCaseIds] = useState<Set<string>>(new Set());

  // New folder dialog state
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // New test case dialog state
  const [newTestCaseDialogOpen, setNewTestCaseDialogOpen] = useState(false);
  const [newTestCaseForm, setNewTestCaseForm] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high",
    structuredSteps: [] as StructuredTestStep[]
  });

  // Test case detail dialog state
  const [testCaseDetailOpen, setTestCaseDetailOpen] = useState(false);
  const [selectedTestCaseForDetail, setSelectedTestCaseForDetail] = useState<TestCase | null>(null);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [editDetailForm, setEditDetailForm] = useState<Partial<TestCase>>({});

  // Java generation dialog state
  const [javaDialogOpen, setJavaDialogOpen] = useState(false);
  const [selectedStoryForJava, setSelectedStoryForJava] = useState<{
    testCases: TestCase[];
    storyTitle: string;
    userStoryId: string;
  } | null>(null);
  const [isGeneratingJava, setIsGeneratingJava] = useState(false);

  // Integration test case state
  const [integrationTestGroups, setIntegrationTestGroups] = useState<IntegrationTestGroup[]>([]);
  const [integrationDialogOpen, setIntegrationDialogOpen] = useState(false);
  const [integrationGroupName, setIntegrationGroupName] = useState("");
  const [selectedUserStories, setSelectedUserStories] = useState<string[]>([]);
  const [selectedTestCaseIdsForIntegration, setSelectedTestCaseIdsForIntegration] = useState<string[]>([]);

  // AI Generation state
  const [aiGenerationDialogOpen, setAiGenerationDialogOpen] = useState(false);
  const [aiGenerationForm, setAiGenerationForm] = useState({
    title: "",
    description: "",
    customPrompt: "",
    useLearnedPatterns: true
  });
  const [aiUploadedImages, setAiUploadedImages] = useState<File[]>([]);
  const [aiImagePreviews, setAiImagePreviews] = useState<string[]>([]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  
  // Track AI-generated content for learning feedback
  const [aiGeneratedTestCases, setAiGeneratedTestCases] = useState<Map<string, string>>(new Map());
  
  // Pending approval state for AI-generated test cases
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [pendingApprovalTestCases, setPendingApprovalTestCases] = useState<any[]>([]);
  const [pendingApprovalConfidence, setPendingApprovalConfidence] = useState(0);
  const [pendingApprovalWarnings, setPendingApprovalWarnings] = useState<string[]>([]);
  const [pendingApprovalStandards, setPendingApprovalStandards] = useState<string[]>([]);
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);

  // Load folders and test cases
  const loadFoldersAndTestCases = async () => {
    const isPublicProject = publicProjectIds.includes(projectId as any);
    if (!session?.user?.id && !isPublicProject) return;
    setIsLoading(true);
    try {
      // Load user stories as folders
      const {
        data: userStories,
        error: storiesError
      } = await supabase.from("user_stories").select("id, title").eq("project_id", projectId).order("created_at", {
        ascending: true
      });
      if (storiesError) throw storiesError;

      // Load custom folders
      const {
        data: customFolders,
        error: foldersError
      } = await supabase.from("test_case_folders").select("*").eq("project_id", projectId).eq("is_custom", true).order("created_at", {
        ascending: true
      });
      if (foldersError) throw foldersError;

      // Load test cases
      const {
        data: dbTestCases,
        error: testCasesError
      } = await supabase.from("test_cases").select(`*, user_stories(title, project_id)`).eq("project_id", projectId).order("created_at", {
        ascending: false
      });
      if (testCasesError) throw testCasesError;

      // Count test cases per user story
      const testCasesByStory = new Map<string, number>();
      const testCasesByFolder = new Map<string, number>();
      (dbTestCases || []).forEach(tc => {
        if (tc.folder_id) {
          testCasesByFolder.set(tc.folder_id, (testCasesByFolder.get(tc.folder_id) || 0) + 1);
        } else if (tc.user_story_id) {
          testCasesByStory.set(tc.user_story_id, (testCasesByStory.get(tc.user_story_id) || 0) + 1);
        }
      });

      // Create folders from user stories - only show stories with test cases
      const storyFolders: TestCaseFolder[] = (userStories || []).filter(story => (testCasesByStory.get(story.id) || 0) > 0).map(story => ({
        id: story.id,
        name: story.title,
        projectId: projectId,
        userStoryId: story.id,
        isCustom: false,
        testCaseCount: testCasesByStory.get(story.id) || 0
      }));

      // Add custom folders
      const customFoldersList: TestCaseFolder[] = (customFolders || []).map(folder => ({
        id: folder.id,
        name: folder.name,
        projectId: folder.project_id,
        userStoryId: folder.user_story_id || undefined,
        isCustom: folder.is_custom,
        testCaseCount: testCasesByFolder.get(folder.id) || 0
      }));
      setFolders([...storyFolders, ...customFoldersList]);

      // Transform test cases
      const transformedTestCases: TestCase[] = (dbTestCases || []).map(tc => {
        let structuredSteps: StructuredTestStep[] = [];
        if (tc.structured_steps && Array.isArray(tc.structured_steps) && tc.structured_steps.length > 0) {
          try {
            structuredSteps = (tc.structured_steps as any[]).map((step: any) => ({
              stepNumber: step.stepNumber || 0,
              action: step.action || "",
              testData: step.testData || "",
              expectedResult: step.expectedResult || ""
            }));
          } catch (e) {
            console.error("Error parsing structured steps:", e);
            structuredSteps = [];
          }
        }
        if (structuredSteps.length === 0 && tc.steps) {
          const legacySteps = tc.steps.split("\n").filter(step => step.trim());
          structuredSteps = legacySteps.map((step, index) => ({
            stepNumber: index + 1,
            action: step,
            testData: "",
            expectedResult: ""
          }));
        }
        return {
          id: tc.id,
          readableId: tc.readable_id,
          title: tc.title,
          description: tc.description || "",
          steps: tc.steps ? tc.steps.split("\n").filter(step => step.trim()) : [],
          structuredSteps: structuredSteps,
          testData: tc.test_data || "",
          expectedResult: tc.expected_result || "",
          priority: tc.priority as "low" | "medium" | "high",
          status: tc.status as "draft" | "not-run" | "passed" | "failed" | "blocked",
          automated: tc.automated || false,
          userStoryId: tc.user_story_id || "",
          userStoryTitle: tc.user_stories?.title || "Ungrouped",
          estimatedTime: "5-10 min",
          folderId: tc.folder_id || undefined
        };
      });
      setTestCases(transformedTestCases);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load test cases",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  // Load safety config when component mounts
  useEffect(() => {
    if (projectId) {
      safetyControls.loadSafetyConfig(projectId);
    }
  }, [projectId, safetyControls.loadSafetyConfig]);

  useEffect(() => {
    const isPublicProject = publicProjectIds.includes(projectId as any);
    if ((session?.user?.id || isPublicProject) && projectId) {
      loadFoldersAndTestCases();
    }
  }, [session?.user?.id, projectId]);

  // Load saved configurations from database (project-specific)
  const loadSavedConfigurations = async (): Promise<any> => {
    try {
      const { data, error } = await supabase
        .from("integration_configs")
        .select("integration_id, config, enabled, last_sync")
        .eq("project_id", projectId);

      if (error || !data) {
        return {};
      }

      const configs: any = {};
      data.forEach((record: any) => {
        configs[record.integration_id] = {
          ...record.config,
          enabled: record.enabled,
          lastSync: record.last_sync,
        };
      });
      return configs;
    } catch (error) {
      console.error("Error loading configurations:", error);
      return {};
    }
  };

  // Handle AI image upload
  const handleAiImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + aiUploadedImages.length > 5) {
      toast({
        title: "Too many images",
        description: "Maximum 5 images allowed",
        variant: "destructive",
      });
      return;
    }
    
    setAiUploadedImages(prev => [...prev, ...files]);
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setAiImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  // Remove AI image
  const removeAiImage = (index: number) => {
    setAiUploadedImages(prev => prev.filter((_, i) => i !== index));
    setAiImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Remove all AI images
  const removeAllAiImages = () => {
    setAiUploadedImages([]);
    setAiImagePreviews([]);
  };

  // Generate test case with AI
  const generateTestCaseWithAi = async () => {
    if (!aiGenerationForm.title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a title or description for the test case",
        variant: "destructive",
      });
      return;
    }

    if (!session?.access_token) {
      toast({
        title: "Authentication Error",
        description: "Please log in to generate test cases",
        variant: "destructive",
      });
      return;
    }

    // Check rate limit before proceeding
    const canProceed = await safetyControls.checkRateLimit(projectId);
    if (!canProceed) {
      toast({
        title: "Rate Limit Exceeded",
        description: "Daily AI generation limit reached. Please try again tomorrow or increase the limit in AI Governance settings.",
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
        description: "Please configure Azure OpenAI in Integrations first",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingAi(true);

    try {
      let data;
      
      // Try using learned patterns if enabled
      if (aiGenerationForm.useLearnedPatterns) {
        try {
          const learningResult = await generateTestCasesWithLearning(
            projectId,
            {
              title: aiGenerationForm.title,
              description: aiGenerationForm.description || aiGenerationForm.title,
              acceptanceCriteria: aiGenerationForm.customPrompt,
            },
            session.access_token
          );
          
          if (learningResult?.content) {
            // Check if approval is required
            if (learningResult.requiresApproval) {
              console.log("AI-generated test cases require approval. Confidence:", learningResult.confidence);
              
              // Show approval dialog instead of auto-saving
              setPendingApprovalTestCases(learningResult.content);
              setPendingApprovalConfidence(learningResult.confidence || 0);
              setPendingApprovalWarnings(learningResult.warnings || []);
              setPendingApprovalStandards(learningResult.metadata?.appliedStandardNames || []);
              setApprovalDialogOpen(true);
              setAiGenerationDialogOpen(false);
              setAiGenerationForm({ title: "", description: "", customPrompt: "", useLearnedPatterns: true });
              setAiUploadedImages([]);
              setAiImagePreviews([]);
              setIsGeneratingAi(false);
              return; // Don't save automatically - wait for approval
            }
            
            data = { success: true, testCases: learningResult.content, usedLearning: true };
            console.log("Generated with learning context, auto-approved. Confidence:", learningResult.confidence);
          }
        } catch (learningError) {
          console.log("Learning-based generation failed, falling back to standard:", learningError);
        }
      }
      
      // Fallback to standard generation if learning failed or disabled
      if (!data) {
        let requestBody: any = {
          story: {
            id: `tc-${Date.now()}`,
            project_id: projectId,
            title: aiGenerationForm.title,
            description: aiGenerationForm.description || aiGenerationForm.title,
            acceptanceCriteria: "",
            priority: "medium",
            issueType: "Test Case",
          },
          azureConfig,
          customPrompt: aiGenerationForm.customPrompt,
        };

        // Convert images to base64 if provided
        if (aiUploadedImages.length > 0) {
          const imageDataArray = [];
          for (const image of aiUploadedImages) {
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

        const response = await fetch(`https://lghzmijzfpvrcvogxpew.supabase.co/functions/v1/generate-test-cases`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(requestBody),
        });

        const responseData = await response.json();
        
        // For fallback generation, also check if approval is required
        if (responseData.success && responseData.testCases) {
          // Process through safety controls
          const safetyResult = await safetyControls.processGenerationResult(
            projectId,
            "test_case",
            responseData.testCases,
            0.7, // Default confidence for non-learning generation
            { similarExamplesFound: 0, patternsUsed: 0, generationTimeMs: 0 }
          );
          
          if (safetyResult.requiresApproval) {
            console.log("Fallback AI-generated test cases require approval");
            
            // Show approval dialog instead of auto-saving
            setPendingApprovalTestCases(responseData.testCases);
            setPendingApprovalConfidence(safetyResult.confidence);
            setPendingApprovalWarnings(safetyResult.warnings);
            setPendingApprovalStandards(safetyResult.metadata?.appliedStandardNames || []);
            setApprovalDialogOpen(true);
            setAiGenerationDialogOpen(false);
            setAiGenerationForm({ title: "", description: "", customPrompt: "", useLearnedPatterns: true });
            setAiUploadedImages([]);
            setAiImagePreviews([]);
            setIsGeneratingAi(false);
            return; // Don't save automatically - wait for approval
          }
        }
        
        data = responseData;
      }

      if (data.success && data.testCases) {
        // Get the folder to add to
        const folder = selectedFolderId ? folders.find(f => f.id === selectedFolderId) : null;
        
        // Save test cases to database
        const testCasesToInsert = data.testCases.map((testCase: any) => ({
          project_id: projectId,
          user_story_id: folder && !folder.isCustom ? selectedFolderId : null,
          folder_id: folder && folder.isCustom ? selectedFolderId : null,
          title: testCase.title || testCase.name || "Test Case",
          description: testCase.description || "",
          steps: testCase.steps ? (Array.isArray(testCase.steps) ? testCase.steps.join("\n") : testCase.steps) : "",
          expected_result: testCase.expectedResult || testCase.expected || "",
          priority: (testCase.priority || "medium").toLowerCase(),
          status: "draft",
        }));

        const { data: insertedData, error: insertError } = await supabase
          .from("test_cases")
          .insert(testCasesToInsert)
          .select("id");

        if (insertError) {
          throw insertError;
        }

        // Track AI-generated content for learning feedback
        if (insertedData) {
          const newAiGenerated = new Map(aiGeneratedTestCases);
          
          // Store original content and immediately track approval for learning
          for (let i = 0; i < insertedData.length; i++) {
            const inserted = insertedData[i];
            const originalContent = JSON.stringify(data.testCases[i]);
            newAiGenerated.set(inserted.id, originalContent);
            
            // Immediately track as "approved" for AI learning (user accepted generation)
            trackTestCaseFeedback(
              projectId,
              inserted.id,
              originalContent,
              originalContent,
              false // not edited - approved as-is
            ).catch(err => console.log("Learning feedback tracking:", err.message));
          }
          
          setAiGeneratedTestCases(newAiGenerated);
        }

        const learningBadge = data.usedLearning ? " (with learned patterns)" : "";
        toast({
          title: "Test Cases Generated",
          description: `Generated ${data.testCases.length} test case(s) with AI${learningBadge}`,
        });

        // Reset form and close dialog
        setAiGenerationDialogOpen(false);
        setAiGenerationForm({ title: "", description: "", customPrompt: "", useLearnedPatterns: true });
        setAiUploadedImages([]);
        setAiImagePreviews([]);
        loadFoldersAndTestCases();
      } else {
        throw new Error(data.error || "Failed to generate test cases");
      }
    } catch (error) {
      console.error("Error generating test cases with AI:", error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate test cases. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Handle approval of pending AI-generated test cases
  const handleApproveTestCases = async (approvedTestCases: any[]) => {
    if (!session?.user?.id || approvedTestCases.length === 0) return;
    
    setIsProcessingApproval(true);
    try {
      const folder = selectedFolderId ? folders.find(f => f.id === selectedFolderId) : null;
      
      // Save approved test cases to database
      const testCasesToInsert = approvedTestCases.map((testCase: any) => ({
        project_id: projectId,
        user_story_id: folder && !folder.isCustom ? selectedFolderId : null,
        folder_id: folder && folder.isCustom ? selectedFolderId : null,
        title: testCase.title || testCase.name || "Test Case",
        description: testCase.description || "",
        steps: testCase.steps ? (Array.isArray(testCase.steps) ? testCase.steps.join("\n") : testCase.steps) : "",
        expected_result: testCase.expectedResult || testCase.expected || "",
        priority: (testCase.priority || "medium").toLowerCase(),
        status: "draft",
      }));

      const { data: insertedData, error: insertError } = await supabase
        .from("test_cases")
        .insert(testCasesToInsert)
        .select("id");

      if (insertError) {
        throw insertError;
      }

      // Track AI-generated content for learning feedback (approved with review)
      if (insertedData) {
        const newAiGenerated = new Map(aiGeneratedTestCases);
        
        for (let i = 0; i < insertedData.length; i++) {
          const inserted = insertedData[i];
          const originalContent = JSON.stringify(approvedTestCases[i]);
          newAiGenerated.set(inserted.id, originalContent);
          
          // Track as approved after human review
          trackTestCaseFeedback(
            projectId,
            inserted.id,
            originalContent,
            originalContent,
            false // approved as-is (or could check if edited)
          ).catch(err => console.log("Learning feedback tracking:", err.message));
        }
        
        setAiGeneratedTestCases(newAiGenerated);
      }

      // Log approval to audit using qa_ai_feedback table
      await supabase.from("qa_ai_feedback").insert({
        project_id: projectId,
        user_id: session.user.id,
        artifact_type: "test_case",
        action: "approved",
        original_content: JSON.stringify(approvedTestCases),
        feedback_notes: JSON.stringify({
          actionType: "approval",
          confidence: pendingApprovalConfidence,
          notes: `Approved ${approvedTestCases.length} test case(s) after human review`,
          appliedStandards: pendingApprovalStandards,
        }),
      });

      toast({
        title: "Test Cases Approved",
        description: `Saved ${approvedTestCases.length} test case(s) after review`,
      });

      // Reset approval state
      setApprovalDialogOpen(false);
      setPendingApprovalTestCases([]);
      setPendingApprovalConfidence(0);
      setPendingApprovalWarnings([]);
      setPendingApprovalStandards([]);
      loadFoldersAndTestCases();
    } catch (error) {
      console.error("Error saving approved test cases:", error);
      toast({
        title: "Save Failed",
        description: "Failed to save approved test cases. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingApproval(false);
    }
  };

  // Handle rejection of pending AI-generated test cases
  const handleRejectTestCases = async (reason: string) => {
    if (!session?.user?.id) return;
    
    try {
      // Log rejection to audit using qa_ai_feedback table
      await supabase.from("qa_ai_feedback").insert({
        project_id: projectId,
        user_id: session.user.id,
        artifact_type: "test_case",
        action: "rejected",
        original_content: JSON.stringify(pendingApprovalTestCases),
        feedback_notes: JSON.stringify({
          actionType: "rejection",
          confidence: pendingApprovalConfidence,
          notes: reason || "Rejected by user",
          appliedStandards: pendingApprovalStandards,
        }),
      });

      toast({
        title: "Test Cases Rejected",
        description: "AI-generated test cases were not saved. Feedback recorded for improvement.",
      });

      // Reset approval state
      setApprovalDialogOpen(false);
      setPendingApprovalTestCases([]);
      setPendingApprovalConfidence(0);
      setPendingApprovalWarnings([]);
      setPendingApprovalStandards([]);
    } catch (error) {
      console.error("Error logging rejection:", error);
    }
  };

  // Get filtered test cases for selected folder
  const getFilteredTestCases = () => {
    let filtered = testCases;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(tc => tc.title.toLowerCase().includes(searchTerm.toLowerCase()) || tc.readableId?.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    // Filter by selected folder
    if (selectedFolderId) {
      // Check if it's a user story folder or custom folder
      const folder = folders.find(f => f.id === selectedFolderId);
      if (folder?.isCustom) {
        filtered = filtered.filter(tc => tc.folderId === selectedFolderId);
      } else {
        // It's a user story folder
        filtered = filtered.filter(tc => tc.userStoryId === selectedFolderId && !tc.folderId);
      }
    }

    // Filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter(tc => tc.status === statusFilter);
    }

    // Filter by priority
    if (priorityFilter !== "all") {
      filtered = filtered.filter(tc => tc.priority === priorityFilter);
    }

    // Sort by Test Case ID (readable_id)
    filtered = filtered.sort((a, b) => {
      const idA = a.readableId || "";
      const idB = b.readableId || "";
      return idA.localeCompare(idB, undefined, {
        numeric: true
      });
    });
    return filtered;
  };
  const filteredTestCases = getFilteredTestCases();

  // Total test case count
  const totalTestCaseCount = testCases.length;
  const getStatusColor = (status: string) => {
    switch (status) {
      case "passed":
        return "bg-success text-success-foreground";
      case "failed":
        return "bg-destructive text-destructive-foreground";
      case "blocked":
        return "bg-warning text-warning-foreground";
      case "draft":
        return "bg-secondary text-secondary-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-destructive";
      case "medium":
        return "text-warning";
      case "low":
        return "text-success";
      default:
        return "text-muted-foreground";
    }
  };
  const toggleFolderExpansion = (folderId: string) => {
    setExpandedFolders(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(folderId)) {
        newExpanded.delete(folderId);
      } else {
        newExpanded.add(folderId);
      }
      return newExpanded;
    });
  };
  const handleFolderSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setSelectedTestCaseIds(new Set());
  };
  const handleTestCaseSelect = (testCaseId: string, checked: boolean) => {
    setSelectedTestCaseIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(testCaseId);
      } else {
        newSet.delete(testCaseId);
      }
      return newSet;
    });
  };
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTestCaseIds(new Set(filteredTestCases.map(tc => tc.id)));
    } else {
      setSelectedTestCaseIds(new Set());
    }
  };

  // Create new folder
  const createFolder = async () => {
    if (!newFolderName.trim() || !session?.user?.id) return;
    try {
      const {
        error
      } = await supabase.from("test_case_folders").insert({
        name: newFolderName.trim(),
        project_id: projectId,
        is_custom: true,
        created_by: session.user.id
      });
      if (error) throw error;
      toast({
        title: "Folder created successfully"
      });
      setNewFolderDialogOpen(false);
      setNewFolderName("");
      loadFoldersAndTestCases();
    } catch (error) {
      console.error("Error creating folder:", error);
      toast({
        title: "Failed to create folder",
        variant: "destructive"
      });
    }
  };

  // Create new test case
  const createTestCase = async () => {
    if (!newTestCaseForm.title.trim() || !session?.user?.id) return;
    try {
      const testCaseData: any = {
        title: newTestCaseForm.title.trim(),
        description: newTestCaseForm.description.trim(),
        priority: newTestCaseForm.priority,
        status: "draft",
        project_id: projectId,
        structured_steps: newTestCaseForm.structuredSteps
      };

      // Assign to folder or user story
      if (selectedFolderId) {
        const folder = folders.find(f => f.id === selectedFolderId);
        if (folder?.isCustom) {
          testCaseData.folder_id = selectedFolderId;
        } else {
          testCaseData.user_story_id = selectedFolderId;
        }
      }
      const { data: insertedData, error } = await supabase
        .from("test_cases")
        .insert(testCaseData)
        .select("id")
        .single();
      if (error) throw error;
      
      // Generate and store embedding for the new test case
      if (insertedData?.id && projectId) {
        const stepsText = newTestCaseForm.structuredSteps
          .map((s) => `${s.stepNumber}. ${s.action} - Expected: ${s.expectedResult}`)
          .join("\n");
        const content = `${newTestCaseForm.title}\n${newTestCaseForm.description}\n${stepsText}`;
        
        storeEmbedding({
          projectId,
          artifactType: "test_case",
          artifactId: insertedData.id,
          content,
          metadata: { priority: newTestCaseForm.priority, source: "manual" },
        }).catch((err) => console.error("Failed to store embedding:", err));
      }
      
      toast({
        title: "Test case created successfully"
      });
      setNewTestCaseDialogOpen(false);
      setNewTestCaseForm({
        title: "",
        description: "",
        priority: "medium",
        structuredSteps: []
      });
      loadFoldersAndTestCases();
    } catch (error) {
      console.error("Error creating test case:", error);
      toast({
        title: "Failed to create test case",
        variant: "destructive"
      });
    }
  };

  // Delete test case
  const deleteTestCase = async (testCaseId: string, testCaseTitle: string) => {
    try {
      const {
        error
      } = await supabase.from("test_cases").delete().eq("id", testCaseId);
      if (error) throw error;
      setTestCases(prev => prev.filter(tc => tc.id !== testCaseId));
      toast({
        title: "Test Case Deleted",
        description: `"${testCaseTitle}" has been deleted`
      });
    } catch (error) {
      console.error("Error deleting test case:", error);
      toast({
        title: "Delete Failed",
        variant: "destructive"
      });
    }
  };

  // Bulk delete test cases state
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  // Bulk delete test cases
  const bulkDeleteTestCases = async () => {
    if (selectedTestCaseIds.size === 0) return;
    
    setIsDeletingBulk(true);
    try {
      const idsToDelete = Array.from(selectedTestCaseIds);
      const { error } = await supabase
        .from("test_cases")
        .delete()
        .in("id", idsToDelete);
      
      if (error) throw error;
      
      setTestCases(prev => prev.filter(tc => !selectedTestCaseIds.has(tc.id)));
      setSelectedTestCaseIds(new Set());
      setBulkDeleteDialogOpen(false);
      
      toast({
        title: "Test Cases Deleted",
        description: `${idsToDelete.length} test case(s) have been deleted`
      });
    } catch (error) {
      console.error("Error bulk deleting test cases:", error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete selected test cases",
        variant: "destructive"
      });
    } finally {
      setIsDeletingBulk(false);
    }
  };

  // Delete folder
  const deleteFolder = async (folderId: string) => {
    try {
      const {
        error
      } = await supabase.from("test_case_folders").delete().eq("id", folderId);
      if (error) throw error;
      toast({
        title: "Folder deleted successfully"
      });
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
      loadFoldersAndTestCases();
    } catch (error) {
      console.error("Error deleting folder:", error);
      toast({
        title: "Failed to delete folder",
        variant: "destructive"
      });
    }
  };

  // View test case detail
  const viewTestCaseDetail = (testCase: TestCase) => {
    setSelectedTestCaseForDetail(testCase);
    setEditDetailForm({
      title: testCase.title,
      description: testCase.description,
      priority: testCase.priority,
      status: testCase.status,
      automated: testCase.automated,
      structuredSteps: testCase.structuredSteps
    });
    setIsEditingDetail(false);
    setTestCaseDetailOpen(true);
  };

  // Update test case
  const updateTestCase = async () => {
    if (!selectedTestCaseForDetail) return;
    try {
      const stepsForDb = (editDetailForm.structuredSteps || []).map(step => ({
        stepNumber: step.stepNumber,
        action: step.action,
        testData: step.testData,
        expectedResult: step.expectedResult
      }));
      const {
        error
      } = await supabase.from("test_cases").update({
        title: editDetailForm.title,
        description: editDetailForm.description,
        priority: editDetailForm.priority,
        status: editDetailForm.status,
        automated: editDetailForm.automated,
        structured_steps: stepsForDb
      }).eq("id", selectedTestCaseForDetail.id);
      if (error) throw error;
      
      // Track learning feedback if this was an AI-generated test case
      const originalAiContent = aiGeneratedTestCases.get(selectedTestCaseForDetail.id);
      if (originalAiContent) {
        const finalContent = JSON.stringify({
          title: editDetailForm.title,
          description: editDetailForm.description,
          steps: stepsForDb,
          priority: editDetailForm.priority,
        });
        
        // Check if content was edited
        const wasEdited = originalAiContent !== finalContent;
        
        // Track feedback for AI learning
        await trackTestCaseFeedback(
          projectId,
          selectedTestCaseForDetail.id,
          originalAiContent,
          finalContent,
          wasEdited
        );
        
        // Remove from tracking after feedback is stored
        const newAiGenerated = new Map(aiGeneratedTestCases);
        newAiGenerated.delete(selectedTestCaseForDetail.id);
        setAiGeneratedTestCases(newAiGenerated);
        
        console.log(`Learning feedback stored: ${wasEdited ? "edited" : "approved"}`);
      }
      
      toast({
        title: "Test case updated successfully"
      });
      setIsEditingDetail(false);
      setTestCaseDetailOpen(false);
      loadFoldersAndTestCases();
    } catch (error) {
      console.error("Error updating test case:", error);
      toast({
        title: "Failed to update test case",
        variant: "destructive"
      });
    }
  };

  // Toggle automated status
  const toggleAutomated = async (testCase: TestCase) => {
    try {
      const {
        error
      } = await supabase.from("test_cases").update({
        automated: !testCase.automated
      }).eq("id", testCase.id);
      if (error) throw error;
      setTestCases(prev => prev.map(tc => tc.id === testCase.id ? {
        ...tc,
        automated: !tc.automated
      } : tc));
      toast({
        title: testCase.automated ? "Marked as manual" : "Marked as automated"
      });
    } catch (error) {
      console.error("Error updating automated status:", error);
      toast({
        title: "Failed to update",
        variant: "destructive"
      });
    }
  };

  // Update test case status
  const updateStatus = async (testCase: TestCase, newStatus: string) => {
    try {
      const {
        error
      } = await supabase.from("test_cases").update({
        status: newStatus
      }).eq("id", testCase.id);
      if (error) throw error;
      setTestCases(prev => prev.map(tc => tc.id === testCase.id ? {
        ...tc,
        status: newStatus as any
      } : tc));
      toast({
        title: `Status updated to ${newStatus}`
      });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Failed to update status",
        variant: "destructive"
      });
    }
  };

  // Check if selected folder is a user story folder
  const selectedFolder = selectedFolderId ? folders.find(f => f.id === selectedFolderId) : null;
  const isUserStoryFolderSelected = selectedFolder && !selectedFolder.isCustom && selectedFolder.userStoryId;

  // Open Java generation for selected test cases or folder
  const openJavaGeneration = () => {
    let selectedTestCases = testCases.filter(tc => selectedTestCaseIds.has(tc.id));
    
    // If no test cases selected but user story folder is selected, use all test cases from that folder
    if (selectedTestCases.length === 0 && isUserStoryFolderSelected) {
      selectedTestCases = testCases.filter(tc => tc.userStoryId === selectedFolderId);
    }
    
    if (selectedTestCases.length === 0) {
      toast({
        title: "No test cases available",
        description: "Please select test cases or a user story folder with test cases",
        variant: "destructive"
      });
      return;
    }
    
    const storyTitle = isUserStoryFolderSelected && selectedTestCaseIds.size === 0 
      ? selectedFolder?.name || "Selected Test Cases"
      : "Selected Test Cases";
      
    setSelectedStoryForJava({
      testCases: selectedTestCases,
      storyTitle: storyTitle,
      userStoryId: selectedTestCases[0]?.userStoryId || ""
    });
    setJavaDialogOpen(true);
  };

  // Export functions
  const exportTests = () => {
    const wb = XLSX.utils.book_new();
    const excelData = filteredTestCases.map(tc => ({
      "Test Case ID": tc.readableId || tc.id,
      Title: tc.title,
      Description: tc.description,
      Priority: tc.priority,
      Status: tc.status,
      "User Story": tc.userStoryTitle
    }));
    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
    XLSX.writeFile(wb, "test-cases.xlsx");
    toast({
      title: "Export Complete"
    });
  };
  const importFromExcel = () => {
    fileInputRef.current?.click();
  };
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isPublicProject = publicProjectIds.includes(projectId as any);
    if (!session?.user?.id && !isPublicProject) {
      toast({
        title: "Authentication required",
        variant: "destructive"
      });
      return;
    }
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      if (jsonData.length === 0) {
        toast({
          title: "No data found in file",
          variant: "destructive"
        });
        return;
      }
      let importedCount = 0;
      for (const row of jsonData as any[]) {
        const title = row["Title"] || row["title"] || row["Name"] || row["name"];
        if (!title) continue;
        const testCaseData: any = {
          title: title,
          description: row["Description"] || row["description"] || "",
          priority: (row["Priority"] || row["priority"] || "medium").toLowerCase(),
          status: (row["Status"] || row["status"] || "draft").toLowerCase().replace(" ", "-"),
          project_id: projectId
        };

        // Assign to selected folder if any
        if (selectedFolderId) {
          const folder = folders.find(f => f.id === selectedFolderId);
          if (folder?.isCustom) {
            testCaseData.folder_id = selectedFolderId;
          } else {
            testCaseData.user_story_id = selectedFolderId;
          }
        }
        const {
          error
        } = await supabase.from("test_cases").insert(testCaseData);
        if (!error) importedCount++;
      }
      toast({
        title: "Import Complete",
        description: `Successfully imported ${importedCount} test cases`
      });
      loadFoldersAndTestCases();
    } catch (error) {
      console.error("Error importing file:", error);
      toast({
        title: "Import failed",
        description: "Error reading file",
        variant: "destructive"
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Java generation handlers
  const handleJavaGeneration = async (mockupFiles: File[], htmlDom: string, selectedElements?: Array<{
    name: string;
    xpath: string;
    tagName: string;
    locatorStrategy: string;
  }>, selectedTestCases?: Array<{
    id: string;
    title: string;
    description?: string;
  }>, outputOption?: 'repository' | 'download') => {
    if (!selectedStoryForJava) {
      toast({
        title: "No test cases selected",
        variant: "destructive"
      });
      return;
    }
    setIsGeneratingJava(true);
    const saveToRepository = outputOption !== 'download';
    try {
      const testCasesToGenerate = selectedTestCases?.length ? selectedStoryForJava.testCases.filter(tc => selectedTestCases.some(stc => stc.id === tc.id)) : selectedStoryForJava.testCases;
      if (testCasesToGenerate.length === 0) {
        toast({
          title: "No test cases selected for generation",
          variant: "destructive"
        });
        setIsGeneratingJava(false);
        return;
      }

      // Fetch project name once
      const {
        data: projectData
      } = await supabase.from('projects').select('name').eq('id', projectId).single();

      // Convert mockup files to base64 once before the loop
      const mockupImagesBase64: string[] = [];
      if (mockupFiles && mockupFiles.length > 0) {
        for (const file of mockupFiles) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          mockupImagesBase64.push(base64);
        }
      }

      const allGeneratedFiles: Array<{
        pageFile: string;
        stepFile: string;
        testFile: string;
        pageClassName: string;
        stepClassName: string;
        testClassName: string;
      }> = [];
      for (const tc of testCasesToGenerate) {
        // Prepare steps for the edge function
        let steps: Array<{
          type: string;
          content: string;
        }> = [];
        if (tc.structuredSteps && Array.isArray(tc.structuredSteps)) {
          steps = tc.structuredSteps.map((s: any) => ({
            type: s.type || 'action',
            content: s.action || s.content || ''
          }));
        } else if (tc.steps && tc.steps.length > 0) {
          steps = tc.steps.map((s: string) => ({
            type: 'action',
            content: s
          }));
        }
        const testCasePayload = {
          id: tc.readableId || tc.id,
          title: tc.title,
          description: tc.description || '',
          steps: steps.map(s => s.content),
          expectedResult: tc.expectedResult || '',
          priority: tc.priority || 'medium',
          status: tc.status || 'draft',
          userStoryId: tc.userStoryId || '',
          userStoryTitle: selectedStoryForJava.storyTitle || 'Test'
        };
        const {
          data,
          error
        } = await supabase.functions.invoke('generate-java-automation-files', {
          body: {
            testCase: testCasePayload,
            projectId,
            projectName: projectData?.name || 'TestProject',
            saveToRepository,
            mockupImages: mockupImagesBase64.length > 0 ? mockupImagesBase64 : undefined,
            htmlDom: htmlDom || undefined,
            selectedElements: selectedElements && selectedElements.length > 0 ? selectedElements : undefined
          }
        });
        if (error) {
          console.error('Error generating automation for:', tc.title, error);
          toast({
            title: `Error generating ${tc.title}`,
            description: error.message,
            variant: "destructive"
          });
          continue;
        }
        if (data?.success) {
          allGeneratedFiles.push({
            pageFile: data.pageFile,
            stepFile: data.stepFile,
            testFile: data.testFile,
            pageClassName: data.pageClassName,
            stepClassName: data.stepClassName,
            testClassName: data.testClassName
          });
        }
      }
      if (allGeneratedFiles.length > 0) {
        if (saveToRepository) {
          // Files already saved to repository by edge function
          toast({
            title: "Success",
            description: `Saved ${allGeneratedFiles.length} automation file(s) to repository`
          });
        } else {
          // Create and download ZIP file with all generated files
          const JSZip = (await import('jszip')).default;
          const zip = new JSZip();

          // Create folder structure
          const pagesFolder = zip.folder('src/main/java/com/testautomation/pages');
          const stepsFolder = zip.folder('src/main/java/com/testautomation/steps');
          const testsFolder = zip.folder('src/test/java/com/testautomation/tests');
          allGeneratedFiles.forEach(files => {
            pagesFolder?.file(`${files.pageClassName}.java`, files.pageFile);
            stepsFolder?.file(`${files.stepClassName}.java`, files.stepFile);
            testsFolder?.file(`${files.testClassName}.java`, files.testFile);
          });

          // Generate and download ZIP
          const content = await zip.generateAsync({
            type: 'blob'
          });
          const url = URL.createObjectURL(content);
          const a = document.createElement('a');
          a.href = url;
          a.download = `automation-scripts-${Date.now()}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast({
            title: "Success",
            description: `Downloaded ${allGeneratedFiles.length} automation file(s) as ZIP`
          });
        }

        // Mark test cases as automated
        for (const tc of testCasesToGenerate) {
          await supabase.from("test_cases").update({
            automated: true
          }).eq("id", tc.id);
        }
        loadFoldersAndTestCases();
      } else {
        toast({
          title: "No files generated",
          description: "Could not generate automation files",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error in Java generation:", error);
      toast({
        title: "Generation failed",
        description: "An error occurred during generation",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingJava(false);
      setJavaDialogOpen(false);
    }
  };
  return <div className="flex h-full gap-0 overflow-hidden rounded-lg border border-border bg-card">
      {/* Left Sidebar - Folder Tree */}
      <div className="w-72 border-r border-border flex flex-col">
        {/* Folder Header */}
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setNewFolderDialogOpen(true)}>
            <FolderPlus className="h-4 w-4" />
            New Folder
          </Button>
          
          
        </div>

        {/* Folder List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {/* All Test Cases */}
            <div className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-muted/50 ${selectedFolderId === null ? 'bg-primary/10 text-primary' : ''}`} onClick={() => handleFolderSelect(null)}>
              <Folder className="h-4 w-4" />
              <span className="font-medium flex-1">All test cases</span>
              <span className="text-xs text-muted-foreground">({totalTestCaseCount})</span>
            </div>

            {/* User Story Folders */}
            {folders.filter(f => !f.isCustom).map(folder => <div key={folder.id} className="mt-1">
                <div className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-muted/50 ${selectedFolderId === folder.id ? 'bg-primary/10 text-primary' : ''}`} onClick={() => handleFolderSelect(folder.id)}>
                  {selectedFolderId === folder.id ? <FolderOpen className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4" />}
                  <span className="flex-1 truncate text-sm">{folder.name}</span>
                  <span className="text-xs text-muted-foreground">({folder.testCaseCount})</span>
                </div>
              </div>)}

            {/* Custom Folders */}
            {folders.filter(f => f.isCustom).length > 0 && <div className="mt-4 mb-2 px-2">
                <span className="text-xs text-muted-foreground uppercase font-medium">Custom Folders</span>
              </div>}
            {folders.filter(f => f.isCustom).map(folder => <div key={folder.id} className="mt-1">
                <div className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-muted/50 group ${selectedFolderId === folder.id ? 'bg-primary/10 text-primary' : ''}`} onClick={() => handleFolderSelect(folder.id)}>
                  {selectedFolderId === folder.id ? <FolderOpen className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4" />}
                  <span className="flex-1 truncate text-sm">{folder.name}</span>
                  <span className="text-xs text-muted-foreground">({folder.testCaseCount})</span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Folder</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure? Test cases in this folder will be moved to ungrouped.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteFolder(folder.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>)}
          </div>
        </ScrollArea>
      </div>

      {/* Right Content - Test Case Table */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Action Bar */}
        <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1 bg-primary">
                <Plus className="h-4 w-4" />
                New Test Case
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setNewTestCaseDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Manual
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAiGenerationDialogOpen(true)}>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate with AI
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" disabled={selectedTestCaseIds.size === 0 && !isUserStoryFolderSelected} onClick={openJavaGeneration}>
            <Code2 className="h-4 w-4 mr-1" />
            Generate Script
          </Button>
          <Button variant="outline" size="sm" disabled={selectedTestCaseIds.size === 0}>
            <Copy className="h-4 w-4 mr-1" />
            Clone
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            disabled={selectedTestCaseIds.size === 0}
            onClick={() => setBulkDeleteDialogOpen(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete ({selectedTestCaseIds.size})
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                More
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportTests}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </DropdownMenuItem>
              <DropdownMenuItem onClick={importFromExcel}>
                <Upload className="h-4 w-4 mr-2" />
                Import
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />

          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-60 h-8" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-1" />
                Filters
                {(statusFilter !== "all" || priorityFilter !== "all") && <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                    {(statusFilter !== "all" ? 1 : 0) + (priorityFilter !== "all" ? 1 : 0)}
                  </Badge>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="p-2 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="not-run">Not Run</SelectItem>
                      <SelectItem value="passed">Passed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Priority</Label>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(statusFilter !== "all" || priorityFilter !== "all") && <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => {
                setStatusFilter("all");
                setPriorityFilter("all");
              }}>
                    Clear Filters
                  </Button>}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Test Case Table */}
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox checked={filteredTestCases.length > 0 && selectedTestCaseIds.size === filteredTestCases.length} onCheckedChange={handleSelectAll} />
                </TableHead>
                <TableHead className="w-28">Test Case ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-24">Automated</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-10">P</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading test cases...
                  </TableCell>
                </TableRow> : filteredTestCases.length === 0 ? <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <TestTube className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No test cases found
                  </TableCell>
                </TableRow> : filteredTestCases.map(testCase => <TableRow key={testCase.id} className="cursor-pointer hover:bg-muted/50" onClick={() => viewTestCaseDetail(testCase)}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selectedTestCaseIds.has(testCase.id)} onCheckedChange={checked => handleTestCaseSelect(testCase.id, checked as boolean)} />
                    </TableCell>
                    <TableCell className="font-mono text-sm text-primary">
                      {testCase.readableId || testCase.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-primary hover:underline">
                      {testCase.title}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Switch checked={testCase.automated} onCheckedChange={() => toggleAutomated(testCase)} />
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Badge className={`${getStatusColor(testCase.status)} uppercase text-xs cursor-pointer`}>
                            {testCase.status}
                          </Badge>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => updateStatus(testCase, 'draft')}>Draft</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(testCase, 'not-run')}>Not Run</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(testCase, 'passed')}>Passed</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(testCase, 'failed')}>Failed</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(testCase, 'blocked')}>Blocked</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell>
                      <Flag className={`h-4 w-4 ${getPriorityColor(testCase.priority)}`} />
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => viewTestCaseDetail(testCase)}>
                            <Edit3 className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => deleteTestCase(testCase.id, testCase.title)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>)}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* New Folder Dialog */}
      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Enter a name for the new folder</DialogDescription>
          </DialogHeader>
          <Input placeholder="Folder name" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>Cancel</Button>
            <Button onClick={createFolder} disabled={!newFolderName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Test Case Dialog */}
      <Dialog open={newTestCaseDialogOpen} onOpenChange={setNewTestCaseDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Test Case</DialogTitle>
            <DialogDescription>Add a new test case to {selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : 'All test cases'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input placeholder="Test case title" value={newTestCaseForm.title} onChange={e => setNewTestCaseForm(prev => ({
              ...prev,
              title: e.target.value
            }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea placeholder="Test case description" value={newTestCaseForm.description} onChange={e => setNewTestCaseForm(prev => ({
              ...prev,
              description: e.target.value
            }))} />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={newTestCaseForm.priority} onValueChange={value => setNewTestCaseForm(prev => ({
              ...prev,
              priority: value as any
            }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTestCaseDialogOpen(false)}>Cancel</Button>
            <Button onClick={createTestCase} disabled={!newTestCaseForm.title.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Case Detail Dialog */}
      <Dialog open={testCaseDetailOpen} onOpenChange={open => {
      setTestCaseDetailOpen(open);
      if (!open) setIsEditingDetail(false);
    }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedTestCaseForDetail && <>
              <DialogHeader>
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(isEditingDetail ? editDetailForm.status || selectedTestCaseForDetail.status : selectedTestCaseForDetail.status)}>
                      {isEditingDetail ? editDetailForm.status || selectedTestCaseForDetail.status : selectedTestCaseForDetail.status}
                    </Badge>
                    <Badge variant="outline">{isEditingDetail ? editDetailForm.priority : selectedTestCaseForDetail.priority}</Badge>
                    {(isEditingDetail ? editDetailForm.automated : selectedTestCaseForDetail.automated) && <Badge variant="secondary">Automated</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isEditingDetail && <Button variant="outline" size="sm" onClick={() => setIsEditingDetail(true)}>
                        <Edit3 className="h-4 w-4 mr-1" />
                        Edit
                      </Button>}
                    <DialogClose asChild>
                      <Button variant="outline" size="sm">Close</Button>
                    </DialogClose>
                  </div>
                </div>
                {isEditingDetail ? <Input value={editDetailForm.title || ""} onChange={e => setEditDetailForm(prev => ({
              ...prev,
              title: e.target.value
            }))} className="text-lg font-semibold" /> : <DialogTitle>{selectedTestCaseForDetail.title}</DialogTitle>}
                <DialogDescription>
                  ID: {selectedTestCaseForDetail.readableId || selectedTestCaseForDetail.id}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {isEditingDetail && <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Priority</Label>
                      <Select value={editDetailForm.priority} onValueChange={value => setEditDetailForm(prev => ({
                  ...prev,
                  priority: value as any
                }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select value={editDetailForm.status} onValueChange={value => setEditDetailForm(prev => ({
                  ...prev,
                  status: value as any
                }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="not-run">Not Run</SelectItem>
                          <SelectItem value="passed">Passed</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                          <SelectItem value="blocked">Blocked</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex items-center gap-2">
                        <Switch checked={editDetailForm.automated} onCheckedChange={checked => setEditDetailForm(prev => ({
                    ...prev,
                    automated: checked
                  }))} />
                        <Label>Automated</Label>
                      </div>
                    </div>
                  </div>}

                <div>
                  <Label className="font-medium">Description</Label>
                  {isEditingDetail ? <Textarea value={editDetailForm.description || ""} onChange={e => setEditDetailForm(prev => ({
                ...prev,
                description: e.target.value
              }))} className="mt-1" /> : <p className="text-sm text-muted-foreground mt-1">{selectedTestCaseForDetail.description || "No description"}</p>}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="font-medium">Test Steps</Label>
                    {isEditingDetail && <Button variant="outline" size="sm" onClick={() => {
                  const steps = editDetailForm.structuredSteps || [];
                  setEditDetailForm(prev => ({
                    ...prev,
                    structuredSteps: [...steps, {
                      stepNumber: steps.length + 1,
                      action: "",
                      testData: "",
                      expectedResult: ""
                    }]
                  }));
                }}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add Step
                      </Button>}
                  </div>
                  <div className="space-y-2">
                    {(isEditingDetail ? editDetailForm.structuredSteps : selectedTestCaseForDetail.structuredSteps)?.map((step, i) => <div key={i} className="p-3 bg-muted/50 rounded-lg">
                        {isEditingDetail ? <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-primary">{step.stepNumber}.</span>
                              <Input value={step.action} placeholder="Action" onChange={e => {
                        const steps = [...(editDetailForm.structuredSteps || [])];
                        steps[i] = {
                          ...steps[i],
                          action: e.target.value
                        };
                        setEditDetailForm(prev => ({
                          ...prev,
                          structuredSteps: steps
                        }));
                      }} className="flex-1" />
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                        const steps = (editDetailForm.structuredSteps || []).filter((_, idx) => idx !== i);
                        setEditDetailForm(prev => ({
                          ...prev,
                          structuredSteps: steps.map((s, idx) => ({
                            ...s,
                            stepNumber: idx + 1
                          }))
                        }));
                      }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pl-6">
                              <Input value={step.testData} placeholder="Test Data" onChange={e => {
                        const steps = [...(editDetailForm.structuredSteps || [])];
                        steps[i] = {
                          ...steps[i],
                          testData: e.target.value
                        };
                        setEditDetailForm(prev => ({
                          ...prev,
                          structuredSteps: steps
                        }));
                      }} />
                              <Input value={step.expectedResult} placeholder="Expected Result" onChange={e => {
                        const steps = [...(editDetailForm.structuredSteps || [])];
                        steps[i] = {
                          ...steps[i],
                          expectedResult: e.target.value
                        };
                        setEditDetailForm(prev => ({
                          ...prev,
                          structuredSteps: steps
                        }));
                      }} />
                            </div>
                          </div> : <>
                            <div className="flex gap-2">
                              <span className="font-medium text-primary">{step.stepNumber}.</span>
                              <span>{step.action}</span>
                            </div>
                            {step.testData && <p className="text-xs text-muted-foreground mt-1">Data: {step.testData}</p>}
                            {step.expectedResult && <p className="text-xs text-muted-foreground mt-1">Expected: {step.expectedResult}</p>}
                          </>}
                      </div>)}
                    {(isEditingDetail ? editDetailForm.structuredSteps : selectedTestCaseForDetail.structuredSteps)?.length === 0 && <p className="text-sm text-muted-foreground">No test steps defined</p>}
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                {isEditingDetail ? <>
                    <Button variant="outline" onClick={() => setIsEditingDetail(false)}>Cancel</Button>
                    <Button onClick={updateTestCase}>
                      <Save className="h-4 w-4 mr-1" />
                      Save Changes
                    </Button>
                  </> : <>
                    <Button variant="outline" onClick={() => {
                setSelectedStoryForJava({
                  testCases: [selectedTestCaseForDetail],
                  storyTitle: selectedTestCaseForDetail.title,
                  userStoryId: selectedTestCaseForDetail.userStoryId
                });
                setJavaDialogOpen(true);
                setTestCaseDetailOpen(false);
              }}>
                      <Code2 className="h-4 w-4 mr-1" />
                      Generate Script
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive">
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Test Case</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => {
                      deleteTestCase(selectedTestCaseForDetail.id, selectedTestCaseForDetail.title);
                      setTestCaseDetailOpen(false);
                    }}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>}
              </DialogFooter>
            </>}
        </DialogContent>
      </Dialog>

      {/* Hidden file input */}
      <input type="file" ref={fileInputRef} accept=".xlsx,.xls" style={{
      display: "none"
    }} onChange={handleFileUpload} />

      {/* Java Generation Dialog */}
      <JavaGenerationDialog open={javaDialogOpen} onOpenChange={setJavaDialogOpen} onGenerate={handleJavaGeneration} isLoading={isGeneratingJava} projectId={projectId} userStoryId={selectedStoryForJava?.userStoryId} />

      {/* AI Test Case Generation Dialog */}
      <Dialog open={aiGenerationDialogOpen} onOpenChange={setAiGenerationDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Generate Test Case with AI</DialogTitle>
            <DialogDescription>
              Enter a title and description, and AI will generate comprehensive test cases for you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ai-title">Title *</Label>
              <Input
                id="ai-title"
                placeholder="e.g., User Login Functionality"
                value={aiGenerationForm.title}
                onChange={(e) => setAiGenerationForm(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-description">Description</Label>
              <Textarea
                id="ai-description"
                placeholder="Describe what should be tested, e.g., Test the login page with valid and invalid credentials, password recovery, etc."
                value={aiGenerationForm.description}
                onChange={(e) => setAiGenerationForm(prev => ({ ...prev, description: e.target.value }))}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-custom-prompt">Custom Instructions (Optional)</Label>
              <Textarea
                id="ai-custom-prompt"
                placeholder="e.g., Focus on security testing, Include edge cases for invalid inputs, Generate tests for mobile responsiveness..."
                value={aiGenerationForm.customPrompt}
                onChange={(e) => setAiGenerationForm(prev => ({ ...prev, customPrompt: e.target.value }))}
                className="min-h-[80px]"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <div>
                  <Label htmlFor="use-learned-patterns" className="text-sm font-medium cursor-pointer">
                    Use Learned Patterns
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Generate test cases using approved patterns from your organization
                  </p>
                </div>
              </div>
              <Switch
                id="use-learned-patterns"
                checked={aiGenerationForm.useLearnedPatterns}
                onCheckedChange={(checked) => setAiGenerationForm(prev => ({ ...prev, useLearnedPatterns: checked }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-image-upload">Upload Images (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Upload screenshots or mockups to help generate more specific test cases (max 5 images)
              </p>
              <div className="flex items-center gap-4">
                <input
                  id="ai-image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAiImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById("ai-image-upload")?.click()}
                  className="flex items-center gap-2"
                  disabled={aiUploadedImages.length >= 5}
                >
                  <Upload className="w-4 h-4" />
                  Upload Images ({aiUploadedImages.length}/5)
                </Button>
                {aiUploadedImages.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={removeAllAiImages}
                    className="text-destructive hover:text-destructive"
                  >
                    Remove All
                  </Button>
                )}
              </div>

              {aiImagePreviews.length > 0 && (
                <div className="mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    {aiImagePreviews.map((preview, index) => (
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
                          onClick={() => removeAiImage(index)}
                          className="absolute top-1 right-1 h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          ×
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {aiUploadedImages[index]?.name} ({Math.round((aiUploadedImages[index]?.size || 0) / 1024)}KB)
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiGenerationDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={generateTestCaseWithAi} disabled={isGeneratingAi || !aiGenerationForm.title.trim()}>
              {isGeneratingAi ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {isGeneratingAi ? "Generating..." : "Generate Test Cases"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Case Approval Dialog */}
      <TestCaseApprovalDialog
        open={approvalDialogOpen}
        onOpenChange={setApprovalDialogOpen}
        testCases={pendingApprovalTestCases}
        confidence={pendingApprovalConfidence}
        warnings={pendingApprovalWarnings}
        onApprove={handleApproveTestCases}
        onReject={handleRejectTestCases}
        isProcessing={isProcessingApproval}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedTestCaseIds.size} Test Case(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected test cases.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingBulk}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={bulkDeleteTestCases}
              disabled={isDeletingBulk}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingBulk ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
};