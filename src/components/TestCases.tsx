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
import { supabase } from "@/integrations/supabase/client";
import { publicProjectIds } from "@/config/features";
import { 
  TestTube, CheckCircle, XCircle, Clock, Search, Download, Upload, Code2, 
  ChevronDown, ChevronRight, Trash2, Edit3, Save, X, Plus, FolderPlus, 
  Folder, FolderOpen, Flag, MoreHorizontal, Filter, Archive, Copy, Settings
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export const TestCases = ({ projectId }: TestCasesProps) => {
  const { toast } = useToast();
  const { session } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
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

  // Load folders and test cases
  const loadFoldersAndTestCases = async () => {
    const isPublicProject = publicProjectIds.includes(projectId as any);
    if (!session?.user?.id && !isPublicProject) return;
    setIsLoading(true);
    try {
      // Load user stories as folders
      const { data: userStories, error: storiesError } = await supabase
        .from("user_stories")
        .select("id, title")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      
      if (storiesError) throw storiesError;

      // Load custom folders
      const { data: customFolders, error: foldersError } = await supabase
        .from("test_case_folders")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_custom", true)
        .order("created_at", { ascending: true });
      
      if (foldersError) throw foldersError;

      // Load test cases
      const { data: dbTestCases, error: testCasesError } = await supabase
        .from("test_cases")
        .select(`*, user_stories(title, project_id)`)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

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
      const storyFolders: TestCaseFolder[] = (userStories || [])
        .filter(story => (testCasesByStory.get(story.id) || 0) > 0)
        .map(story => ({
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

        const stepsStr = typeof tc.steps === 'string' ? tc.steps : '';
        if (structuredSteps.length === 0 && stepsStr) {
          const legacySteps = stepsStr.split("\n").filter((step: string) => step.trim());
          structuredSteps = legacySteps.map((step: string, index: number) => ({
            stepNumber: index + 1,
            action: step,
            testData: "",
            expectedResult: ""
          }));
        }

        const testDataStr = typeof tc.test_data === 'string' ? tc.test_data : (tc.test_data ? JSON.stringify(tc.test_data) : '');
        
        return {
          id: tc.id,
          readableId: tc.readable_id,
          title: tc.title,
          description: tc.description || "",
          steps: stepsStr ? stepsStr.split("\n").filter((step: string) => step.trim()) : [],
          structuredSteps: structuredSteps,
          testData: testDataStr,
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

  useEffect(() => {
    const isPublicProject = publicProjectIds.includes(projectId as any);
    if ((session?.user?.id || isPublicProject) && projectId) {
      loadFoldersAndTestCases();
    }
  }, [session?.user?.id, projectId]);

  // Get filtered test cases for selected folder
  const getFilteredTestCases = () => {
    let filtered = testCases;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(tc => 
        tc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tc.readableId?.toLowerCase().includes(searchTerm.toLowerCase())
      );
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

    return filtered;
  };

  const filteredTestCases = getFilteredTestCases();

  // Total test case count
  const totalTestCaseCount = testCases.length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "passed": return "bg-success text-success-foreground";
      case "failed": return "bg-destructive text-destructive-foreground";
      case "blocked": return "bg-warning text-warning-foreground";
      case "draft": return "bg-secondary text-secondary-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-destructive";
      case "medium": return "text-warning";
      case "low": return "text-success";
      default: return "text-muted-foreground";
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
      const { error } = await supabase
        .from("test_case_folders")
        .insert({
          name: newFolderName.trim(),
          project_id: projectId,
          is_custom: true,
          user_id: session.user.id
        });

      if (error) throw error;

      toast({ title: "Folder created successfully" });
      setNewFolderDialogOpen(false);
      setNewFolderName("");
      loadFoldersAndTestCases();
    } catch (error) {
      console.error("Error creating folder:", error);
      toast({ title: "Failed to create folder", variant: "destructive" });
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

      const { error } = await supabase
        .from("test_cases")
        .insert(testCaseData);

      if (error) throw error;

      toast({ title: "Test case created successfully" });
      setNewTestCaseDialogOpen(false);
      setNewTestCaseForm({ title: "", description: "", priority: "medium", structuredSteps: [] });
      loadFoldersAndTestCases();
    } catch (error) {
      console.error("Error creating test case:", error);
      toast({ title: "Failed to create test case", variant: "destructive" });
    }
  };

  // Delete test case
  const deleteTestCase = async (testCaseId: string, testCaseTitle: string) => {
    try {
      const { error } = await supabase
        .from("test_cases")
        .delete()
        .eq("id", testCaseId);

      if (error) throw error;

      setTestCases(prev => prev.filter(tc => tc.id !== testCaseId));
      toast({ title: "Test Case Deleted", description: `"${testCaseTitle}" has been deleted` });
    } catch (error) {
      console.error("Error deleting test case:", error);
      toast({ title: "Delete Failed", variant: "destructive" });
    }
  };

  // Delete folder
  const deleteFolder = async (folderId: string) => {
    try {
      const { error } = await supabase
        .from("test_case_folders")
        .delete()
        .eq("id", folderId);

      if (error) throw error;

      toast({ title: "Folder deleted successfully" });
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
      loadFoldersAndTestCases();
    } catch (error) {
      console.error("Error deleting folder:", error);
      toast({ title: "Failed to delete folder", variant: "destructive" });
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

      const { error } = await supabase
        .from("test_cases")
        .update({
          title: editDetailForm.title,
          description: editDetailForm.description,
          priority: editDetailForm.priority,
          status: editDetailForm.status,
          automated: editDetailForm.automated,
          structured_steps: stepsForDb
        })
        .eq("id", selectedTestCaseForDetail.id);

      if (error) throw error;

      toast({ title: "Test case updated successfully" });
      setIsEditingDetail(false);
      setTestCaseDetailOpen(false);
      loadFoldersAndTestCases();
    } catch (error) {
      console.error("Error updating test case:", error);
      toast({ title: "Failed to update test case", variant: "destructive" });
    }
  };

  // Toggle automated status
  const toggleAutomated = async (testCase: TestCase) => {
    try {
      const { error } = await supabase
        .from("test_cases")
        .update({ automated: !testCase.automated })
        .eq("id", testCase.id);

      if (error) throw error;

      setTestCases(prev => prev.map(tc => 
        tc.id === testCase.id ? { ...tc, automated: !tc.automated } : tc
      ));
      toast({ title: testCase.automated ? "Marked as manual" : "Marked as automated" });
    } catch (error) {
      console.error("Error updating automated status:", error);
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  // Update test case status
  const updateStatus = async (testCase: TestCase, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("test_cases")
        .update({ status: newStatus })
        .eq("id", testCase.id);

      if (error) throw error;

      setTestCases(prev => prev.map(tc => 
        tc.id === testCase.id ? { ...tc, status: newStatus as any } : tc
      ));
      toast({ title: `Status updated to ${newStatus}` });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  };

  // Open Java generation for selected test cases
  const openJavaGeneration = () => {
    const selectedTestCases = testCases.filter(tc => selectedTestCaseIds.has(tc.id));
    if (selectedTestCases.length === 0) {
      toast({ title: "Please select at least one test case", variant: "destructive" });
      return;
    }
    setSelectedStoryForJava({
      testCases: selectedTestCases,
      storyTitle: "Selected Test Cases",
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
    toast({ title: "Export Complete" });
  };

  const importFromExcel = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const isPublicProject = publicProjectIds.includes(projectId as any);
    if (!session?.user?.id && !isPublicProject) {
      toast({ title: "Authentication required", variant: "destructive" });
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        toast({ title: "No data found in file", variant: "destructive" });
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

        const { error } = await supabase
          .from("test_cases")
          .insert(testCaseData);

        if (!error) importedCount++;
      }

      toast({ 
        title: "Import Complete", 
        description: `Successfully imported ${importedCount} test cases` 
      });
      loadFoldersAndTestCases();
    } catch (error) {
      console.error("Error importing file:", error);
      toast({ title: "Import failed", description: "Error reading file", variant: "destructive" });
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Java generation handlers
  const handleJavaGeneration = async (
    mockupFiles: File[], 
    htmlDom: string, 
    selectedElements?: Array<{ name: string; xpath: string; tagName: string; locatorStrategy: string }>,
    selectedTestCases?: Array<{ id: string; title: string; description?: string }>,
    outputOption?: 'repository' | 'download'
  ) => {
    if (!selectedStoryForJava) {
      toast({ title: "No test cases selected", variant: "destructive" });
      return;
    }

    setIsGeneratingJava(true);
    const saveToRepository = outputOption !== 'download';

    try {
      const testCasesToGenerate = selectedTestCases?.length 
        ? selectedStoryForJava.testCases.filter(tc => selectedTestCases.some(stc => stc.id === tc.id))
        : selectedStoryForJava.testCases;

      if (testCasesToGenerate.length === 0) {
        toast({ title: "No test cases selected for generation", variant: "destructive" });
        setIsGeneratingJava(false);
        return;
      }

      // Fetch project name once
      const { data: projectData } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single();

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
        let steps: Array<{ type: string; content: string }> = [];
        if (tc.structuredSteps && Array.isArray(tc.structuredSteps)) {
          steps = tc.structuredSteps.map((s: any) => ({
            type: s.type || 'action',
            content: s.action || s.content || ''
          }));
        } else if (tc.steps && tc.steps.length > 0) {
          steps = tc.steps.map((s: string) => ({ type: 'action', content: s }));
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

        const { data, error } = await supabase.functions.invoke('generate-java-automation-files', {
          body: { 
            testCase: testCasePayload, 
            projectId,
            projectName: projectData?.name || 'TestProject',
            saveToRepository
          }
        });

        if (error) {
          console.error('Error generating automation for:', tc.title, error);
          toast({ title: `Error generating ${tc.title}`, description: error.message, variant: "destructive" });
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
          const content = await zip.generateAsync({ type: 'blob' });
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
          await supabase
            .from("test_cases")
            .update({ automated: true })
            .eq("id", tc.id);
        }
        
        loadFoldersAndTestCases();
      } else {
        toast({ title: "No files generated", description: "Could not generate automation files", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error in Java generation:", error);
      toast({ title: "Generation failed", description: "An error occurred during generation", variant: "destructive" });
    } finally {
      setIsGeneratingJava(false);
      setJavaDialogOpen(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-180px)] gap-0 overflow-hidden rounded-lg border border-border bg-card">
      {/* Left Sidebar - Folder Tree */}
      <div className="w-72 border-r border-border flex flex-col">
        {/* Folder Header */}
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-1"
            onClick={() => setNewFolderDialogOpen(true)}
          >
            <FolderPlus className="h-4 w-4" />
            New Folder
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Folder List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {/* All Test Cases */}
            <div 
              className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-muted/50 ${
                selectedFolderId === null ? 'bg-primary/10 text-primary' : ''
              }`}
              onClick={() => handleFolderSelect(null)}
            >
              <Folder className="h-4 w-4" />
              <span className="font-medium flex-1">All test cases</span>
              <span className="text-xs text-muted-foreground">({totalTestCaseCount})</span>
            </div>

            {/* User Story Folders */}
            {folders.filter(f => !f.isCustom).map(folder => (
              <div key={folder.id} className="mt-1">
                <div 
                  className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-muted/50 ${
                    selectedFolderId === folder.id ? 'bg-primary/10 text-primary' : ''
                  }`}
                  onClick={() => handleFolderSelect(folder.id)}
                >
                  <ChevronRight 
                    className={`h-4 w-4 transition-transform ${expandedFolders.has(folder.id) ? 'rotate-90' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFolderExpansion(folder.id);
                    }}
                  />
                  {selectedFolderId === folder.id ? (
                    <FolderOpen className="h-4 w-4 text-primary" />
                  ) : (
                    <Folder className="h-4 w-4" />
                  )}
                  <span className="flex-1 truncate text-sm">{folder.name}</span>
                  <span className="text-xs text-muted-foreground">({folder.testCaseCount})</span>
                </div>
              </div>
            ))}

            {/* Custom Folders */}
            {folders.filter(f => f.isCustom).length > 0 && (
              <div className="mt-4 mb-2 px-2">
                <span className="text-xs text-muted-foreground uppercase font-medium">Custom Folders</span>
              </div>
            )}
            {folders.filter(f => f.isCustom).map(folder => (
              <div key={folder.id} className="mt-1">
                <div 
                  className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-muted/50 group ${
                    selectedFolderId === folder.id ? 'bg-primary/10 text-primary' : ''
                  }`}
                  onClick={() => handleFolderSelect(folder.id)}
                >
                  {selectedFolderId === folder.id ? (
                    <FolderOpen className="h-4 w-4 text-primary" />
                  ) : (
                    <Folder className="h-4 w-4" />
                  )}
                  <span className="flex-1 truncate text-sm">{folder.name}</span>
                  <span className="text-xs text-muted-foreground">({folder.testCaseCount})</span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
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
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right Content - Test Case Table */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Action Bar */}
        <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
          <Button 
            size="sm" 
            className="gap-1 bg-primary"
            onClick={() => setNewTestCaseDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            New Test Case
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            disabled={selectedTestCaseIds.size === 0}
            onClick={openJavaGeneration}
          >
            <Code2 className="h-4 w-4 mr-1" />
            Generate Script
          </Button>
          <Button variant="outline" size="sm" disabled={selectedTestCaseIds.size === 0}>
            <Copy className="h-4 w-4 mr-1" />
            Clone
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
            <Input 
              placeholder="Search..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="pl-8 w-60 h-8"
            />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-1" />
            Filters
          </Button>
        </div>

        {/* Test Case Table */}
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox 
                    checked={filteredTestCases.length > 0 && selectedTestCaseIds.size === filteredTestCases.length}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-10">P</TableHead>
                <TableHead className="w-28">Key</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-24">Automated</TableHead>
                <TableHead className="w-28 text-right">Status</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading test cases...
                  </TableCell>
                </TableRow>
              ) : filteredTestCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <TestTube className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No test cases found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTestCases.map(testCase => (
                  <TableRow 
                    key={testCase.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => viewTestCaseDetail(testCase)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox 
                        checked={selectedTestCaseIds.has(testCase.id)}
                        onCheckedChange={(checked) => handleTestCaseSelect(testCase.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell>
                      <Flag className={`h-4 w-4 ${getPriorityColor(testCase.priority)}`} />
                    </TableCell>
                    <TableCell className="font-mono text-sm text-primary">
                      {testCase.readableId || testCase.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-primary hover:underline">
                      {testCase.title}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch 
                        checked={testCase.automated} 
                        onCheckedChange={() => toggleAutomated(testCase)}
                      />
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
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
                          <DropdownMenuItem onClick={() => {
                            setSelectedStoryForJava({
                              testCases: [testCase],
                              storyTitle: testCase.title,
                              userStoryId: testCase.userStoryId
                            });
                            setJavaDialogOpen(true);
                          }}>
                            <Code2 className="h-4 w-4 mr-2" />
                            Generate Script
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => deleteTestCase(testCase.id, testCase.title)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
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
          <Input 
            placeholder="Folder name" 
            value={newFolderName} 
            onChange={(e) => setNewFolderName(e.target.value)}
          />
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
              <Input 
                placeholder="Test case title" 
                value={newTestCaseForm.title} 
                onChange={(e) => setNewTestCaseForm(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea 
                placeholder="Test case description" 
                value={newTestCaseForm.description} 
                onChange={(e) => setNewTestCaseForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div>
              <Label>Priority</Label>
              <Select 
                value={newTestCaseForm.priority} 
                onValueChange={(value) => setNewTestCaseForm(prev => ({ ...prev, priority: value as any }))}
              >
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
      <Dialog open={testCaseDetailOpen} onOpenChange={(open) => {
        setTestCaseDetailOpen(open);
        if (!open) setIsEditingDetail(false);
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedTestCaseForDetail && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(isEditingDetail ? (editDetailForm.status || selectedTestCaseForDetail.status) : selectedTestCaseForDetail.status)}>
                      {isEditingDetail ? (editDetailForm.status || selectedTestCaseForDetail.status) : selectedTestCaseForDetail.status}
                    </Badge>
                    <Badge variant="outline">{isEditingDetail ? editDetailForm.priority : selectedTestCaseForDetail.priority}</Badge>
                    {(isEditingDetail ? editDetailForm.automated : selectedTestCaseForDetail.automated) && (
                      <Badge variant="secondary">Automated</Badge>
                    )}
                  </div>
                  {!isEditingDetail && (
                    <Button variant="outline" size="sm" onClick={() => setIsEditingDetail(true)}>
                      <Edit3 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
                {isEditingDetail ? (
                  <Input 
                    value={editDetailForm.title || ""} 
                    onChange={(e) => setEditDetailForm(prev => ({ ...prev, title: e.target.value }))}
                    className="text-lg font-semibold"
                  />
                ) : (
                  <DialogTitle>{selectedTestCaseForDetail.title}</DialogTitle>
                )}
                <DialogDescription>
                  ID: {selectedTestCaseForDetail.readableId || selectedTestCaseForDetail.id}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {isEditingDetail && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Priority</Label>
                      <Select 
                        value={editDetailForm.priority} 
                        onValueChange={(value) => setEditDetailForm(prev => ({ ...prev, priority: value as any }))}
                      >
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
                      <Select 
                        value={editDetailForm.status} 
                        onValueChange={(value) => setEditDetailForm(prev => ({ ...prev, status: value as any }))}
                      >
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
                        <Switch 
                          checked={editDetailForm.automated} 
                          onCheckedChange={(checked) => setEditDetailForm(prev => ({ ...prev, automated: checked }))}
                        />
                        <Label>Automated</Label>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <Label className="font-medium">Description</Label>
                  {isEditingDetail ? (
                    <Textarea 
                      value={editDetailForm.description || ""} 
                      onChange={(e) => setEditDetailForm(prev => ({ ...prev, description: e.target.value }))}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">{selectedTestCaseForDetail.description || "No description"}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="font-medium">Test Steps</Label>
                    {isEditingDetail && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          const steps = editDetailForm.structuredSteps || [];
                          setEditDetailForm(prev => ({
                            ...prev,
                            structuredSteps: [...steps, { stepNumber: steps.length + 1, action: "", testData: "", expectedResult: "" }]
                          }));
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Step
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(isEditingDetail ? editDetailForm.structuredSteps : selectedTestCaseForDetail.structuredSteps)?.map((step, i) => (
                      <div key={i} className="p-3 bg-muted/50 rounded-lg">
                        {isEditingDetail ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-primary">{step.stepNumber}.</span>
                              <Input 
                                value={step.action} 
                                placeholder="Action"
                                onChange={(e) => {
                                  const steps = [...(editDetailForm.structuredSteps || [])];
                                  steps[i] = { ...steps[i], action: e.target.value };
                                  setEditDetailForm(prev => ({ ...prev, structuredSteps: steps }));
                                }}
                                className="flex-1"
                              />
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => {
                                  const steps = (editDetailForm.structuredSteps || []).filter((_, idx) => idx !== i);
                                  setEditDetailForm(prev => ({ ...prev, structuredSteps: steps.map((s, idx) => ({ ...s, stepNumber: idx + 1 })) }));
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pl-6">
                              <Input 
                                value={step.testData} 
                                placeholder="Test Data"
                                onChange={(e) => {
                                  const steps = [...(editDetailForm.structuredSteps || [])];
                                  steps[i] = { ...steps[i], testData: e.target.value };
                                  setEditDetailForm(prev => ({ ...prev, structuredSteps: steps }));
                                }}
                              />
                              <Input 
                                value={step.expectedResult} 
                                placeholder="Expected Result"
                                onChange={(e) => {
                                  const steps = [...(editDetailForm.structuredSteps || [])];
                                  steps[i] = { ...steps[i], expectedResult: e.target.value };
                                  setEditDetailForm(prev => ({ ...prev, structuredSteps: steps }));
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex gap-2">
                              <span className="font-medium text-primary">{step.stepNumber}.</span>
                              <span>{step.action}</span>
                            </div>
                            {step.testData && <p className="text-xs text-muted-foreground mt-1">Data: {step.testData}</p>}
                            {step.expectedResult && <p className="text-xs text-muted-foreground mt-1">Expected: {step.expectedResult}</p>}
                          </>
                        )}
                      </div>
                    ))}
                    {(isEditingDetail ? editDetailForm.structuredSteps : selectedTestCaseForDetail.structuredSteps)?.length === 0 && (
                      <p className="text-sm text-muted-foreground">No test steps defined</p>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                {isEditingDetail ? (
                  <>
                    <Button variant="outline" onClick={() => setIsEditingDetail(false)}>Cancel</Button>
                    <Button onClick={updateTestCase}>
                      <Save className="h-4 w-4 mr-1" />
                      Save Changes
                    </Button>
                  </>
                ) : (
                  <>
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setSelectedStoryForJava({
                          testCases: [selectedTestCaseForDetail],
                          storyTitle: selectedTestCaseForDetail.title,
                          userStoryId: selectedTestCaseForDetail.userStoryId
                        });
                        setJavaDialogOpen(true);
                        setTestCaseDetailOpen(false);
                      }}
                    >
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
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden file input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        accept=".xlsx,.xls" 
        style={{ display: "none" }} 
        onChange={handleFileUpload} 
      />

      {/* Java Generation Dialog */}
      <JavaGenerationDialog 
        open={javaDialogOpen} 
        onOpenChange={setJavaDialogOpen} 
        onGenerate={handleJavaGeneration} 
        isLoading={isGeneratingJava} 
        projectId={projectId}
        userStoryId={selectedStoryForJava?.userStoryId}
      />
    </div>
  );
};
