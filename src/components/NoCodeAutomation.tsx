import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import JSZip from "jszip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Play, Trash2, Edit, Eye, Check, X, Circle, CheckCircle2, XCircle, Loader2, Upload, AlertCircle, ChevronUp, ChevronDown, Image, Copy, FolderPlus, Layers, Download, Folder, ChevronRight, FolderOpen, GripVertical, Wand2, Sparkles, FileText, FileSpreadsheet, Video, Square } from "lucide-react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
interface NoCodeAutomationProps {
  projectId: string;
}
import { ACTIONS, ACTION_CATEGORIES, ActionType, ActionCategory, getActionDefinition, getActionIcon, getActionsByCategory, ActionDefinition } from "@/lib/playwrightActions";
interface TestStep {
  id: string;
  type: ActionType;
  selector?: string;
  value?: string;
  description: string;
  extraData?: Record<string, any>;
  skip?: boolean;
}
interface NoCodeTest {
  id: string;
  name: string;
  description: string | null;
  base_url: string;
  steps: any; // Json type from database
  status: string;
  created_at: string;
  test_case_id?: string | null;
  folder_id?: string | null;
}
interface TestFolder {
  id: string;
  name: string;
  project_id: string;
  created_at: string;
}
interface TestExecution {
  id: string;
  test_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  results?: any;
  error_message: string | null;
}
interface DBTestCase {
  id: string;
  title: string;
  description: string | null;
  structured_steps: any;
  steps: any; // Can be JSON or string
  expected_result: string | null;
  user_stories?: {
    title: string;
  };
}
interface ConversionPreview {
  testCase: DBTestCase;
  originalSteps: string[];
  convertedSteps: TestStep[];
  willUpdate: boolean;
}
interface TestSuite {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  test_count?: number;
  // Statistics from executions
  total_runs?: number;
  last_run?: string;
  last_status?: string;
  pass_rate?: number;
  total_passed?: number;
  total_failed?: number;
}
interface SuiteTest {
  id: string;
  suite_id: string;
  test_id: string;
  execution_order: number;
  test?: NoCodeTest;
}
interface SuiteExecution {
  id: string;
  suite_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  results: any;
}

// Draggable Test Component
const DraggableTest = ({
  test,
  isSelected,
  onSelect,
  onStatusChange,
  isChecked,
  onCheckChange,
  showCheckbox
}: {
  test: NoCodeTest;
  isSelected: boolean;
  onSelect: () => void;
  onStatusChange: (value: string) => void;
  isChecked: boolean;
  onCheckChange: (checked: boolean) => void;
  showCheckbox: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useDraggable({
    id: test.id
  });
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`
  } : undefined;
  return <Card ref={setNodeRef} style={style} className={`cursor-pointer transition-all hover:shadow-md ${isSelected ? "ring-2 ring-primary" : ""} ${isDragging ? "opacity-50" : ""} ${isChecked ? "bg-primary/5" : ""}`} onClick={onSelect}>
    <CardContent className="p-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {showCheckbox && <Checkbox checked={isChecked} onCheckedChange={checked => onCheckChange(checked as boolean)} onClick={e => e.stopPropagation()} className="mr-1" />}
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-sm">{test.name}</h3>
        </div>
        <Select value={test.status} onValueChange={onStatusChange}>
          <SelectTrigger className="w-auto h-5 px-1.5 text-xs" onClick={e => e.stopPropagation()}>
            <Badge variant={test.status === "failed" ? "destructive" : "secondary"} className={`text-xs ${test.status === "passed" ? "bg-green-500 hover:bg-green-600" : test.status === "active" ? "bg-blue-500 hover:bg-blue-600" : ""}`}>
              {test.status}
            </Badge>
          </SelectTrigger>
          <SelectContent onClick={e => e.stopPropagation()}>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="passed">Passed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 ml-6">
        <span>{(Array.isArray(test.steps) ? test.steps : []).length} steps</span>
      </div>
    </CardContent>
  </Card>;
};

// Droppable Folder Component
const DroppableFolder = ({
  id,
  children,
  isOver: _
}: {
  id: string;
  children: React.ReactNode;
  isOver: boolean;
}) => {
  const {
    isOver,
    setNodeRef
  } = useDroppable({
    id
  });
  return <div ref={setNodeRef} className={`transition-colors rounded-md ${isOver ? "bg-primary/10 ring-2 ring-primary/30" : ""}`}>
    {children}
  </div>;
};

// Sortable Suite Test Component
const SortableSuiteTest = ({
  suiteTest,
  index,
  onRemove
}: {
  suiteTest: SuiteTest;
  index: number;
  onRemove: () => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: suiteTest.id
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };
  return <Card ref={setNodeRef} style={style} className={`border-l-4 border-l-primary/50 ${isDragging ? "shadow-lg" : ""}`}>
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
            {index + 1}
          </div>
          <div>
            <p className="font-medium">{suiteTest.test?.name || "Unknown Test"}</p>
            <p className="text-xs text-muted-foreground">{(suiteTest.test?.steps as any[])?.length || 0} steps</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </CardContent>
  </Card>;
};

// Sortable Create Step Component
const SortableCreateStep = ({
  step,
  index,
  onEdit,
  onInsert,
  onRemove,
  onToggleSkip
}: {
  step: TestStep;
  index: number;
  onEdit: () => void;
  onInsert: () => void;
  onRemove: () => void;
  onToggleSkip: (skip: boolean) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: step.id
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };
  return <Card ref={setNodeRef} style={style} className={cn(isDragging ? "shadow-lg" : "", step.skip && "opacity-60")}>
    <CardContent className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="text-sm font-semibold text-muted-foreground">{index + 1}.</span>
          <Badge variant="outline">{step.type}</Badge>
          <span className={cn("text-sm", step.skip && "line-through text-muted-foreground")}>{step.description}</span>
          {step.skip && <Badge variant="secondary" className="text-xs">Skipped</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 mr-2">
            <Checkbox id={`skip-create-${step.id}`} checked={step.skip || false} onCheckedChange={checked => onToggleSkip(checked === true)} />
            <Label htmlFor={`skip-create-${step.id}`} className="text-xs text-muted-foreground cursor-pointer">
              Skip
            </Label>
          </div>
          <Button size="sm" variant="ghost" onClick={onEdit} title="Edit step">
            <Edit className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onInsert} title="Insert step below">
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>;
};
export const NoCodeAutomation = ({
  projectId
}: NoCodeAutomationProps) => {
  const {
    toast
  } = useToast();
  const [tests, setTests] = useState<NoCodeTest[]>([]);
  const [selectedTest, setSelectedTest] = useState<NoCodeTest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [executions, setExecutions] = useState<TestExecution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<TestExecution | null>(null);

  // Import states
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [availableTestCases, setAvailableTestCases] = useState<DBTestCase[]>([]);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string>("");
  const [conversionPreview, setConversionPreview] = useState<ConversionPreview | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [editedSteps, setEditedSteps] = useState<TestStep[]>([]);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [showLiveProgressDialog, setShowLiveProgressDialog] = useState(false);
  const [liveExecution, setLiveExecution] = useState<TestExecution | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Element extraction states
  const [mockupFiles, setMockupFiles] = useState<File[]>([]);
  const [htmlDom, setHtmlDom] = useState("");
  const [parsedElements, setParsedElements] = useState<{
    name: string;
    xpath: string;
    tagName: string;
    locatorStrategy: string;
  }[]>([]);
  const [selectedElements, setSelectedElements] = useState<Set<number>>(new Set());
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [showElementExtractionDialog, setShowElementExtractionDialog] = useState(false);

  // Edit test states
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editTestName, setEditTestName] = useState("");
  const [editTestDescription, setEditTestDescription] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editTestSteps, setEditTestSteps] = useState<TestStep[]>([]);
  const [showEditStepDialog, setShowEditStepDialog] = useState(false);
  const [editStepIndex, setEditStepIndex] = useState<number | null>(null);
  const [insertStepAtIndex, setInsertStepAtIndex] = useState<number | null>(null);
  const [insertEditStepAtIndex, setInsertEditStepAtIndex] = useState<number | null>(null);
  const [editCreateStepIndex, setEditCreateStepIndex] = useState<number | null>(null);

  // Form states
  const [testName, setTestName] = useState("");
  const [testDescription, setTestDescription] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [currentSteps, setCurrentSteps] = useState<TestStep[]>([]);

  // Create dialog mockup/HTML states for AI step generation
  const [createMockupFiles, setCreateMockupFiles] = useState<File[]>([]);
  const [createHtmlDom, setCreateHtmlDom] = useState("");
  const [isGeneratingSteps, setIsGeneratingSteps] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  // Step form states
  const [stepType, setStepType] = useState<TestStep["type"]>("click");
  const [stepSelector, setStepSelector] = useState("");
  const [stepValue, setStepValue] = useState("");
  const [stepDescription, setStepDescription] = useState("");
  const [stepExtraData, setStepExtraData] = useState<Record<string, any>>({});
  const [selectedActionCategory, setSelectedActionCategory] = useState<ActionCategory>("interaction");
  const [stepSkip, setStepSkip] = useState(false);

  // Delete confirmation state
  const [testToDelete, setTestToDelete] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  // Test Suite states
  const [activeTab, setActiveTab] = useState<"tests" | "suites">("tests");
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [selectedSuite, setSelectedSuite] = useState<TestSuite | null>(null);
  const [suiteTests, setSuiteTests] = useState<SuiteTest[]>([]);
  const [showCreateSuiteDialog, setShowCreateSuiteDialog] = useState(false);
  const [showAddTestsToSuiteDialog, setShowAddTestsToSuiteDialog] = useState(false);
  const [suiteName, setSuiteName] = useState("");
  const [suiteDescription, setSuiteDescription] = useState("");
  const [selectedTestsForSuite, setSelectedTestsForSuite] = useState<Set<string>>(new Set());
  const [suiteExecutions, setSuiteExecutions] = useState<SuiteExecution[]>([]);
  const [isRunningSuite, setIsRunningSuite] = useState(false);
  const [currentSuiteExecution, setCurrentSuiteExecution] = useState<SuiteExecution | null>(null);
  const [showSuiteLogsDialog, setShowSuiteLogsDialog] = useState(false);
  const [selectedSuiteExecution, setSelectedSuiteExecution] = useState<SuiteExecution | null>(null);
  const [expandedTestResults, setExpandedTestResults] = useState<Set<string>>(new Set());
  const [testStepResults, setTestStepResults] = useState<{
    [key: string]: any[];
  }>({});
  const [fullscreenScreenshot, setFullscreenScreenshot] = useState<string | null>(null);

  // Folder states
  const [folders, setFolders] = useState<TestFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [importToFolderId, setImportToFolderId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");

  // Bulk selection states
  const [bulkSelectedTests, setBulkSelectedTests] = useState<Set<string>>(new Set());
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  const [bulkMoveTargetFolderId, setBulkMoveTargetFolderId] = useState<string | null>(null);

  // Auto-heal states
  const [isAutoHealing, setIsAutoHealing] = useState(false);
  const [showAutoHealDialog, setShowAutoHealDialog] = useState(false);
  const [autoHealResult, setAutoHealResult] = useState<{
    analysis: string;
    fixes: {
      stepIndex: number;
      issue: string;
      fix: string;
    }[];
    fixedSteps: TestStep[];
  } | null>(null);
  const [isApplyingFix, setIsApplyingFix] = useState(false);

  // Visual baseline states
  const [isSavingBaseline, setIsSavingBaseline] = useState(false);
  const [showVisualComparisonDialog, setShowVisualComparisonDialog] = useState(false);
  const [visualComparisonData, setVisualComparisonData] = useState<{
    baseline?: string;
    current?: string;
    diff?: string;
    mismatchPercentage?: string;
    threshold?: string;
    stepId: string;
    stepName: string;
  } | null>(null);

  // Recording states
  const [showRecordDialog, setShowRecordDialog] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingTestName, setRecordingTestName] = useState("");
  const [recordingTestDescription, setRecordingTestDescription] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<TestStep[]>([]);
  const [recordingWindow, setRecordingWindow] = useState<Window | null>(null);

  // Import steps states
  const [showImportStepsDialog, setShowImportStepsDialog] = useState(false);
  const [importFromTestId, setImportFromTestId] = useState<string>("");
  const [importStepsTarget, setImportStepsTarget] = useState<"create" | "edit">("create");
  const [selectedImportStepIds, setSelectedImportStepIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    loadTests();
    loadTestCases();
    loadSuites();
    loadFolders();
  }, [projectId]);

  // Subscribe to real-time execution updates
  useEffect(() => {
    if (!liveExecution) return;
    const channel = supabase.channel("test-execution-updates").on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "nocode_test_executions",
      filter: `id=eq.${liveExecution.id}`
    }, async payload => {
      console.log("Real-time execution update:", payload);
      setLiveExecution(payload.new as TestExecution);

      // If execution is completed, close the dialog after a delay
      if (payload.new.status === "passed" || payload.new.status === "failed" || payload.new.status === "cancelled") {
        setIsCancelling(false);

        // Auto-update test status based on execution result
        if (payload.new.status === "passed" || payload.new.status === "failed") {
          const testId = payload.new.test_id;
          try {
            // Get the nocode test to find linked test_case_id
            const {
              data: nocodeTest
            } = await supabase.from("nocode_tests").select("test_case_id").eq("id", testId).single();

            // Update nocode_test status
            await supabase.from("nocode_tests").update({
              status: payload.new.status
            }).eq("id", testId);

            // Update local state for nocode tests
            setTests(prev => prev.map(t => t.id === testId ? {
              ...t,
              status: payload.new.status
            } : t));
            if (selectedTest?.id === testId) {
              setSelectedTest(prev => prev ? {
                ...prev,
                status: payload.new.status
              } : null);
            }

            // Also update linked test case in Test Cases module if exists
            if (nocodeTest?.test_case_id) {
              await supabase.from("test_cases").update({
                status: payload.new.status
              }).eq("id", nocodeTest.test_case_id);
              console.log(`Linked test case ${nocodeTest.test_case_id} status updated to ${payload.new.status}`);
            }
          } catch (error) {
            console.error("Error auto-updating test status:", error);
          }
        }
        setTimeout(() => {
          setShowLiveProgressDialog(false);
          setLiveExecution(null);
          if (selectedTest) {
            loadExecutions(selectedTest.id);
          }
        }, 2000);
      }
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveExecution?.id, selectedTest?.id]);
  const loadTests = async () => {
    try {
      setIsLoading(true);
      const {
        data,
        error
      } = await supabase.from("nocode_tests").select("*").eq("project_id", projectId).order("created_at", {
        ascending: false
      });
      if (error) throw error;
      setTests(data || []);
    } catch (error) {
      console.error("Error loading tests:", error);
      toast({
        title: "Error",
        description: "Failed to load tests",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  const loadTestCases = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("test_cases").select(`
          id,
          title,
          description,
          structured_steps,
          steps,
          expected_result,
          user_stories(title)
        `).eq("project_id", projectId).order("created_at", {
        ascending: false
      });
      if (error) throw error;
      setAvailableTestCases(data || []);
    } catch (error) {
      console.error("Error loading test cases:", error);
    }
  };

  // Folder functions
  const loadFolders = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("nocode_test_folders").select("*").eq("project_id", projectId).order("name", {
        ascending: true
      });
      if (error) throw error;
      setFolders(data || []);
    } catch (error) {
      console.error("Error loading folders:", error);
    }
  };
  // Helper function to get or create "Ungrouped Tests" folder
  const getOrCreateUngroupedFolder = async (userId: string): Promise<string> => {
    const UNGROUPED_FOLDER_NAME = "Ungrouped Tests";

    // Check if folder already exists
    const existingFolder = folders.find(f => f.name === UNGROUPED_FOLDER_NAME);
    if (existingFolder) {
      return existingFolder.id;
    }

    // Create the folder if it doesn't exist
    const { data, error } = await supabase
      .from("nocode_test_folders")
      .insert([{
        project_id: projectId,
        name: UNGROUPED_FOLDER_NAME,
        user_id: userId
      }])
      .select()
      .single();

    if (error) throw error;

    // Reload folders to include the new one
    await loadFolders();

    return data.id;
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a folder name",
        variant: "destructive"
      });
      return;
    }
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const {
        data,
        error
      } = await supabase.from("nocode_test_folders").insert([{
        project_id: projectId,
        name: newFolderName.trim(),
        user_id: user.id
      }]).select().single();
      if (error) throw error;
      toast({
        title: "Success",
        description: "Folder created successfully"
      });
      setShowCreateFolderDialog(false);
      setNewFolderName("");
      loadFolders();
      // Auto-expand new folder
      setExpandedFolders(prev => new Set([...prev, data.id]));
    } catch (error) {
      console.error("Error creating folder:", error);
      toast({
        title: "Error",
        description: "Failed to create folder",
        variant: "destructive"
      });
    }
  };
  const handleRenameFolder = async (folderId: string, newName: string) => {
    if (!newName.trim()) {
      setEditingFolderId(null);
      return;
    }
    try {
      const {
        error
      } = await supabase.from("nocode_test_folders").update({
        name: newName.trim()
      }).eq("id", folderId);
      if (error) throw error;
      setFolders(prev => prev.map(f => f.id === folderId ? {
        ...f,
        name: newName.trim()
      } : f));
      toast({
        title: "Success",
        description: "Folder renamed successfully"
      });
    } catch (error) {
      console.error("Error renaming folder:", error);
      toast({
        title: "Error",
        description: "Failed to rename folder",
        variant: "destructive"
      });
    } finally {
      setEditingFolderId(null);
    }
  };
  const handleDeleteFolder = async (folderId: string) => {
    try {
      // First, move all tests in this folder to no folder
      await supabase.from("nocode_tests").update({
        folder_id: null
      }).eq("folder_id", folderId);
      const {
        error
      } = await supabase.from("nocode_test_folders").delete().eq("id", folderId);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Folder deleted. Tests have been moved to the root level."
      });
      loadFolders();
      loadTests();
    } catch (error) {
      console.error("Error deleting folder:", error);
      toast({
        title: "Error",
        description: "Failed to delete folder",
        variant: "destructive"
      });
    }
  };
  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Bulk selection functions
  const handleBulkSelectTest = (testId: string, checked: boolean) => {
    setBulkSelectedTests(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(testId);
      } else {
        next.delete(testId);
      }
      return next;
    });
  };
  const handleSelectAllTests = () => {
    if (bulkSelectedTests.size === tests.length) {
      setBulkSelectedTests(new Set());
    } else {
      setBulkSelectedTests(new Set(tests.map(t => t.id)));
    }
  };
  const handleBulkMoveTests = async () => {
    if (bulkSelectedTests.size === 0) return;
    try {
      const {
        error
      } = await supabase.from("nocode_tests").update({
        folder_id: bulkMoveTargetFolderId
      }).in("id", Array.from(bulkSelectedTests));
      if (error) throw error;

      // Update local state
      setTests(prev => prev.map(t => bulkSelectedTests.has(t.id) ? {
        ...t,
        folder_id: bulkMoveTargetFolderId
      } : t));
      toast({
        title: "Success",
        description: `Moved ${bulkSelectedTests.size} test(s) successfully`
      });
      setBulkSelectedTests(new Set());
      setShowBulkMoveDialog(false);
      setBulkMoveTargetFolderId(null);
    } catch (error) {
      console.error("Error moving tests:", error);
      toast({
        title: "Error",
        description: "Failed to move tests",
        variant: "destructive"
      });
    }
  };
  const clearBulkSelection = () => {
    setBulkSelectedTests(new Set());
  };

  // Drag and drop state
  const [activeId, setActiveId] = useState<string | null>(null);
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };
  const handleDragEnd = async (event: DragEndEvent) => {
    const {
      active,
      over
    } = event;
    setActiveId(null);
    if (!over) return;
    const testId = active.id as string;
    const overId = over.id as string;

    // Determine target folder (null for root, or folder id)
    let targetFolderId: string | null = null;
    if (overId.startsWith("folder-")) {
      targetFolderId = overId.replace("folder-", "");
    } else if (overId === "root-drop") {
      targetFolderId = null;
    } else {
      return; // Invalid drop target
    }

    // Find the test being moved
    const test = tests.find(t => t.id === testId);
    if (!test || test.folder_id === targetFolderId) return;
    try {
      const {
        error
      } = await supabase.from("nocode_tests").update({
        folder_id: targetFolderId
      }).eq("id", testId);
      if (error) throw error;

      // Update local state
      setTests(prev => prev.map(t => t.id === testId ? {
        ...t,
        folder_id: targetFolderId
      } : t));
      toast({
        title: "Test Moved",
        description: targetFolderId ? `Test moved to folder` : "Test moved to root level"
      });
    } catch (error) {
      console.error("Error moving test:", error);
      toast({
        title: "Error",
        description: "Failed to move test",
        variant: "destructive"
      });
    }
  };

  // Suite functions
  const loadSuites = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("nocode_test_suites").select("*").eq("project_id", projectId).order("created_at", {
        ascending: false
      });
      if (error) throw error;

      // Get test counts and execution statistics for each suite
      const suitesWithStats = await Promise.all((data || []).map(async suite => {
        // Get test count
        const {
          count: testCount
        } = await supabase.from("nocode_suite_tests").select("*", {
          count: "exact",
          head: true
        }).eq("suite_id", suite.id);

        // Get execution statistics
        const {
          data: executions
        } = await supabase.from("nocode_suite_executions").select("status, started_at, passed_tests, failed_tests").eq("suite_id", suite.id).order("started_at", {
          ascending: false
        });
        const totalRuns = executions?.length || 0;
        const lastExecution = executions?.[0];

        // Calculate aggregate pass rate across all executions
        let totalPassed = 0;
        let totalFailed = 0;
        executions?.forEach(exec => {
          totalPassed += exec.passed_tests || 0;
          totalFailed += exec.failed_tests || 0;
        });
        const totalTests = totalPassed + totalFailed;
        const passRate = totalTests > 0 ? Math.round(totalPassed / totalTests * 100) : 0;
        return {
          ...suite,
          test_count: testCount || 0,
          total_runs: totalRuns,
          last_run: lastExecution?.started_at,
          last_status: lastExecution?.status,
          pass_rate: passRate,
          total_passed: totalPassed,
          total_failed: totalFailed
        };
      }));
      setSuites(suitesWithStats);
    } catch (error) {
      console.error("Error loading suites:", error);
    }
  };
  const loadSuiteTests = async (suiteId: string) => {
    try {
      const {
        data,
        error
      } = await supabase.from("nocode_suite_tests").select("*, test:nocode_tests(*)").eq("suite_id", suiteId).order("execution_order", {
        ascending: true
      });
      if (error) throw error;
      setSuiteTests((data || []).map(item => ({
        ...item,
        test: item.test as unknown as NoCodeTest
      })));
    } catch (error) {
      console.error("Error loading suite tests:", error);
    }
  };
  const loadSuiteExecutions = async (suiteId: string) => {
    try {
      const {
        data,
        error
      } = await supabase.from("nocode_suite_executions").select("*").eq("suite_id", suiteId).order("started_at", {
        ascending: false
      }).limit(10);
      if (error) throw error;
      setSuiteExecutions(data || []);
    } catch (error) {
      console.error("Error loading suite executions:", error);
    }
  };

  // Export suite execution history as CSV
  const exportSuiteHistoryAsCSV = () => {
    if (!selectedSuite || suiteExecutions.length === 0) {
      toast({
        title: "No Data",
        description: "No execution history to export",
        variant: "destructive"
      });
      return;
    }
    const headers = ["Execution Date", "Status", "Total Tests", "Passed", "Failed", "Pass Rate", "Duration"];
    const rows = suiteExecutions.map(exec => {
      const passRate = exec.total_tests > 0 ? Math.round(exec.passed_tests / exec.total_tests * 100) : 0;
      const duration = exec.completed_at ? Math.round((new Date(exec.completed_at).getTime() - new Date(exec.started_at).getTime()) / 1000) : "N/A";
      return [new Date(exec.started_at).toLocaleString(), exec.status, exec.total_tests, exec.passed_tests, exec.failed_tests, `${passRate}%`, typeof duration === "number" ? `${duration}s` : duration];
    });
    const csvContent = [`Suite: ${selectedSuite.name}`, `Exported: ${new Date().toLocaleString()}`, "", headers.join(","), ...rows.map(row => row.join(","))].join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedSuite.name.replace(/[^a-zA-Z0-9]/g, "-")}-execution-history.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({
      title: "Export Complete",
      description: "Suite execution history exported as CSV"
    });
  };

  // Export suite execution history as PDF (HTML-based)
  const exportSuiteHistoryAsPDF = () => {
    if (!selectedSuite || suiteExecutions.length === 0) {
      toast({
        title: "No Data",
        description: "No execution history to export",
        variant: "destructive"
      });
      return;
    }
    const passRate = selectedSuite.pass_rate ?? 0;
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>${selectedSuite.name} - Execution Report</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; }
    .summary { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
    .stat-card { background: #f3f4f6; padding: 15px 25px; border-radius: 8px; text-align: center; min-width: 120px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #1a1a1a; }
    .stat-label { font-size: 12px; color: #6b7280; margin-top: 5px; }
    .pass-rate { color: ${passRate >= 80 ? "#22c55e" : passRate >= 50 ? "#eab308" : "#ef4444"}; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; color: #374151; }
    .status-passed { color: #22c55e; font-weight: 600; }
    .status-failed { color: #ef4444; font-weight: 600; }
    .status-running { color: #3b82f6; font-weight: 600; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <h1>Test Suite Execution Report</h1>
  <p><strong>Suite:</strong> ${selectedSuite.name}</p>
  ${selectedSuite.description ? `<p><strong>Description:</strong> ${selectedSuite.description}</p>` : ""}
  <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>

  <h2>Summary</h2>
  <div class="summary">
    <div class="stat-card">
      <div class="stat-value pass-rate">${passRate}%</div>
      <div class="stat-label">Pass Rate</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${selectedSuite.total_runs ?? 0}</div>
      <div class="stat-label">Total Runs</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: #22c55e;">${selectedSuite.total_passed ?? 0}</div>
      <div class="stat-label">Tests Passed</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: #ef4444;">${selectedSuite.total_failed ?? 0}</div>
      <div class="stat-label">Tests Failed</div>
    </div>
  </div>

  <h2>Execution History</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Status</th>
        <th>Total</th>
        <th>Passed</th>
        <th>Failed</th>
        <th>Pass Rate</th>
      </tr>
    </thead>
    <tbody>
      ${suiteExecutions.map(exec => {
      const execPassRate = exec.total_tests > 0 ? Math.round(exec.passed_tests / exec.total_tests * 100) : 0;
      return `
          <tr>
            <td>${new Date(exec.started_at).toLocaleString()}</td>
            <td class="status-${exec.status}">${exec.status}</td>
            <td>${exec.total_tests}</td>
            <td style="color: #22c55e;">${exec.passed_tests}</td>
            <td style="color: ${exec.failed_tests > 0 ? "#ef4444" : "#6b7280"};">${exec.failed_tests}</td>
            <td>${execPassRate}%</td>
          </tr>
        `;
    }).join("")}
    </tbody>
  </table>

  <div class="footer">
    <p>Generated by No-Code Automation Module</p>
  </div>
</body>
</html>`;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
    toast({
      title: "Report Generated",
      description: "PDF report opened in print dialog"
    });
  };

  // Helper to escape strings for JavaScript - handles quotes properly
  const escapeForJS = (str: string): string => {
    if (!str) return "";
    // If string contains single quotes, use double quotes and escape double quotes
    if (str.includes("'")) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    // Otherwise use single quotes
    return `'${str}'`;
  };
  const generatePlaywrightStep = (step: TestStep): string => {
    const selector = step.selector || "";
    const value = step.value || "";
    const extraData = step.extraData || {};
    switch (step.type) {
      // Navigation
      case "navigate":
        return `  await page.goto(${escapeForJS(value)});`;
      case "reload":
        return `  await page.reload();`;
      case "goBack":
        return `  await page.goBack();`;
      case "goForward":
        return `  await page.goForward();`;

      // Interaction - Click
      case "click":
        return `  await page.locator(${escapeForJS(selector)}).click();`;
      case "doubleClick":
        return `  await page.locator(${escapeForJS(selector)}).dblclick();`;
      case "rightClick":
        return `  await page.locator(${escapeForJS(selector)}).click({ button: 'right' });`;
      case "hover":
        return `  await page.locator(${escapeForJS(selector)}).hover();`;
      case "focus":
        return `  await page.locator(${escapeForJS(selector)}).focus();`;

      // Input
      case "type":
      case "fill":
        return `  await page.locator(${escapeForJS(selector)}).fill(${escapeForJS(value)});`;
      case "clear":
        return `  await page.locator(${escapeForJS(selector)}).fill('');`;
      case "pressKey":
      case "keyPress":
        return `  await page.keyboard.press(${escapeForJS(value)});`;
      case "selectOption":
        return `  await page.locator(${escapeForJS(selector)}).selectOption(${escapeForJS(value)});`;
      case "check":
        return `  await page.locator(${escapeForJS(selector)}).check();`;
      case "uncheck":
        return `  await page.locator(${escapeForJS(selector)}).uncheck();`;

      // Assertions
      case "verify":
        if (value) {
          return `  await expect(page.locator(${escapeForJS(selector)})).toContainText(${escapeForJS(value)});`;
        }
        return `  await expect(page.locator(${escapeForJS(selector)})).toBeVisible();`;
      case "verifyVisible":
        return `  await expect(page.locator(${escapeForJS(selector)})).toBeVisible();`;
      case "verifyHidden":
        return `  await expect(page.locator(${escapeForJS(selector)})).toBeHidden();`;
      case "verifyEnabled":
        return `  await expect(page.locator(${escapeForJS(selector)})).toBeEnabled();`;
      case "verifyDisabled":
        return `  await expect(page.locator(${escapeForJS(selector)})).toBeDisabled();`;
      case "verifyText":
        return `  await expect(page.locator(${escapeForJS(selector)})).toContainText(${escapeForJS(value)});`;
      case "verifyValue":
        return `  await expect(page.locator(${escapeForJS(selector)})).toHaveValue(${escapeForJS(value)});`;
      case "verifyUrl":
        return `  await expect(page).toHaveURL(${escapeForJS(value)});`;
      case "verifyTitle":
        return `  await expect(page).toHaveTitle(${escapeForJS(value)});`;
      case "verifyAttribute":
        return `  await expect(page.locator(${escapeForJS(selector)})).toHaveAttribute(${escapeForJS(extraData.attribute || '')}, ${escapeForJS(value)});`;

      // Wait
      case "wait":
        return `  await page.waitForTimeout(${value || 1000});`;
      case "waitForSelector":
        return `  await page.locator(${escapeForJS(selector)}).waitFor();`;
      case "waitForUrl":
        return `  await page.waitForURL(${escapeForJS(value)});`;
      case "waitForVisible":
        return `  await page.locator(${escapeForJS(selector)}).waitFor({ state: 'visible' });`;
      case "waitForHidden":
        return `  await page.locator(${escapeForJS(selector)}).waitFor({ state: 'hidden' });`;
      case "waitForNetworkIdle":
        return `  await page.waitForLoadState('networkidle');`;

      // Screenshot
      case "screenshot":
        return `  await page.screenshot({ path: ${escapeForJS(value || 'screenshot.png')}, fullPage: true });`;
      default:
        return `  // Unknown step type: ${step.type}`;
    }
  };
  const generatePlaywrightTest = (test: NoCodeTest): string => {
    const steps = Array.isArray(test.steps) ? test.steps : [];
    const sanitizedName = test.name.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    let testCode = `import { test, expect } from '@playwright/test';

/**
 * Test: ${test.name}
 * Description: ${test.description || "No description"}
 * Base URL: ${test.base_url}
 */

test.describe('${sanitizedName}', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('${test.base_url}');
  });

  test('${sanitizedName}', async ({ page }) => {
`;
    steps.forEach((step: TestStep, index: number) => {
      testCode += `    // Step ${index + 1}: ${step.description}\n`;
      testCode += `  ${generatePlaywrightStep(step)}\n\n`;
    });
    testCode += `  });
});
`;
    return testCode;
  };
  const handleExportProject = async () => {
    try {
      // Gather all tests
      const {
        data: testsData,
        error: testsError
      } = await supabase.from("nocode_tests").select("*").eq("project_id", projectId);
      if (testsError) throw testsError;
      if (!testsData || testsData.length === 0) {
        toast({
          title: "No Tests",
          description: "No tests found to export",
          variant: "destructive"
        });
        return;
      }

      // Generate package.json
      const packageJson = {
        name: "playwright-tests-export",
        version: "1.0.0",
        description: "Exported Playwright tests from No-Code Automation",
        scripts: {
          test: "npx playwright test",
          "test:headed": "npx playwright test --headed",
          "test:debug": "npx playwright test --debug",
          report: "npx playwright show-report"
        },
        devDependencies: {
          "@playwright/test": "^1.40.0"
        }
      };

      // Generate playwright.config.ts
      const playwrightConfig = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
`;

      // Generate README
      const readme = `# Playwright Tests Export

This project contains automated tests exported from No-Code Automation.

## Setup

1. Install dependencies:
\`\`\`bash
npm install
\`\`\`

2. Install Playwright browsers:
\`\`\`bash
npx playwright install
\`\`\`

## Running Tests

Run all tests:
\`\`\`bash
npm test
\`\`\`

Run tests with browser visible:
\`\`\`bash
npm run test:headed
\`\`\`

Debug tests:
\`\`\`bash
npm run test:debug
\`\`\`

View test report:
\`\`\`bash
npm run report
\`\`\`

## Test Files

${testsData.map(t => `- \`tests/${t.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.spec.ts\` - ${t.description || t.name}`).join("\n")}

## Exported on ${new Date().toLocaleDateString()}
`;

      // Create ZIP file
      const zip = new JSZip();

      // Add root files
      zip.file("package.json", JSON.stringify(packageJson, null, 2));
      zip.file("playwright.config.ts", playwrightConfig);
      zip.file("README.md", readme);
      zip.file(".gitignore", `node_modules/
test-results/
playwright-report/
blob-report/
playwright/.cache/
`);
      zip.file("tsconfig.json", JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          useDefineForClassFields: true,
          module: "ESNext",
          lib: ["ES2020", "DOM", "DOM.Iterable"],
          skipLibCheck: true,
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true
        },
        include: ["tests"]
      }, null, 2));

      // Create tests folder and add test files
      const testsFolder = zip.folder("tests");
      testsData.forEach(test => {
        const fileName = `${test.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.spec.ts`;
        testsFolder?.file(fileName, generatePlaywrightTest(test));
      });

      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({
        type: "blob"
      });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `playwright-tests-${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({
        title: "Export Successful",
        description: `Exported ${testsData.length} test(s) as Playwright scripts`
      });
    } catch (error) {
      console.error("Error exporting project:", error);
      toast({
        title: "Export Failed",
        description: "Failed to export automation project",
        variant: "destructive"
      });
    }
  };
  const handleCreateSuite = async () => {
    if (!suiteName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a suite name",
        variant: "destructive"
      });
      return;
    }
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const {
        data,
        error
      } = await supabase.from("nocode_test_suites").insert({
        project_id: projectId,
        name: suiteName,
        description: suiteDescription || null,
        user_id: user.id
      }).select().single();
      if (error) throw error;
      toast({
        title: "Success",
        description: "Test suite created successfully"
      });
      setShowCreateSuiteDialog(false);
      setSuiteName("");
      setSuiteDescription("");
      loadSuites();

      // Select the newly created suite
      if (data) {
        setSelectedSuite({
          ...data,
          test_count: 0
        });
      }
    } catch (error) {
      console.error("Error creating suite:", error);
      toast({
        title: "Error",
        description: "Failed to create test suite",
        variant: "destructive"
      });
    }
  };
  const handleDeleteSuite = async (suiteId: string) => {
    try {
      const {
        error
      } = await supabase.from("nocode_test_suites").delete().eq("id", suiteId);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Test suite deleted successfully"
      });
      if (selectedSuite?.id === suiteId) {
        setSelectedSuite(null);
        setSuiteTests([]);
      }
      loadSuites();
    } catch (error) {
      console.error("Error deleting suite:", error);
      toast({
        title: "Error",
        description: "Failed to delete test suite",
        variant: "destructive"
      });
    }
  };
  const handleAddTestsToSuite = async () => {
    if (!selectedSuite || selectedTestsForSuite.size === 0) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const testsToAdd = Array.from(selectedTestsForSuite).map((testId, index) => ({
        suite_id: selectedSuite.id,
        test_id: testId,
        execution_order: suiteTests.length + index,
        user_id: user.id
      }));
      const {
        error
      } = await supabase.from("nocode_suite_tests").insert(testsToAdd);
      if (error) throw error;
      toast({
        title: "Success",
        description: `${selectedTestsForSuite.size} test(s) added to suite`
      });
      setShowAddTestsToSuiteDialog(false);
      setSelectedTestsForSuite(new Set());
      loadSuiteTests(selectedSuite.id);
      loadSuites();
    } catch (error) {
      console.error("Error adding tests to suite:", error);
      toast({
        title: "Error",
        description: "Failed to add tests to suite",
        variant: "destructive"
      });
    }
  };
  const handleRemoveTestFromSuite = async (suiteTestId: string) => {
    if (!selectedSuite) return;
    try {
      const {
        error
      } = await supabase.from("nocode_suite_tests").delete().eq("id", suiteTestId);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Test removed from suite"
      });
      loadSuiteTests(selectedSuite.id);
      loadSuites();
    } catch (error) {
      console.error("Error removing test from suite:", error);
      toast({
        title: "Error",
        description: "Failed to remove test from suite",
        variant: "destructive"
      });
    }
  };

  // Reorder tests in suite
  const handleReorderSuiteTests = async (activeId: string, overId: string) => {
    if (!selectedSuite || activeId === overId) return;
    const oldIndex = suiteTests.findIndex(t => t.id === activeId);
    const newIndex = suiteTests.findIndex(t => t.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistically update local state
    const newOrder = arrayMove(suiteTests, oldIndex, newIndex);
    setSuiteTests(newOrder);
    try {
      // Update execution_order for all affected tests
      const updates = newOrder.map((test, index) => ({
        id: test.id,
        execution_order: index
      }));

      // Update each test's execution_order
      for (const update of updates) {
        const {
          error
        } = await supabase.from("nocode_suite_tests").update({
          execution_order: update.execution_order
        }).eq("id", update.id);
        if (error) throw error;
      }
      toast({
        title: "Order Updated",
        description: "Test execution order has been updated"
      });
    } catch (error) {
      console.error("Error reordering tests:", error);
      // Revert on error
      loadSuiteTests(selectedSuite.id);
      toast({
        title: "Error",
        description: "Failed to update test order",
        variant: "destructive"
      });
    }
  };

  // DnD sensors for suite test reordering
  const suiteReorderSensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8
    }
  }));

  // DnD sensors for create step reordering
  const createStepSensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8
    }
  }));

  // Handler for reordering steps in Create dialog
  const handleCreateStepDragEnd = (event: DragEndEvent) => {
    const {
      active,
      over
    } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = currentSteps.findIndex(s => s.id === active.id);
    const newIndex = currentSteps.findIndex(s => s.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      setCurrentSteps(arrayMove(currentSteps, oldIndex, newIndex));
    }
  };
  const fetchTestStepResults = async (executionId: string) => {
    if (testStepResults[executionId]) return; // Already loaded

    try {
      const {
        data,
        error
      } = await supabase.from("nocode_test_executions").select("results").eq("id", executionId).single();
      if (error) throw error;
      const results = Array.isArray(data?.results) ? data.results : [];
      setTestStepResults(prev => ({
        ...prev,
        [executionId]: results
      }));
    } catch (error) {
      console.error("Error fetching test step results:", error);
    }
  };
  const toggleTestExpansion = async (testResult: any) => {
    const key = testResult.execution_id || testResult.test_id;
    setExpandedTestResults(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
        // Fetch step results if we have execution_id
        if (testResult.execution_id) {
          fetchTestStepResults(testResult.execution_id);
        }
      }
      return newSet;
    });
  };
  const updateTestStatus = async (testId: string, newStatus: string) => {
    try {
      const {
        error
      } = await supabase.from("nocode_tests").update({
        status: newStatus
      }).eq("id", testId);
      if (error) throw error;

      // Update local state
      setTests(prev => prev.map(t => t.id === testId ? {
        ...t,
        status: newStatus
      } : t));
      if (selectedTest?.id === testId) {
        setSelectedTest(prev => prev ? {
          ...prev,
          status: newStatus
        } : null);
      }
      toast({
        title: "Status Updated",
        description: `Test status changed to ${newStatus}`
      });
    } catch (error) {
      console.error("Error updating test status:", error);
      toast({
        title: "Error",
        description: "Failed to update test status",
        variant: "destructive"
      });
    }
  };
  const handleRunSuite = async () => {
    if (!selectedSuite || suiteTests.length === 0) {
      toast({
        title: "Error",
        description: "No tests in suite to run",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if we should use agent or browserbase
      if (suiteExecutionTarget === "agent") {
        if (!selectedSuiteAgentId) {
          toast({
            title: "Agent Required",
            description: "Please select an agent to run the suite",
            variant: "destructive"
          });
          return;
        }

        const agent = availableAgents.find(a => a.id === selectedSuiteAgentId);
        if (agent && !isAgentOnline(agent)) {
          setShowOfflineAgentConfirm(true);
          setPendingSuiteRun(true);
          return;
        }

        setIsRunningSuite(true);
        const runId = `suite_run_${Date.now()}`;

        // Create a suite execution record
        const { data: suiteExec, error: suiteExecError } = await supabase.from("nocode_suite_executions").insert({
          suite_id: selectedSuite.id,
          status: "pending",
          user_id: user.id,
          total_tests: suiteTests.length,
          passed_tests: 0,
          failed_tests: 0
        }).select().single();

        if (suiteExecError) throw suiteExecError;

        // Queue all tests in the suite
        for (const suiteTest of suiteTests) {
          if (!suiteTest.test) continue;

          await supabase.from("agent_job_queue").insert({
            project_id: projectId,
            test_id: suiteTest.test.id,
            run_id: runId,
            agent_id: selectedSuiteAgentId,
            status: "pending",
            priority: 5,
            config: {
              suite_execution_id: suiteExec.id,
              baseUrl: suiteTest.test.base_url,
              steps: suiteTest.test.steps
            }
          });
        }

        toast({
          title: "Suite Scheduled",
          description: `${suiteTests.length} tests added to the agent's queue`
        });
        loadSuiteExecutions(selectedSuite.id);
        setIsRunningSuite(false);
        return;
      }

      setIsRunningSuite(true);

      // Create suite execution record for standard flow
      const {
        data: execution,
        error: execError
      } = await supabase.from("nocode_suite_executions").insert({
        suite_id: selectedSuite.id,
        status: "running",
        user_id: user.id,
        total_tests: suiteTests.length,
        passed_tests: 0,
        failed_tests: 0
      }).select().single();

      if (execError) throw execError;
      setCurrentSuiteExecution(execution);

      toast({
        title: "Suite Execution Started",
        description: `Running ${suiteTests.length} tests...`
      });

      // Execute tests sequentially
      let passed = 0;
      let failed = 0;
      const results: any[] = [];

      for (const suiteTest of suiteTests) {
        if (!suiteTest.test) continue;
        try {
          // Create individual test execution
          const {
            data: testExec,
            error: testExecError
          } = await supabase.from("nocode_test_executions").insert({
            test_id: suiteTest.test.id,
            status: "running",
            user_id: user.id
          }).select().single();
          if (testExecError) throw testExecError;

          // Execute the test
          await supabase.functions.invoke("execute-nocode-test", {
            body: {
              testId: suiteTest.test.id,
              projectId: projectId,
              executionId: testExec.id,
              baseUrl: suiteTest.test.base_url,
              steps: suiteTest.test.steps
            }
          });

          // Fetch the updated execution status
          const {
            data: updatedExec
          } = await supabase.from("nocode_test_executions").select("*").eq("id", testExec.id).single();

          if (updatedExec?.status === "passed") {
            passed++;
          } else {
            failed++;
          }

          results.push({
            test_id: suiteTest.test.id,
            test_name: suiteTest.test.name,
            status: updatedExec?.status || "failed",
            execution_id: testExec.id,
            error: updatedExec?.error_message
          });

          // Update suite execution progress
          await supabase.from("nocode_suite_executions").update({
            passed_tests: passed,
            failed_tests: failed,
            results: results
          }).eq("id", execution.id);
        } catch (testError) {
          console.error("Error executing test:", testError);
          failed++;
          results.push({
            test_id: suiteTest.test.id,
            test_name: suiteTest.test.name,
            status: "failed",
            error: "Failed to execute test"
          });
        }
      }

      // Update final suite execution status
      await supabase.from("nocode_suite_executions").update({
        status: failed === 0 ? "passed" : "failed",
        completed_at: new Date().toISOString(),
        passed_tests: passed,
        failed_tests: failed,
        results: results
      }).eq("id", execution.id);

      toast({
        title: "Suite Execution Complete",
        description: `${passed} passed, ${failed} failed`,
        variant: failed > 0 ? "destructive" : "default"
      });
      loadSuiteExecutions(selectedSuite.id);
    } catch (error) {
      console.error("Error running suite:", error);
      toast({
        title: "Error",
        description: "Failed to run test suite",
        variant: "destructive"
      });
    } finally {
      setIsRunningSuite(false);
      setCurrentSuiteExecution(null);
    }
  };

  // Element extraction helper functions
  const handleMockupFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 5) {
      toast({
        title: "File Limit",
        description: "You can upload up to 5 mockup images only",
        variant: "destructive"
      });
      return;
    }
    const invalidFiles = files.filter(file => !file.type.startsWith("image/"));
    if (invalidFiles.length > 0) {
      toast({
        title: "Invalid Files",
        description: "Please select only image files for mockups",
        variant: "destructive"
      });
      return;
    }
    setMockupFiles(files);
  };
  const removeMockupFile = (index: number) => {
    setMockupFiles(prev => prev.filter((_, i) => i !== index));
  };
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Create dialog mockup handlers
  const handleCreateMockupFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 5) {
      toast({
        title: "File Limit",
        description: "You can upload up to 5 mockup images only",
        variant: "destructive"
      });
      return;
    }
    const validFiles = files.filter(file => file.type.startsWith("image/"));
    if (validFiles.length !== files.length) {
      toast({
        title: "Invalid Files",
        description: "Please select only image files for mockups",
        variant: "destructive"
      });
      return;
    }
    setCreateMockupFiles(validFiles);
  };
  const removeCreateMockupFile = (index: number) => {
    setCreateMockupFiles(prev => prev.filter((_, i) => i !== index));
  };
  const resetCreateFormMockups = () => {
    setCreateMockupFiles([]);
    setCreateHtmlDom("");
    setIsGeneratingSteps(false);
    setGenerationProgress(0);
  };

  // Generate test steps from mockups/HTML using AI
  const handleGenerateStepsFromMockups = async () => {
    if (!createHtmlDom.trim() && createMockupFiles.length === 0) {
      toast({
        title: "Input Required",
        description: "Please provide at least a mockup image or HTML DOM structure",
        variant: "destructive"
      });
      return;
    }
    if (!baseUrl.trim()) {
      toast({
        title: "Base URL Required",
        description: "Please enter a base URL before generating steps",
        variant: "destructive"
      });
      return;
    }
    setIsGeneratingSteps(true);
    setGenerationProgress(0);
    try {
      setGenerationProgress(20);
      toast({
        title: "Analyzing",
        description: "Extracting elements and generating test steps..."
      });

      // Fetch Azure OpenAI config from integrations
      const {
        data: azureConfig,
        error: configError
      } = await supabase.from("integration_configs").select("config").eq("project_id", projectId).eq("integration_type", "openai").single();
      if (configError && configError.code !== "PGRST116") {
        console.error("Error fetching Azure config:", configError);
      }
      setGenerationProgress(40);
      const azureOpenAIConfig = azureConfig?.config;

      // Convert mockup files to base64
      const mockupImages: string[] = [];
      for (const file of createMockupFiles) {
        const base64 = await fileToBase64(file);
        mockupImages.push(base64);
      }
      setGenerationProgress(60);

      // Call the edge function to extract elements first
      const {
        data: extractData,
        error: extractError
      } = await supabase.functions.invoke("extract-page-elements", {
        body: {
          htmlDom: createHtmlDom,
          mockupImages: mockupImages.length > 0 ? mockupImages : undefined,
          azureConfig: azureOpenAIConfig,
          projectId: projectId
        }
      });
      if (extractError) {
        console.error("Error extracting elements:", extractError);
        toast({
          title: "Extraction Failed",
          description: "Failed to extract elements. Check your AI configuration.",
          variant: "destructive"
        });
        setIsGeneratingSteps(false);
        setGenerationProgress(0);
        return;
      }
      const elements = extractData?.elements || [];
      setGenerationProgress(80);
      if (elements.length === 0) {
        toast({
          title: "No Elements Found",
          description: "No interactive elements found in the provided input.",
          variant: "destructive"
        });
        setIsGeneratingSteps(false);
        setGenerationProgress(0);
        return;
      }

      // Generate test steps based on extracted elements
      const generatedSteps: TestStep[] = [];

      // Add initial navigation step
      generatedSteps.push({
        id: crypto.randomUUID(),
        type: "navigate",
        value: baseUrl,
        description: `Navigate to ${baseUrl}`
      });

      // Generate steps based on extracted elements
      for (const element of elements) {
        const tagName = element.tagName?.toLowerCase() || "";
        const name = element.name || "element";
        if (tagName === "input" || tagName === "textarea") {
          const inputType = element.xpath?.includes("password") ? "password" : "text";
          generatedSteps.push({
            id: crypto.randomUUID(),
            type: "type",
            selector: element.xpath,
            value: inputType === "password" ? "testPassword123" : `test${name}`,
            description: `Enter value in ${name}`
          });
        } else if (tagName === "button" || tagName === "a" || element.locatorStrategy?.includes("btn") || element.locatorStrategy?.includes("button")) {
          generatedSteps.push({
            id: crypto.randomUUID(),
            type: "click",
            selector: element.xpath,
            description: `Click ${name}`
          });
        } else if (tagName === "select") {
          generatedSteps.push({
            id: crypto.randomUUID(),
            type: "selectOption",
            selector: element.xpath,
            value: "option1",
            description: `Select option in ${name}`
          });
        } else if (tagName === "checkbox" || element.xpath?.includes("checkbox")) {
          generatedSteps.push({
            id: crypto.randomUUID(),
            type: "click",
            selector: element.xpath,
            description: `Check ${name}`
          });
        }
      }
      setGenerationProgress(100);
      setCurrentSteps(generatedSteps);
      toast({
        title: "Steps Generated",
        description: `Successfully generated ${generatedSteps.length} test steps from ${elements.length} elements`
      });
      setTimeout(() => {
        setIsGeneratingSteps(false);
        setGenerationProgress(0);
      }, 500);
    } catch (error) {
      console.error("Error generating steps:", error);
      toast({
        title: "Error",
        description: "An error occurred while generating test steps",
        variant: "destructive"
      });
      setIsGeneratingSteps(false);
      setGenerationProgress(0);
    }
  };

  // Visual baseline functions
  const handleSaveBaseline = async (stepId: string, stepName: string, screenshot: string) => {
    if (!selectedTest) return;
    setIsSavingBaseline(true);
    try {
      const {
        data: session
      } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) {
        toast({
          title: "Error",
          description: "You must be logged in to save baselines",
          variant: "destructive"
        });
        return;
      }
      const {
        error
      } = await supabase.from("nocode_visual_baselines").upsert({
        test_id: selectedTest.id,
        step_name: stepName,
        baseline_image: screenshot,
        user_id: userId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "test_id,step_name"
      });
      if (error) throw error;
      toast({
        title: "Baseline Saved",
        description: `Baseline for "${stepName}" has been saved successfully`
      });
    } catch (error) {
      console.error("Error saving baseline:", error);
      toast({
        title: "Error",
        description: "Failed to save baseline",
        variant: "destructive"
      });
    } finally {
      setIsSavingBaseline(false);
    }
  };
  const handleViewVisualComparison = (result: any) => {
    const extraData = result.step?.extraData || {};
    setVisualComparisonData({
      baseline: extraData.baselineScreenshot,
      current: extraData.currentScreenshot || result.screenshot,
      diff: extraData.diffImage,
      mismatchPercentage: extraData.mismatchPercentage,
      threshold: extraData.threshold,
      stepId: result.step?.id || result.stepId,
      stepName: result.step?.description || "Visual Comparison"
    });
    setShowVisualComparisonDialog(true);
  };
  const handleExtractElements = async () => {
    if (!htmlDom.trim() && mockupFiles.length === 0) {
      toast({
        title: "Input Required",
        description: "Please provide at least a mockup image or HTML DOM structure",
        variant: "destructive"
      });
      return;
    }
    setIsExtracting(true);
    setExtractionProgress(0);
    try {
      setExtractionProgress(20);
      toast({
        title: "Analyzing",
        description: "Extracting elements with AI..."
      });

      // Fetch Azure OpenAI config from integrations
      const {
        data: azureConfig,
        error: configError
      } = await supabase.from("integration_configs").select("config").eq("project_id", projectId).eq("integration_type", "openai").single();
      if (configError && configError.code !== "PGRST116") {
        console.error("Error fetching Azure config:", configError);
      }
      setExtractionProgress(40);
      const azureOpenAIConfig = azureConfig?.config;

      // Convert mockup files to base64
      const mockupImages: string[] = [];
      for (const file of mockupFiles) {
        const base64 = await fileToBase64(file);
        mockupImages.push(base64);
      }
      setExtractionProgress(60);

      // Call the edge function to extract elements
      const {
        data,
        error
      } = await supabase.functions.invoke("extract-page-elements", {
        body: {
          htmlDom,
          mockupImages: mockupImages.length > 0 ? mockupImages : undefined,
          azureConfig: azureOpenAIConfig,
          projectId: projectId
        }
      });
      setExtractionProgress(90);
      if (error) {
        console.error("Error extracting elements:", error);
        toast({
          title: "Extraction Failed",
          description: data?.message || "Failed to extract elements. Check your Azure OpenAI configuration.",
          variant: "destructive"
        });
        setIsExtracting(false);
        setExtractionProgress(0);
        return;
      }
      const elements = data.elements || [];
      if (elements.length === 0) {
        toast({
          title: "No Elements Found",
          description: "No interactive elements found. Please provide valid HTML or images with interactive elements.",
          variant: "destructive"
        });
        setIsExtracting(false);
        setExtractionProgress(0);
        return;
      }
      setExtractionProgress(100);
      setParsedElements(elements);
      setSelectedElements(new Set(elements.map((_: any, i: number) => i)));
      setShowElementExtractionDialog(true);
      toast({
        title: "Elements Extracted",
        description: `Successfully extracted ${elements.length} elements`
      });
      setTimeout(() => {
        setIsExtracting(false);
        setExtractionProgress(0);
      }, 500);
    } catch (error) {
      console.error("Error in element extraction:", error);
      toast({
        title: "Error",
        description: "An error occurred while extracting elements",
        variant: "destructive"
      });
      setIsExtracting(false);
      setExtractionProgress(0);
    }
  };
  const toggleElement = (index: number) => {
    setSelectedElements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };
  const toggleSelectAllElements = () => {
    if (selectedElements.size === parsedElements.length) {
      setSelectedElements(new Set());
    } else {
      setSelectedElements(new Set(parsedElements.map((_, i) => i)));
    }
  };
  const resetElementExtraction = () => {
    setMockupFiles([]);
    setHtmlDom("");
    setParsedElements([]);
    setSelectedElements(new Set());
    setShowElementExtractionDialog(false);
  };
  const convertNaturalLanguageToAutomation = async (testCase: DBTestCase, extractedElements?: {
    name: string;
    xpath: string;
    tagName: string;
    locatorStrategy: string;
  }[]): Promise<TestStep[]> => {
    // Parse structured steps if available
    let testSteps: any[] = [];
    if (testCase.structured_steps && Array.isArray(testCase.structured_steps)) {
      testSteps = testCase.structured_steps;
    } else if (testCase.steps) {
      // Parse legacy steps format
      try {
        const parsed = JSON.parse(testCase.steps);
        testSteps = Array.isArray(parsed) ? parsed : [testCase.steps];
      } catch {
        testSteps = [{
          step: testCase.steps
        }];
      }
    }
    try {
      // Call AI edge function for smart conversion
      const {
        data,
        error
      } = await supabase.functions.invoke("convert-test-steps-to-automation", {
        body: {
          testSteps: testSteps,
          baseUrl: testCase.title,
          // Using test case title as context
          projectId: projectId,
          // Pass project ID to fetch Azure OpenAI config
          extractedElements: extractedElements || undefined // Pass extracted elements for better selector accuracy
        }
      });
      if (error) {
        console.error("Error calling AI conversion:", error);
        toast({
          title: "AI Conversion Failed",
          description: "Using basic conversion instead.",
          variant: "destructive"
        });
        return basicStepConversion(testSteps);
      }
      if (data && data.automationSteps) {
        toast({
          title: "AI Conversion Complete",
          description: `Successfully converted ${data.automationSteps.length} steps`
        });
        return data.automationSteps;
      }
      return basicStepConversion(testSteps);
    } catch (error) {
      console.error("Error in AI conversion:", error);
      toast({
        title: "Conversion Error",
        description: "Using basic conversion as fallback.",
        variant: "destructive"
      });
      return basicStepConversion(testSteps);
    }
  };

  // Fallback basic conversion method
  const basicStepConversion = (testSteps: any[]): TestStep[] => {
    const steps: TestStep[] = [];
    testSteps.forEach((step, index) => {
      const action = typeof step === "string" ? step : step.action || step.step || "";
      const testData = typeof step === "object" ? step.testData || "" : "";
      const description = `${action} ${testData}`.trim();

      // Smart conversion based on keywords
      const lowerAction = action.toLowerCase();
      if (lowerAction.includes("navigate") || lowerAction.includes("open") || lowerAction.includes("go to")) {
        steps.push({
          id: crypto.randomUUID(),
          type: "navigate",
          value: testData || "https://example.com",
          description: description || `Navigate to ${testData || "URL"}`
        });
      } else if (lowerAction.includes("click") || lowerAction.includes("press") || lowerAction.includes("select")) {
        const selector = extractSelector(action, testData);
        steps.push({
          id: crypto.randomUUID(),
          type: "click",
          selector: selector,
          description: description || "Click element"
        });
      } else if (lowerAction.includes("enter") || lowerAction.includes("type") || lowerAction.includes("input") || lowerAction.includes("fill")) {
        const selector = extractSelector(action, testData);
        steps.push({
          id: crypto.randomUUID(),
          type: "type",
          selector: selector,
          value: testData,
          description: description || `Enter text: ${testData}`
        });
      } else if (lowerAction.includes("verify") || lowerAction.includes("check") || lowerAction.includes("assert") || lowerAction.includes("validate")) {
        const selector = extractSelector(action, testData);
        steps.push({
          id: crypto.randomUUID(),
          type: "verify",
          selector: selector,
          value: testData,
          description: description || "Verify element"
        });
      } else if (lowerAction.includes("wait")) {
        const duration = testData.match(/\d+/) ? testData.match(/\d+/)?.[0] : "1000";
        steps.push({
          id: crypto.randomUUID(),
          type: "wait",
          value: duration,
          description: description || `Wait ${duration}ms`
        });
      } else {
        steps.push({
          id: crypto.randomUUID(),
          type: "click",
          selector: extractSelector(action, testData),
          description: description || action
        });
      }
    });
    return steps;
  };
  const extractSelector = (action: string, testData: string): string => {
    // Try to extract CSS selector patterns from the text
    const text = `${action} ${testData}`.toLowerCase();

    // Look for common element identifiers
    if (text.includes("button")) {
      const buttonText = testData || action.split("button")[1]?.trim() || "";
      return `button:contains("${buttonText}")`;
    }
    if (text.includes("link")) {
      const linkText = testData || action.split("link")[1]?.trim() || "";
      return `a:contains("${linkText}")`;
    }
    if (text.includes("username") || text.includes("user name")) {
      return '#username, [name="username"], [placeholder*="username"]';
    }
    if (text.includes("password")) {
      return '#password, [name="password"], [type="password"]';
    }
    if (text.includes("email")) {
      return '#email, [name="email"], [type="email"]';
    }
    if (text.includes("submit") || text.includes("login") || text.includes("sign in")) {
      return 'button[type="submit"], input[type="submit"]';
    }

    // Extract quoted text as potential selector
    const quoted = text.match(/"([^"]+)"|'([^']+)'/);
    if (quoted) {
      return `[aria-label*="${quoted[1] || quoted[2]}"], [placeholder*="${quoted[1] || quoted[2]}"]`;
    }

    // Default generic selector
    return `[aria-label*="${testData}"]`;
  };
  const handleImportTestCase = async () => {
    if (!selectedTestCaseId) {
      toast({
        title: "Validation Error",
        description: "Please select a test case to import",
        variant: "destructive"
      });
      return;
    }
    const testCase = availableTestCases.find(tc => tc.id === selectedTestCaseId);
    if (!testCase) return;
    setIsLoading(true);
    setShowImportDialog(false);
    try {
      // Get selected elements if any were extracted
      const selectedExtractedElements = parsedElements.length > 0 ? parsedElements.filter((_, index) => selectedElements.has(index)) : undefined;

      // Convert steps using AI with extracted elements
      const convertedSteps = await convertNaturalLanguageToAutomation(testCase, selectedExtractedElements);

      // Create preview - parse originalSteps from structured_steps or legacy steps
      let originalSteps: string[] = [];

      // Handle structured_steps (could be array or JSON string)
      let parsedStructuredSteps: any[] = [];
      if (testCase.structured_steps) {
        if (Array.isArray(testCase.structured_steps)) {
          parsedStructuredSteps = testCase.structured_steps;
        } else if (typeof testCase.structured_steps === 'string') {
          try {
            const parsed = JSON.parse(testCase.structured_steps);
            parsedStructuredSteps = Array.isArray(parsed) ? parsed : [];
          } catch {
            parsedStructuredSteps = [];
          }
        }
      }
      if (parsedStructuredSteps.length > 0) {
        originalSteps = parsedStructuredSteps.map((s: any) => {
          if (typeof s === 'string') return s;
          // Handle different property names: action, step, or description
          const stepText = s.action || s.step || s.description || '';
          const testData = s.testData || s.test_data || '';
          const expectedResult = s.expectedResult || s.expected_result || '';
          let result = stepText;
          if (testData) result += ` [Test Data: ${testData}]`;
          if (expectedResult) result += ` [Expected: ${expectedResult}]`;
          return result.trim();
        }).filter((s: string) => s.length > 0);
      } else if (testCase.steps) {
        // Fallback to legacy steps field
        try {
          const parsed = JSON.parse(testCase.steps);
          originalSteps = Array.isArray(parsed) ? parsed : [testCase.steps];
        } catch {
          originalSteps = testCase.steps.split('\n').filter((s: string) => s.trim().length > 0);
        }
      }
      setConversionPreview({
        testCase,
        originalSteps,
        convertedSteps,
        willUpdate: true
      });
      setEditedSteps(convertedSteps);
      setShowConfirmDialog(true);
    } catch (error) {
      console.error("Error importing test case:", error);
      toast({
        title: "Import Error",
        description: "Failed to import and convert test case",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      resetElementExtraction();
    }
  };
  const handleConfirmImport = async () => {
    if (!conversionPreview) return;
    const {
      testCase
    } = conversionPreview;
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create the automation test with edited steps, linked to original test case
      const {
        data,
        error
      } = await supabase.from("nocode_tests").insert([{
        project_id: projectId,
        name: testCase.title,
        description: testCase.description || "",
        base_url: "https://example.com",
        steps: editedSteps as any,
        user_id: user.id,
        test_case_id: testCase.id,
        // Link to original test case
        folder_id: importToFolderId // Import to selected folder
      }]).select().single();
      if (error) throw error;
      toast({
        title: "Success",
        description: "Test case imported and converted successfully"
      });
      setShowConfirmDialog(false);
      setShowImportDialog(false);
      setConversionPreview(null);
      setEditedSteps([]);
      setSelectedTestCaseId("");
      setImportToFolderId(null);
      loadTests();
    } catch (error) {
      console.error("Error importing test case:", error);
      toast({
        title: "Error",
        description: "Failed to import test case",
        variant: "destructive"
      });
    }
  };
  const updateEditedStep = (index: number, field: keyof TestStep, value: any) => {
    setEditedSteps(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return updated;
    });
  };
  const loadExecutions = async (testId: string) => {
    try {
      const {
        data,
        error
      } = await supabase.from("nocode_test_executions").select("*").eq("test_id", testId).order("started_at", {
        ascending: false
      }).limit(10);
      if (error) throw error;
      setExecutions(data || []);
    } catch (error) {
      console.error("Error loading executions:", error);
    }
  };
  const handleCreateTest = async () => {
    if (!testName || !baseUrl) {
      toast({
        title: "Validation Error",
        description: "Please provide test name and base URL",
        variant: "destructive"
      });
      return;
    }
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // If no folder selected, use "Ungrouped Tests" folder
      let folderId: string | null = selectedFolderId;
      if (!folderId) {
        folderId = await getOrCreateUngroupedFolder(user.id);
      }

      const {
        data,
        error
      } = await supabase.from("nocode_tests").insert([{
        project_id: projectId,
        name: testName,
        description: testDescription,
        base_url: baseUrl,
        steps: currentSteps as any,
        user_id: user.id,
        folder_id: folderId
      }]).select().single();
      if (error) throw error;
      toast({
        title: "Success",
        description: "Test created successfully"
      });
      setShowCreateDialog(false);
      resetForm();
      loadTests();
    } catch (error) {
      console.error("Error creating test:", error);
      toast({
        title: "Error",
        description: "Failed to create test",
        variant: "destructive"
      });
    }
  };
  const handleAddStep = () => {
    if (!stepDescription) {
      toast({
        title: "Validation Error",
        description: "Please provide step description",
        variant: "destructive"
      });
      return;
    }
    const actionDef = getActionDefinition(stepType);
    if (actionDef?.requiresSelector && !stepSelector) {
      toast({
        title: "Validation Error",
        description: "This action requires an element selector",
        variant: "destructive"
      });
      return;
    }

    // Edit mode - update existing step
    if (editCreateStepIndex !== null) {
      const updatedSteps = [...currentSteps];
      updatedSteps[editCreateStepIndex] = {
        ...updatedSteps[editCreateStepIndex],
        type: stepType,
        selector: stepSelector || undefined,
        value: stepValue || undefined,
        description: stepDescription,
        extraData: Object.keys(stepExtraData).length > 0 ? stepExtraData : undefined,
        skip: stepSkip || undefined
      };
      setCurrentSteps(updatedSteps);
      setEditCreateStepIndex(null);
      resetStepForm();
      setShowStepDialog(false);
      return;
    }
    const newStep: TestStep = {
      id: crypto.randomUUID(),
      type: stepType,
      selector: stepSelector || undefined,
      value: stepValue || undefined,
      description: stepDescription,
      extraData: Object.keys(stepExtraData).length > 0 ? stepExtraData : undefined,
      skip: stepSkip || undefined
    };
    if (insertStepAtIndex !== null) {
      const newSteps = [...currentSteps];
      newSteps.splice(insertStepAtIndex + 1, 0, newStep);
      setCurrentSteps(newSteps);
      setInsertStepAtIndex(null);
    } else {
      setCurrentSteps([...currentSteps, newStep]);
    }
    resetStepForm();
    setShowStepDialog(false);
  };
  const handleEditCreateStep = (index: number) => {
    const step = currentSteps[index];
    setStepType(step.type);
    setStepSelector(step.selector || "");
    setStepValue(step.value || "");
    setStepDescription(step.description);
    setStepExtraData(step.extraData || {});
    setStepSkip(step.skip || false);

    // Find the category for this action type
    const actionDef = getActionDefinition(step.type);
    if (actionDef) {
      setSelectedActionCategory(actionDef.category);
    }
    setEditCreateStepIndex(index);
    setShowStepDialog(true);
  };
  const resetStepForm = () => {
    setStepSelector("");
    setStepValue("");
    setStepDescription("");
    setStepExtraData({});
    setStepType("click");
    setSelectedActionCategory("interaction");
    setEditCreateStepIndex(null);
    setStepSkip(false);
  };
  const handleRemoveStep = (stepId: string) => {
    setCurrentSteps(currentSteps.filter(step => step.id !== stepId));
  };
  const handleRunTest = async (test: NoCodeTest) => {
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if we should use agent or browserbase
      if (executionTarget === "agent") {
        if (!selectedAgentId) {
          toast({
            title: "Agent Required",
            description: "Please select an agent to run the test",
            variant: "destructive"
          });
          return;
        }

        const agent = availableAgents.find(a => a.id === selectedAgentId);
        if (agent && !isAgentOnline(agent)) {
          setShowOfflineAgentConfirm(true);
          setPendingTestRun(test);
          return;
        }

        // Insert job into queue
        const { error: jobError } = await supabase.from("agent_job_queue").insert({
          project_id: projectId,
          test_id: test.id,
          run_id: `run_${Date.now()}`,
          agent_id: selectedAgentId,
          status: "pending",
          priority: 10,
          config: {
            baseUrl: test.base_url,
            steps: test.steps
          }
        });

        if (jobError) throw jobError;

        toast({
          title: "Job Scheduled",
          description: "Test has been added to the agent's queue"
        });
        return;
      }

      // Default Browserbase execution flow
      // Create execution record
      const {
        data: execution,
        error: execError
      } = await supabase.from("nocode_test_executions").insert({
        test_id: test.id,
        status: "running",
        user_id: user.id
      }).select().single();
      if (execError) throw execError;

      // Set up live progress tracking
      setLiveExecution(execution);
      setShowLiveProgressDialog(true);
      toast({
        title: "Test Started",
        description: "Browser automation is running..."
      });

      // Call edge function to execute the test with Playwright (don't await - realtime handles updates)
      supabase.functions.invoke("execute-nocode-test", {
        body: {
          testId: test.id,
          projectId: projectId,
          executionId: execution.id,
          baseUrl: test.base_url,
          steps: test.steps
        }
      }).then(async ({
        data,
        error
      }) => {
        if (error) {
          console.error("Edge function error:", error);

          // Check if the database was updated by the edge function
          const {
            data: updatedExecution
          } = await supabase.from("nocode_test_executions").select("status, error_message").eq("id", execution.id).single();

          // Only show error and close if status wasn't updated to failed
          if (!updatedExecution || updatedExecution.status === "running") {
            // Update status ourselves if edge function crashed
            await supabase.from("nocode_test_executions").update({
              status: "failed",
              completed_at: new Date().toISOString(),
              error_message: error.message || "Edge function failed to respond"
            }).eq("id", execution.id);
          }
          toast({
            title: "Test Failed",
            description: updatedExecution?.error_message || error.message || "Failed to execute test",
            variant: "destructive"
          });
        }
      });
    } catch (error) {
      console.error("Error running test:", error);
      toast({
        title: "Error",
        description: "Failed to start test",
        variant: "destructive"
      });
    }
  };
  const handleDeleteTest = async (testId: string) => {
    try {
      const {
        error
      } = await supabase.from("nocode_tests").delete().eq("id", testId);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Test deleted successfully"
      });
      if (selectedTest?.id === testId) {
        setSelectedTest(null);
      }
      loadTests();
    } catch (error) {
      console.error("Error deleting test:", error);
      toast({
        title: "Error",
        description: "Failed to delete test",
        variant: "destructive"
      });
    }
  };
  const handleCloneTest = async (test: NoCodeTest) => {
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const {
        error
      } = await supabase.from("nocode_tests").insert({
        project_id: projectId,
        name: `${test.name} (Copy)`,
        description: test.description,
        base_url: test.base_url,
        steps: test.steps,
        user_id: user.id,
        status: "draft"
      });
      if (error) throw error;
      toast({
        title: "Success",
        description: "Test cloned successfully"
      });
      loadTests();
    } catch (error) {
      console.error("Error cloning test:", error);
      toast({
        title: "Error",
        description: "Failed to clone test",
        variant: "destructive"
      });
    }
  };
  const handleCancelTest = async () => {
    if (!liveExecution || liveExecution.status !== "running") return;
    try {
      setIsCancelling(true);

      // Update execution status to 'cancelling'
      const {
        error
      } = await supabase.from("nocode_test_executions").update({
        status: "cancelling"
      }).eq("id", liveExecution.id);
      if (error) throw error;
      toast({
        title: "Cancelling Test",
        description: "Stopping test execution after current step..."
      });
    } catch (error) {
      console.error("Error cancelling test:", error);
      setIsCancelling(false);
      toast({
        title: "Error",
        description: "Failed to cancel test",
        variant: "destructive"
      });
    }
  };

  // Recording functions - using browser extension approach for cross-origin support
  const [recordingSessionId] = useState(() => crypto.randomUUID());
  const [showExtensionInstructions, setShowExtensionInstructions] = useState(false);
  const [manualStepMode, setManualStepMode] = useState(false);
  const [manualStepType, setManualStepType] = useState<TestStep["type"]>("click");
  const [manualStepSelector, setManualStepSelector] = useState("");
  const [manualStepValue, setManualStepValue] = useState("");
  const [manualStepDescription, setManualStepDescription] = useState("");
  const [recordingPasteData, setRecordingPasteData] = useState("");
  const [isDownloadingExtension, setIsDownloadingExtension] = useState(false);

  // Download browser extension
  const handleDownloadExtension = async () => {
    setIsDownloadingExtension(true);
    try {
      const {
        downloadExtension
      } = await import('@/lib/browserExtensionGenerator');
      await downloadExtension({
        sessionId: recordingSessionId,
        appOrigin: window.location.origin
      });
      toast({
        title: "Extension Downloaded",
        description: "Extract the ZIP and load it in Chrome/Edge. See instructions below."
      });
    } catch (error) {
      console.error("Error downloading extension:", error);
      toast({
        title: "Error",
        description: "Failed to generate extension. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsDownloadingExtension(false);
    }
  };
  const handleImportRecordedSteps = () => {
    try {
      const dataToImport = recordingPasteData.trim();
      if (!dataToImport) {
        toast({
          title: "No Data",
          description: "Please paste the recorded data from the target page.",
          variant: "destructive"
        });
        return;
      }
      let actions: any[];
      try {
        actions = JSON.parse(dataToImport);
      } catch {
        toast({
          title: "Invalid Data",
          description: "The pasted data is not valid. Make sure you copied the complete recording data.",
          variant: "destructive"
        });
        return;
      }
      if (!Array.isArray(actions) || actions.length === 0) {
        toast({
          title: "Empty Recording",
          description: "No actions were found in the pasted data. Try recording again.",
          variant: "destructive"
        });
        return;
      }

      // Add navigation step at the beginning
      const steps: TestStep[] = [{
        id: crypto.randomUUID(),
        type: 'navigate',
        value: recordingUrl.trim(),
        description: 'Navigate to ' + recordingUrl.trim()
      }];

      // Convert recorded actions to test steps
      actions.forEach(action => {
        steps.push({
          id: crypto.randomUUID(),
          type: action.type,
          selector: action.selector,
          value: action.value,
          description: action.description
        });
      });
      setRecordedSteps(steps);
      setShowExtensionInstructions(false);
      setRecordingPasteData("");
      toast({
        title: "Steps Imported",
        description: `Imported ${actions.length} recorded actions. Review and save your test.`
      });
    } catch (error) {
      console.error("Error importing recorded steps:", error);
      toast({
        title: "Import Error",
        description: "Failed to import recorded steps. Please try again.",
        variant: "destructive"
      });
    }
  };
  const handleAddManualStep = () => {
    if (!manualStepDescription.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a step description",
        variant: "destructive"
      });
      return;
    }
    const newStep: TestStep = {
      id: crypto.randomUUID(),
      type: manualStepType,
      selector: manualStepSelector || undefined,
      value: manualStepValue || undefined,
      description: manualStepDescription
    };
    setRecordedSteps(prev => [...prev, newStep]);

    // Reset manual step form
    setManualStepSelector("");
    setManualStepValue("");
    setManualStepDescription("");
    toast({
      title: "Step Added",
      description: "Manual step added to recording"
    });
  };
  const handleStartRecording = () => {
    if (!recordingUrl.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a URL to record",
        variant: "destructive"
      });
      return;
    }

    // Validate URL
    let url = recordingUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
      setRecordingUrl(url);
    }
    try {
      new URL(url);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL",
        variant: "destructive"
      });
      return;
    }

    // Clear any previous recording
    localStorage.removeItem('lovable_recording_' + recordingSessionId);

    // Add initial navigation step
    setRecordedSteps([{
      id: crypto.randomUUID(),
      type: 'navigate',
      value: url,
      description: 'Navigate to ' + url
    }]);
    setShowExtensionInstructions(true);
    setIsRecording(true);

    // Open the target URL in a new tab
    window.open(url, '_blank');
    toast({
      title: "Tab Opened",
      description: "Follow the instructions to start recording"
    });
  };
  const handleStopRecording = () => {
    setIsRecording(false);
    setRecordingWindow(null);
    setShowExtensionInstructions(false);
    if (recordedSteps.length > 1) {
      toast({
        title: "Recording Complete",
        description: `Captured ${recordedSteps.length} steps. Review and save your test.`
      });
    }
  };
  const handleSaveRecordedTest = async () => {
    if (!recordingTestName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a test name",
        variant: "destructive"
      });
      return;
    }
    if (recordedSteps.length === 0) {
      toast({
        title: "Validation Error",
        description: "No steps recorded. Please record some actions first.",
        variant: "destructive"
      });
      return;
    }
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // If no folder selected, use "Ungrouped Tests" folder
      let folderId: string | null = selectedFolderId;
      if (!folderId) {
        folderId = await getOrCreateUngroupedFolder(user.id);
      }

      const {
        error
      } = await supabase.from("nocode_tests").insert([{
        project_id: projectId,
        name: recordingTestName.trim(),
        description: recordingTestDescription.trim() || null,
        base_url: recordingUrl.trim(),
        steps: recordedSteps as any,
        status: "draft",
        user_id: user.id,
        folder_id: folderId
      }]);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Recorded test saved successfully"
      });

      // Reset and close
      setShowRecordDialog(false);
      setRecordingUrl("");
      setRecordingTestName("");
      setRecordingTestDescription("");
      setRecordedSteps([]);
      setIsRecording(false);
      loadTests();
    } catch (error) {
      console.error("Error saving recorded test:", error);
      toast({
        title: "Error",
        description: "Failed to save recorded test",
        variant: "destructive"
      });
    }
  };
  const handleRemoveRecordedStep = (stepId: string) => {
    setRecordedSteps(prev => prev.filter(s => s.id !== stepId));
  };
  const resetForm = () => {
    setTestName("");
    setTestDescription("");
    setBaseUrl("");
    setCurrentSteps([]);
    resetCreateFormMockups();
  };
  const handleEditTest = (test: NoCodeTest) => {
    setEditTestName(test.name);
    setEditTestDescription(test.description || "");
    setEditBaseUrl(test.base_url);
    setEditTestSteps(Array.isArray(test.steps) ? test.steps : []);
    setShowEditDialog(true);
  };
  const handleUpdateTest = async () => {
    if (!selectedTest || !editTestName || !editBaseUrl) {
      toast({
        title: "Validation Error",
        description: "Please provide test name and base URL",
        variant: "destructive"
      });
      return;
    }
    try {
      const {
        error
      } = await supabase.from("nocode_tests").update({
        name: editTestName,
        description: editTestDescription,
        base_url: editBaseUrl,
        steps: editTestSteps as any
      }).eq("id", selectedTest.id);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Test updated successfully"
      });
      setShowEditDialog(false);
      loadTests();

      // Update selected test
      setSelectedTest({
        ...selectedTest,
        name: editTestName,
        description: editTestDescription,
        base_url: editBaseUrl,
        steps: editTestSteps
      });
    } catch (error) {
      console.error("Error updating test:", error);
      toast({
        title: "Error",
        description: "Failed to update test",
        variant: "destructive"
      });
    }
  };
  const handleAddEditStep = () => {
    if (!stepDescription) {
      toast({
        title: "Validation Error",
        description: "Please provide step description",
        variant: "destructive"
      });
      return;
    }
    const actionDef = getActionDefinition(stepType);
    if (actionDef?.requiresSelector && !stepSelector) {
      toast({
        title: "Validation Error",
        description: "This action requires an element selector",
        variant: "destructive"
      });
      return;
    }
    const newStep: TestStep = {
      id: crypto.randomUUID(),
      type: stepType,
      selector: stepSelector || undefined,
      value: stepValue || undefined,
      description: stepDescription,
      extraData: Object.keys(stepExtraData).length > 0 ? stepExtraData : undefined,
      skip: stepSkip || undefined
    };
    if (insertEditStepAtIndex !== null) {
      const newSteps = [...editTestSteps];
      newSteps.splice(insertEditStepAtIndex + 1, 0, newStep);
      setEditTestSteps(newSteps);
      setInsertEditStepAtIndex(null);
    } else {
      setEditTestSteps([...editTestSteps, newStep]);
    }
    resetStepForm();
    setShowEditStepDialog(false);
  };
  const handleRemoveEditStep = (stepId: string) => {
    setEditTestSteps(editTestSteps.filter(step => step.id !== stepId));
  };
  const updateEditTestStep = (index: number, field: keyof TestStep, value: any) => {
    setEditTestSteps(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return updated;
    });
  };
  const moveEditStep = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0 || direction === "down" && index === editTestSteps.length - 1) return;
    const newSteps = [...editTestSteps];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [newSteps[index], newSteps[swapIndex]] = [newSteps[swapIndex], newSteps[index]];
    setEditTestSteps(newSteps);
  };
  const getStepIcon = (type: TestStep["type"]) => {
    return getActionIcon(type);
  };
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "passed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "running":
      case "cancelling":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "cancelled":
        return <Circle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Circle className="h-4 w-4 text-gray-400" />;
    }
  };

  // Auto-heal handler
  const handleAutoHeal = async () => {
    if (!selectedTest || !selectedExecution?.results) {
      toast({
        title: "Error",
        description: "No test or execution results available",
        variant: "destructive"
      });
      return;
    }
    setIsAutoHealing(true);
    setAutoHealResult(null);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("nocode-auto-heal", {
        body: {
          testId: selectedTest.id,
          projectId: projectId,
          executionResults: selectedExecution.results,
          testSteps: selectedTest.steps
        }
      });
      if (error) throw error;
      if (!data.success) {
        throw new Error(data.error || "Auto-heal failed");
      }
      if (data.fixes && data.fixes.length > 0) {
        setAutoHealResult({
          analysis: data.analysis,
          fixes: data.fixes,
          fixedSteps: data.fixedSteps
        });
        setShowAutoHealDialog(true);
        toast({
          title: "Analysis Complete",
          description: `Found ${data.fixes.length} fix${data.fixes.length > 1 ? "es" : ""} for failed steps`
        });
      } else {
        toast({
          title: "No Issues Found",
          description: "AI could not identify any fixable issues"
        });
      }
    } catch (error) {
      console.error("Auto-heal error:", error);
      toast({
        title: "Auto-Heal Failed",
        description: error instanceof Error ? error.message : "Failed to analyze test failures",
        variant: "destructive"
      });
    } finally {
      setIsAutoHealing(false);
    }
  };
  const handleApplyAutoHealFix = async () => {
    if (!selectedTest || !autoHealResult?.fixedSteps) return;
    setIsApplyingFix(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke("nocode-auto-heal", {
        body: {
          testId: selectedTest.id,
          projectId: projectId,
          applyFix: true,
          proposedFixes: autoHealResult.fixedSteps
        }
      });
      if (error) throw error;
      if (!data.success) {
        throw new Error(data.error || "Failed to apply fixes");
      }

      // Update local state
      setTests(prev => prev.map(t => t.id === selectedTest.id ? {
        ...t,
        steps: autoHealResult.fixedSteps
      } : t));
      setSelectedTest(prev => prev ? {
        ...prev,
        steps: autoHealResult.fixedSteps
      } : null);
      toast({
        title: "Fixes Applied",
        description: "Test steps have been updated. Run the test again to verify."
      });
      setShowAutoHealDialog(false);
      setShowLogsDialog(false);
      setAutoHealResult(null);
    } catch (error) {
      console.error("Apply fix error:", error);
      toast({
        title: "Failed to Apply Fixes",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    } finally {
      setIsApplyingFix(false);
    }
  };
  return <div className="space-y-6">
    <div className="flex justify-between items-center">
      <div>
        <h1 className="text-3xl font-bold">No-Code Automation</h1>
        <p className="text-muted-foreground mt-2">Create and run automated tests without writing any code</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleExportProject}>
          <Download className="mr-2 h-4 w-4" />
          Export Playwright
        </Button>
        {activeTab === "tests" ? <>
          <Button variant="outline" onClick={() => setShowCreateFolderDialog(true)}>
            <Folder className="mr-2 h-4 w-4" />
            Add Folder
          </Button>
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Select Test Case
          </Button>
          <Button variant="outline" onClick={() => setShowRecordDialog(true)}>
            <Video className="mr-2 h-4 w-4" />
            Record Test
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Test
          </Button>
        </> : <Button onClick={() => setShowCreateSuiteDialog(true)}>
          <FolderPlus className="mr-2 h-4 w-4" />
          Create Suite
        </Button>}
      </div>
    </div>

    <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "tests" | "suites")}>
      <TabsList>
        <TabsTrigger value="tests">
          <Play className="mr-2 h-4 w-4" />
          Tests
        </TabsTrigger>
        <TabsTrigger value="suites">
          <Layers className="mr-2 h-4 w-4" />
          Test Suites
        </TabsTrigger>
      </TabsList>

      <TabsContent value="tests" className="mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Test List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tests</CardTitle>
                  <CardDescription>Your automated test scenarios</CardDescription>
                </div>
                {tests.length > 0 && <Checkbox checked={bulkSelectedTests.size === tests.length && tests.length > 0} onCheckedChange={handleSelectAllTests} aria-label="Select all tests" />}
              </div>
              {bulkSelectedTests.size > 0 && <div className="flex items-center justify-between mt-3 p-2 bg-primary/10 rounded-md">
                <span className="text-sm font-medium">{bulkSelectedTests.size} selected</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowBulkMoveDialog(true)}>
                    <Folder className="mr-1 h-3 w-3" />
                    Move
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearBulkSelection}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>}
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div> : tests.length === 0 && folders.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                No tests yet. Create your first test or folder to get started.
              </div> : <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-2">
                    {/* Folders with their tests */}
                    {folders.map(folder => {
                      const folderTests = tests.filter(t => t.folder_id === folder.id);
                      const isExpanded = expandedFolders.has(folder.id);
                      return <DroppableFolder key={folder.id} id={`folder-${folder.id}`} isOver={false}>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer group" onClick={() => toggleFolder(folder.id)}>
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              {isExpanded ? <FolderOpen className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4 text-muted-foreground" />}
                              {editingFolderId === folder.id ? <Input value={editingFolderName} onChange={e => setEditingFolderName(e.target.value)} onBlur={() => handleRenameFolder(folder.id, editingFolderName)} onKeyDown={e => {
                                if (e.key === "Enter") {
                                  handleRenameFolder(folder.id, editingFolderName);
                                } else if (e.key === "Escape") {
                                  setEditingFolderId(null);
                                }
                              }} onClick={e => e.stopPropagation()} className="h-6 text-sm w-32" autoFocus /> : <span className="font-medium text-sm" onDoubleClick={e => {
                                e.stopPropagation();
                                setEditingFolderId(folder.id);
                                setEditingFolderName(folder.name);
                              }}>
                                {folder.name}
                              </span>}
                              <Badge variant="secondary" className="text-xs">
                                {folderTests.length}
                              </Badge>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => {
                                e.stopPropagation();
                                setEditingFolderId(folder.id);
                                setEditingFolderName(folder.name);
                              }}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => {
                                e.stopPropagation();
                                setFolderToDelete(folder.id);
                              }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          {isExpanded && <div className="ml-6 space-y-2">
                            {folderTests.length === 0 ? <p className="text-xs text-muted-foreground py-2 pl-2">Drop tests here</p> : folderTests.map(test => <DraggableTest key={test.id} test={test} isSelected={selectedTest?.id === test.id} onSelect={() => {
                              setSelectedTest(test);
                              loadExecutions(test.id);
                            }} onStatusChange={value => updateTestStatus(test.id, value)} isChecked={bulkSelectedTests.has(test.id)} onCheckChange={checked => handleBulkSelectTest(test.id, checked)} showCheckbox={bulkSelectedTests.size > 0 || true} />)}
                          </div>}
                        </div>
                      </DroppableFolder>;
                    })}

                    {/* Root level drop zone */}
                    <DroppableFolder id="root-drop" isOver={false}>
                      <div className="min-h-[40px]">
                        {tests.filter(t => !t.folder_id).length > 0 && <>
                          {folders.length > 0 && <div className="pt-2 pb-1">
                            <span className="text-xs font-medium text-muted-foreground">Ungrouped Tests</span>
                          </div>}
                          <div className="space-y-2">
                            {tests.filter(t => !t.folder_id).map(test => <DraggableTest key={test.id} test={test} isSelected={selectedTest?.id === test.id} onSelect={() => {
                              setSelectedTest(test);
                              loadExecutions(test.id);
                            }} onStatusChange={value => updateTestStatus(test.id, value)} isChecked={bulkSelectedTests.has(test.id)} onCheckChange={checked => handleBulkSelectTest(test.id, checked)} showCheckbox={bulkSelectedTests.size > 0 || true} />)}
                          </div>
                        </>}
                        {folders.length > 0 && tests.filter(t => !t.folder_id).length === 0 && <p className="text-xs text-muted-foreground py-2 text-center">Drop here for root level</p>}
                      </div>
                    </DroppableFolder>
                  </div>
                </ScrollArea>

                <DragOverlay>
                  {activeId ? <Card className="shadow-lg opacity-90">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{tests.find(t => t.id === activeId)?.name}</span>
                      </div>
                    </CardContent>
                  </Card> : null}
                </DragOverlay>
              </DndContext>}
            </CardContent>
          </Card>

          {/* Test Details */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>{selectedTest ? selectedTest.name : "Select a test"}</CardTitle>
                  <CardDescription>
                    {selectedTest ? "Test details and execution history" : "Choose a test from the list to view details"}
                  </CardDescription>
                </div>
                {selectedTest && <div className="flex gap-2">
                  <Button onClick={() => handleRunTest(selectedTest)} size="sm">
                    <Play className="mr-2 h-4 w-4" />
                    Run Test
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleEditTest(selectedTest)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleCloneTest(selectedTest)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Clone
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setTestToDelete(selectedTest.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>}
              </div>
            </CardHeader>
            <CardContent>
              {selectedTest ? <div className="space-y-6">
                {/* Base URL */}
                <div>
                  <Label className="text-sm font-semibold">Base URL</Label>
                  <p className="text-sm text-muted-foreground mt-1">{selectedTest.base_url}</p>
                </div>

                {/* Steps */}
                <div>
                  <Label className="text-sm font-semibold mb-3 block">Test Steps</Label>
                  <div className="space-y-2">
                    {(Array.isArray(selectedTest.steps) ? selectedTest.steps : []).map((step: TestStep, index: number) => <Card key={step.id} className="border-l-4 border-l-primary/50">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">{getStepIcon(step.type)}</span>
                              <Badge variant="outline">{step.type}</Badge>
                            </div>
                            <p className="text-sm font-medium">{step.description}</p>
                            {step.selector && <p className="text-xs text-muted-foreground mt-1">Selector: {step.selector}</p>}
                            {step.value && <p className="text-xs text-muted-foreground">Value: {step.value}</p>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>)}
                  </div>
                </div>

                {/* Execution History */}
                <div>
                  <Label className="text-sm font-semibold mb-3 block">Recent Executions</Label>
                  {executions.length === 0 ? <p className="text-sm text-muted-foreground">No executions yet</p> : <div className="space-y-2">
                    {executions.map(execution => <Card key={execution.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => {
                      setSelectedExecution(execution);
                      setShowLogsDialog(true);
                    }}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(execution.status)}
                            <div>
                              <p className="text-sm font-medium capitalize">{execution.status}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(execution.started_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          {execution.duration_ms && <Badge variant="secondary">{execution.duration_ms}ms</Badge>}
                        </div>
                        {execution.error_message && <p className="text-xs text-red-500 mt-2">{execution.error_message}</p>}
                      </CardContent>
                    </Card>)}
                  </div>}
                </div>
              </div> : <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Eye className="h-12 w-12 mb-4 opacity-50" />
                <p>Select a test to view details</p>
              </div>}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="suites" className="mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Suite List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Test Suites</CardTitle>
              <CardDescription>Groups of tests to run together</CardDescription>
            </CardHeader>
            <CardContent>
              {suites.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                No test suites yet. Create your first suite to get started.
              </div> : <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-3">
                  {suites.map(suite => <Card key={suite.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedSuite?.id === suite.id ? "ring-2 ring-primary" : ""}`} onClick={() => {
                    setSelectedSuite(suite);
                    loadSuiteTests(suite.id);
                    loadSuiteExecutions(suite.id);
                  }}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold">{suite.name}</h3>
                        <Badge variant="secondary">{suite.test_count || 0} tests</Badge>
                      </div>
                      {suite.description && <p className="text-sm text-muted-foreground mb-3">{suite.description}</p>}

                      {/* Suite Statistics */}
                      {(suite.total_runs ?? 0) > 0 ? <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="text-center">
                            <p className="text-muted-foreground">Pass Rate</p>
                            <p className={`font-semibold ${(suite.pass_rate ?? 0) >= 80 ? "text-green-500" : (suite.pass_rate ?? 0) >= 50 ? "text-yellow-500" : "text-red-500"}`}>
                              {suite.pass_rate ?? 0}%
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-muted-foreground">Total Runs</p>
                            <p className="font-semibold">{suite.total_runs ?? 0}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-muted-foreground">Last Run</p>
                            {suite.last_status === "passed" ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" /> : suite.last_status === "failed" ? <XCircle className="h-4 w-4 text-red-500 mx-auto" /> : suite.last_status === "running" ? <Loader2 className="h-4 w-4 text-blue-500 animate-spin mx-auto" /> : <Circle className="h-4 w-4 text-muted-foreground mx-auto" />}
                          </div>
                        </div>
                        {suite.last_run && <p className="text-xs text-muted-foreground text-center mt-2">
                          Last: {new Date(suite.last_run).toLocaleDateString()}
                        </p>}
                      </div> : <div className="mt-3 pt-3 border-t border-border/50">
                        <p className="text-xs text-muted-foreground text-center">No executions yet</p>
                      </div>}
                    </CardContent>
                  </Card>)}
                </div>
              </ScrollArea>}
            </CardContent>
          </Card>

          {/* Suite Details */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>{selectedSuite ? selectedSuite.name : "Select a suite"}</CardTitle>
                  <CardDescription>
                    {selectedSuite ? "Suite tests and execution history" : "Choose a suite from the list to view details"}
                  </CardDescription>
                </div>
                {selectedSuite && <div className="flex gap-2">
                  <Button onClick={handleRunSuite} size="sm" disabled={isRunningSuite || suiteTests.length === 0}>
                    {isRunningSuite ? <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running...
                    </> : <>
                      <Play className="mr-2 h-4 w-4" />
                      Run Suite
                    </>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    setSelectedTestsForSuite(new Set());
                    setShowAddTestsToSuiteDialog(true);
                  }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Tests
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteSuite(selectedSuite.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>}
              </div>
            </CardHeader>
            <CardContent>
              {selectedSuite ? <div className="space-y-6">
                {/* Suite Statistics Summary */}
                {(selectedSuite.total_runs ?? 0) > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Pass Rate</p>
                    <div className="flex items-center justify-center gap-2">
                      <Progress value={selectedSuite.pass_rate ?? 0} className="h-2 w-16" />
                      <span className={`text-lg font-bold ${(selectedSuite.pass_rate ?? 0) >= 80 ? "text-green-500" : (selectedSuite.pass_rate ?? 0) >= 50 ? "text-yellow-500" : "text-red-500"}`}>
                        {selectedSuite.pass_rate ?? 0}%
                      </span>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Total Runs</p>
                    <p className="text-lg font-bold">{selectedSuite.total_runs ?? 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Tests Passed</p>
                    <p className="text-lg font-bold text-green-500">{selectedSuite.total_passed ?? 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Tests Failed</p>
                    <p className="text-lg font-bold text-red-500">{selectedSuite.total_failed ?? 0}</p>
                  </div>
                </div>}

                {/* Suite Tests */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-semibold">Tests in Suite ({suiteTests.length})</Label>
                    {suiteTests.length > 1 && <span className="text-xs text-muted-foreground">Drag to reorder execution</span>}
                  </div>
                  {suiteTests.length === 0 ? <p className="text-sm text-muted-foreground">
                    No tests in this suite yet. Add some tests to get started.
                  </p> : <DndContext sensors={suiteReorderSensors} collisionDetection={closestCenter} onDragEnd={event => {
                    const {
                      active,
                      over
                    } = event;
                    if (over && active.id !== over.id) {
                      handleReorderSuiteTests(active.id as string, over.id as string);
                    }
                  }}>
                    <SortableContext items={suiteTests.map(t => t.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {suiteTests.map((suiteTest, index) => <SortableSuiteTest key={suiteTest.id} suiteTest={suiteTest} index={index} onRemove={() => handleRemoveTestFromSuite(suiteTest.id)} />)}
                      </div>
                    </SortableContext>
                  </DndContext>}
                </div>

                {/* Suite Execution History */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-semibold">Recent Suite Executions</Label>
                    {suiteExecutions.length > 0 && <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={exportSuiteHistoryAsCSV} className="gap-2">
                        <FileSpreadsheet className="h-4 w-4" />
                        CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={exportSuiteHistoryAsPDF} className="gap-2">
                        <FileText className="h-4 w-4" />
                        PDF
                      </Button>
                    </div>}
                  </div>
                  {suiteExecutions.length === 0 ? <p className="text-sm text-muted-foreground">No executions yet</p> : <div className="space-y-2">
                    {suiteExecutions.map(execution => <Card key={execution.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => {
                      setSelectedSuiteExecution(execution);
                      setExpandedTestResults(new Set());
                      setTestStepResults({});
                      setShowSuiteLogsDialog(true);
                    }}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(execution.status)}
                            <div>
                              <p className="text-sm font-medium capitalize">{execution.status}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(execution.started_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant="default">{execution.passed_tests} passed</Badge>
                            {execution.failed_tests > 0 && <Badge variant="destructive">{execution.failed_tests} failed</Badge>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>)}
                  </div>}
                </div>
              </div> : <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Layers className="h-12 w-12 mb-4 opacity-50" />
                <p>Select a suite to view details</p>
              </div>}
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>

    {/* Create Test Dialog */}
    <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Test</DialogTitle>
          <DialogDescription>Define your automated test scenario with visual steps</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="testName">Test Name *</Label>
            <Input id="testName" value={testName} onChange={e => setTestName(e.target.value)} placeholder="e.g., Login Flow Test" />
          </div>
          <div>
            <Label htmlFor="testDescription">Description</Label>
            <Textarea id="testDescription" value={testDescription} onChange={e => setTestDescription(e.target.value)} placeholder="Describe what this test does" />
          </div>
          <div>
            <Label htmlFor="baseUrl">Base URL *</Label>
            <Input id="baseUrl" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://example.com" />
          </div>

          {/* AI Step Generation Section */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <h4 className="font-medium">AI Step Generation (Optional)</h4>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Upload mockups or paste HTML to automatically generate test steps using AI
            </p>

            {/* Mockup Upload Section */}
            <div className="space-y-2 mb-4">
              <Label className="flex items-center gap-2">
                <Image className="h-4 w-4" />
                Mockup/Screenshot Images (Up to 5)
              </Label>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                <input id="create-mockup-upload" type="file" accept="image/*" multiple onChange={handleCreateMockupFileChange} className="hidden" />
                <label htmlFor="create-mockup-upload" className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {createMockupFiles.length > 0 ? `${createMockupFiles.length} file${createMockupFiles.length > 1 ? "s" : ""} selected` : "Click to upload mockup images"}
                  </span>
                  <span className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB each</span>
                </label>
              </div>
              {createMockupFiles.length > 0 && <div className="space-y-1">
                {createMockupFiles.map((file, index) => <div key={index} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-2">
                  <span className="text-green-600 flex items-center gap-2">
                    ✓ {file.name}
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => removeCreateMockupFile(index)} className="h-6 px-2">
                    Remove
                  </Button>
                </div>)}
              </div>}
            </div>

            {/* HTML DOM Section */}
            <div className="space-y-2 mb-4">
              <Label>HTML DOM Structure</Label>
              <Textarea placeholder={`Paste your HTML DOM structure here...

Example:
<div class="login-form">
  <input id="username" type="text" placeholder="Username" />
  <input id="password" type="password" placeholder="Password" />
  <button id="login-btn">Login</button>
</div>`} value={createHtmlDom} onChange={e => setCreateHtmlDom(e.target.value)} className="min-h-[100px] font-mono text-sm" />
            </div>

            {/* Generate Steps Button */}
            {(createMockupFiles.length > 0 || createHtmlDom.trim()) && <div className="space-y-3">
              <Button variant="outline" className="w-full" onClick={handleGenerateStepsFromMockups} disabled={isGeneratingSteps || !baseUrl.trim()}>
                {isGeneratingSteps ? <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Steps...
                </> : <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate Test Steps with AI
                </>}
              </Button>
              {!baseUrl.trim() && <p className="text-xs text-destructive text-center">Please enter a Base URL first</p>}
              {isGeneratingSteps && <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Analyzing and generating steps...</span>
                  <span className="font-medium">{generationProgress}%</span>
                </div>
                <Progress value={generationProgress} className="h-2" />
              </div>}
            </div>}
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <Label>Test Steps</Label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  setImportStepsTarget("create");
                  setImportFromTestId("");
                  setShowImportStepsDialog(true);
                }}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Steps
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowStepDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Step
                </Button>
              </div>
            </div>
            {currentSteps.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No steps added yet. Add steps manually or use AI generation above.</p> : <DndContext sensors={createStepSensors} collisionDetection={closestCenter} onDragEnd={handleCreateStepDragEnd}>
              <SortableContext items={currentSteps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {currentSteps.map((step, index) => <SortableCreateStep key={step.id} step={step} index={index} onEdit={() => handleEditCreateStep(index)} onInsert={() => {
                    setInsertStepAtIndex(index);
                    setShowStepDialog(true);
                  }} onRemove={() => handleRemoveStep(step.id)} onToggleSkip={skip => {
                    const updated = [...currentSteps];
                    updated[index] = {
                      ...updated[index],
                      skip
                    };
                    setCurrentSteps(updated);
                  }} />)}
                </div>
              </SortableContext>
            </DndContext>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateTest}>Create Test</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Import Test Case Dialog */}
    <Dialog open={showImportDialog} onOpenChange={open => {
      if (!open) {
        resetElementExtraction();
        setSelectedTestCaseId("");
        setImportToFolderId(null);
      }
      setShowImportDialog(open);
    }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Test Case</DialogTitle>
          <DialogDescription>
            Select a test case and optionally provide mockup images or HTML DOM for better element extraction
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {/* Folder Selection */}
          <div>
            <Label>Import to Folder (Optional)</Label>
            <Select value={importToFolderId || "none"} onValueChange={v => setImportToFolderId(v === "none" ? null : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No folder (root level)</SelectItem>
                {folders.map(folder => <SelectItem key={folder.id} value={folder.id}>
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4" />
                    {folder.name}
                  </div>
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Test Case Selection */}
          <div>
            <Label>Select Test Case</Label>
            <Select value={selectedTestCaseId} onValueChange={setSelectedTestCaseId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a test case" />
              </SelectTrigger>
              <SelectContent>
                {availableTestCases.map(tc => <SelectItem key={tc.id} value={tc.id}>
                  {tc.title}
                  {tc.user_stories && ` - ${tc.user_stories.title}`}
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {selectedTestCaseId && <>
            {/* Mockup Upload Section */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Image className="h-4 w-4" />
                Mockup/Screenshot Images (Optional - Up to 5)
              </Label>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                <input id="mockup-upload-nocode" type="file" accept="image/*" multiple onChange={handleMockupFileChange} className="hidden" />
                <label htmlFor="mockup-upload-nocode" className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {mockupFiles.length > 0 ? `${mockupFiles.length} file${mockupFiles.length > 1 ? "s" : ""} selected` : "Click to upload mockup images"}
                  </span>
                  <span className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB each</span>
                </label>
              </div>
              {mockupFiles.length > 0 && <div className="space-y-1">
                {mockupFiles.map((file, index) => <div key={index} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-2">
                  <span className="text-green-600 flex items-center gap-2">
                    ✓ {file.name}
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => removeMockupFile(index)} className="h-6 px-2">
                    Remove
                  </Button>
                </div>)}
              </div>}
            </div>

            {/* HTML DOM Section */}
            <div className="space-y-2">
              <Label>HTML DOM Structure (Optional)</Label>
              <Textarea placeholder={`Paste your HTML DOM structure here...

Example:
<div class="login-form">
  <input id="username" type="text" placeholder="Username" />
  <input id="password" type="password" placeholder="Password" />
  <button id="login-btn">Login</button>
</div>`} value={htmlDom} onChange={e => setHtmlDom(e.target.value)} className="min-h-[120px] font-mono text-sm" />
              <p className="text-xs text-muted-foreground">
                Provide HTML structure for more accurate element locators
              </p>
            </div>

            {/* Extract Elements Button */}
            {(mockupFiles.length > 0 || htmlDom.trim()) && <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Element Extraction</h4>
                  <p className="text-xs text-muted-foreground">
                    Use AI to extract UI elements from mockups/DOM before conversion
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleExtractElements} disabled={isExtracting}>
                  {isExtracting ? <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extracting...
                  </> : <>
                    <Eye className="h-4 w-4 mr-2" />
                    Extract Elements
                  </>}
                </Button>
              </div>
              {isExtracting && <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Extracting elements...</span>
                  <span className="font-medium">{extractionProgress}%</span>
                </div>
                <Progress value={extractionProgress} className="h-2" />
              </div>}
              {parsedElements.length > 0 && <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                {parsedElements.length} elements extracted ({selectedElements.size} selected)
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setShowElementExtractionDialog(true)}>
                  View/Edit
                </Button>
              </div>}
            </div>}

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Smart Conversion</AlertTitle>
              <AlertDescription>
                Natural language test steps will be converted to automation steps.
                {parsedElements.length > 0 && " Extracted elements will be used for better selector accuracy."} You
                can review and edit before creating.
              </AlertDescription>
            </Alert>
          </>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setShowImportDialog(false);
            resetElementExtraction();
            setSelectedTestCaseId("");
          }}>
            Cancel
          </Button>
          <Button onClick={handleImportTestCase} disabled={!selectedTestCaseId || isExtracting}>
            Preview Conversion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Element Extraction Selection Dialog */}
    <Dialog open={showElementExtractionDialog} onOpenChange={setShowElementExtractionDialog}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Extracted UI Elements</DialogTitle>
          <DialogDescription>Select elements to use for generating automation selectors</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-muted-foreground">
            {selectedElements.size} of {parsedElements.length} elements selected
          </span>
          <Button variant="ghost" size="sm" onClick={toggleSelectAllElements}>
            {selectedElements.size === parsedElements.length ? "Deselect All" : "Select All"}
          </Button>
        </div>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-2">
            {parsedElements.map((element, index) => <div key={index} className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${selectedElements.has(index) ? "bg-primary/5 border-primary/20" : "hover:bg-muted/50"}`}>
              <Checkbox id={`element-${index}`} checked={selectedElements.has(index)} onCheckedChange={() => toggleElement(index)} className="mt-1" />
              <label htmlFor={`element-${index}`} className="flex-1 cursor-pointer space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{element.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {element.tagName}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground font-mono break-all">{element.locatorStrategy}</div>
              </label>
            </div>)}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => setShowElementExtractionDialog(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Confirmation Dialog */}
    <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirm Test Conversion</DialogTitle>
          <DialogDescription>Review the converted automation steps before creating the test</DialogDescription>
        </DialogHeader>

        {conversionPreview && <div className="space-y-6">
          <div>
            <h3 className="font-semibold mb-2">Test Case: {conversionPreview.testCase.title}</h3>
            <p className="text-sm text-muted-foreground">{conversionPreview.testCase.description}</p>
          </div>

          <Tabs defaultValue="original" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="original">Original Steps</TabsTrigger>
              <TabsTrigger value="converted">Converted Steps</TabsTrigger>
            </TabsList>

            <TabsContent value="original" className="space-y-2">
              <Label className="text-sm font-semibold">Natural Language Steps</Label>
              {conversionPreview.originalSteps.map((step, index) => <Card key={index}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-muted-foreground">{index + 1}.</span>
                    <p className="text-sm">{step}</p>
                  </div>
                </CardContent>
              </Card>)}
            </TabsContent>

            <TabsContent value="converted" className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Automation Steps (Editable)</Label>
                <p className="text-xs text-muted-foreground">Adjust selectors and values as needed</p>
              </div>
              {editedSteps.map((step, index) => <Card key={step.id} className="border-l-4 border-l-primary/50">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-semibold text-xs">
                        {index + 1}
                      </div>
                      <span className="text-lg">{getStepIcon(step.type)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor={`action-${index}`} className="text-xs text-muted-foreground">
                          Action Type
                        </Label>
                        <Select value={step.type} onValueChange={value => updateEditedStep(index, "type", value)}>
                          <SelectTrigger id={`action-${index}`} className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="navigate">Navigate</SelectItem>
                            <SelectItem value="click">Click</SelectItem>
                            <SelectItem value="type">Type</SelectItem>
                            <SelectItem value="verify">Verify</SelectItem>
                            <SelectItem value="wait">Wait</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor={`description-${index}`} className="text-xs text-muted-foreground">
                          Description
                        </Label>
                        <Input id={`description-${index}`} value={step.description} onChange={e => updateEditedStep(index, "description", e.target.value)} className="h-9" />
                      </div>
                    </div>

                    {step.type !== "wait" && <div>
                      <Label htmlFor={`selector-${index}`} className="text-xs text-muted-foreground">
                        CSS Selector
                      </Label>
                      <Input id={`selector-${index}`} value={step.selector || ""} onChange={e => updateEditedStep(index, "selector", e.target.value)} placeholder="e.g., #username, .btn-primary, [data-testid='login']" className="font-mono text-xs h-9" />
                    </div>}

                    {(step.type === "type" || step.type === "verify" || step.type === "navigate") && <div>
                      <Label htmlFor={`value-${index}`} className="text-xs text-muted-foreground">
                        {step.type === "type" ? "Text to Type" : step.type === "navigate" ? "URL" : "Expected Value"}
                      </Label>
                      <Input id={`value-${index}`} value={step.value || ""} onChange={e => updateEditedStep(index, "value", e.target.value)} placeholder={step.type === "type" ? "Enter text" : step.type === "navigate" ? "https://example.com" : "Expected value"} className="h-9" />
                    </div>}
                  </div>
                </CardContent>
              </Card>)}
            </TabsContent>
          </Tabs>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Review Required</AlertTitle>
            <AlertDescription>
              Please review the converted steps. You can edit them after creation if needed. The conversion is based
              on keyword detection and may require manual adjustment.
            </AlertDescription>
          </Alert>
        </div>}

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setShowConfirmDialog(false);
            setConversionPreview(null);
          }}>
            Cancel
          </Button>
          <Button onClick={handleConfirmImport}>Confirm & Create Test</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Live Progress Dialog */}
    <Dialog open={showLiveProgressDialog} onOpenChange={setShowLiveProgressDialog}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Test Execution in Progress</DialogTitle>
          <DialogDescription>Watch your test execute in real-time</DialogDescription>
        </DialogHeader>

        {liveExecution && <div className="flex-1 overflow-hidden flex flex-col">
          {/* Status Bar */}
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {(liveExecution.status === "running" || liveExecution.status === "cancelling") && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                {liveExecution.status === "passed" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                {liveExecution.status === "failed" && <XCircle className="h-5 w-5 text-red-500" />}
                {liveExecution.status === "cancelled" && <Circle className="h-5 w-5 text-yellow-500" />}
                <span className="font-semibold capitalize">
                  {isCancelling ? "Cancelling..." : liveExecution.status}
                </span>
              </div>
              {liveExecution.results && Array.isArray(liveExecution.results) && <Badge variant="secondary">
                {liveExecution.results.length} /{" "}
                {selectedTest?.steps && Array.isArray(selectedTest.steps) ? selectedTest.steps.length : 0} steps
              </Badge>}
            </div>
            {liveExecution.status === "running" && !isCancelling && <Button variant="destructive" size="sm" onClick={handleCancelTest}>
              Cancel Test
            </Button>}
          </div>

          {/* Live Steps Progress */}
          <ScrollArea className="flex-1 pr-4 overflow-auto">
            {liveExecution.results && Array.isArray(liveExecution.results) ? <div className="space-y-3">
              {liveExecution.results.map((result: any, index: number) => <Card key={index} className={`border-l-4 ${result.status === "passed" ? "border-l-green-500 animate-in slide-in-from-left" : result.status === "failed" ? "border-l-red-500 animate-in slide-in-from-left" : "border-l-yellow-500"}`}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Step Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="font-mono text-xs">
                              {result.step?.type || "unknown"}
                            </Badge>
                            {result.status === "passed" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : result.status === "failed" ? <XCircle className="h-4 w-4 text-red-500" /> : <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                            <span className="text-xs font-semibold capitalize">{result.status}</span>
                          </div>
                          <p className="text-sm font-medium">{result.step?.description || "No description"}</p>
                        </div>
                      </div>
                      {result.duration && <Badge variant="secondary" className="text-xs">
                        {result.duration}ms
                      </Badge>}
                    </div>

                    {/* Step Details */}
                    <div className="ml-10 space-y-2">
                      {result.step?.selector && <div className="flex items-start gap-2 text-xs">
                        <span className="text-muted-foreground font-semibold min-w-[80px]">Selector:</span>
                        <code className="font-mono bg-muted px-2 py-1 rounded text-xs">
                          {result.step.selector}
                        </code>
                      </div>}
                      {result.step?.value && <div className="flex items-start gap-2 text-xs">
                        <span className="text-muted-foreground font-semibold min-w-[80px]">Value:</span>
                        <span className="font-mono bg-muted px-2 py-1 rounded text-xs">
                          {result.step.value}
                        </span>
                      </div>}
                      {result.error && <div className="flex flex-col gap-2 text-xs mt-2">
                        <span className="text-red-500 font-semibold">Error Log:</span>
                        <pre className="text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded text-xs whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto font-mono border border-red-200 dark:border-red-900">
                          {result.error}
                        </pre>
                      </div>}
                      {result.screenshot && <div className="mt-2">
                        <img src={result.screenshot} alt={`Step ${index + 1}`} className="w-full max-w-xl border rounded-lg shadow-sm cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenScreenshot(result.screenshot)} title="Click to view fullscreen" />
                      </div>}
                    </div>
                  </div>
                </CardContent>
              </Card>)}

              {/* Show pending steps */}
              {selectedTest?.steps && Array.isArray(selectedTest.steps) && liveExecution.results && Array.isArray(liveExecution.results) && liveExecution.results.length < selectedTest.steps.length && <>
                {selectedTest.steps.slice(liveExecution.results.length).map((step: TestStep, idx: number) => <Card key={`pending-${idx}`} className="border-l-4 border-l-gray-300 opacity-50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-500 font-semibold text-sm">
                        {liveExecution.results.length + idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="font-mono text-xs">
                            {step.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">Pending</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>)}
              </>}
            </div> : <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Initializing test execution...</p>
            </div>}
          </ScrollArea>
        </div>}

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setShowLiveProgressDialog(false);
            setIsCancelling(false);
          }} disabled={liveExecution?.status === "running" || isCancelling}>
            {liveExecution?.status === "running" || isCancelling ? "Running..." : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Execution Logs Dialog */}
    <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Execution Logs</DialogTitle>
          <DialogDescription>
            Detailed step-by-step execution results
            {selectedExecution && ` - ${new Date(selectedExecution.started_at).toLocaleString()}`}
          </DialogDescription>
        </DialogHeader>

        {selectedExecution && <div className="flex-1 overflow-hidden flex flex-col">
          {/* Summary Section */}
          <div className="grid grid-cols-4 gap-4 mb-4 p-4 bg-muted/30 rounded-lg">
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <div className="flex items-center gap-2 mt-1">
                {getStatusIcon(selectedExecution.status)}
                <span className="font-semibold capitalize">{selectedExecution.status}</span>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Duration</Label>
              <p className="font-semibold mt-1">
                {selectedExecution.duration_ms ? `${selectedExecution.duration_ms}ms` : "N/A"}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Started</Label>
              <p className="font-semibold mt-1 text-sm">
                {new Date(selectedExecution.started_at).toLocaleTimeString()}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Completed</Label>
              <p className="font-semibold mt-1 text-sm">
                {selectedExecution.completed_at ? new Date(selectedExecution.completed_at).toLocaleTimeString() : "N/A"}
              </p>
            </div>
          </div>
          <ScrollArea className="h-[400px] pr-4">
            {/* Error Message */}
            {selectedExecution.error_message && <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Execution Error</AlertTitle>
              <AlertDescription>{selectedExecution.error_message}</AlertDescription>
            </Alert>}

            {/* Auto Heal Button for Failed Tests */}
            {selectedExecution.status === "failed" && selectedExecution.results?.some((r: any) => r.status === "failed") && <div className="mb-4 p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">AI Auto-Heal</h4>
                    <p className="text-xs text-muted-foreground">
                      Let AI analyze and fix the failing test steps
                    </p>
                  </div>
                </div>
                <Button onClick={handleAutoHeal} disabled={isAutoHealing} className="gap-2">
                  {isAutoHealing ? <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </> : <>
                    <Wand2 className="h-4 w-4" />
                    Auto-Heal
                  </>}
                </Button>
              </div>
            </div>}

            {/* Step Results */}
            {selectedExecution.results && Array.isArray(selectedExecution.results) ? <div className="space-y-3">
              {selectedExecution.results.map((result: any, index: number) => <Card key={index} className={`border-l-4 ${result.status === "passed" ? "border-l-green-500" : result.status === "failed" ? "border-l-red-500" : "border-l-yellow-500"}`}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Step Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="font-mono text-xs">
                              {result.step?.type || "unknown"}
                            </Badge>
                            {result.status === "passed" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : result.status === "failed" ? <XCircle className="h-4 w-4 text-red-500" /> : <Circle className="h-4 w-4 text-yellow-500" />}
                            <span className="text-xs font-semibold capitalize">{result.status}</span>
                          </div>
                          <p className="text-sm font-medium">{result.step?.description || "No description"}</p>
                        </div>
                      </div>
                      {result.duration && <Badge variant="secondary" className="text-xs">
                        {result.duration}ms
                      </Badge>}
                    </div>

                    {/* Step Details */}
                    <div className="ml-10 space-y-2">
                      {result.step?.selector && <div className="flex items-start gap-2 text-xs">
                        <span className="text-muted-foreground font-semibold min-w-[80px]">Selector:</span>
                        <code className="font-mono bg-muted px-2 py-1 rounded">{result.step.selector}</code>
                      </div>}
                      {result.step?.value && <div className="flex items-start gap-2 text-xs">
                        <span className="text-muted-foreground font-semibold min-w-[80px]">Value:</span>
                        <span className="font-mono bg-muted px-2 py-1 rounded">{result.step.value}</span>
                      </div>}
                      {result.error && <div className="flex flex-col gap-2 text-xs mt-2">
                        <span className="text-red-500 font-semibold">Error Log:</span>
                        <pre className="text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded text-xs whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto font-mono border border-red-200 dark:border-red-900">
                          {result.error}
                        </pre>
                      </div>}

                      {/* Visual Regression Results */}
                      {(result.step?.type === "visualRegression" || result.step?.type === "visualRegressionElement") && <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            Visual Regression
                          </Label>
                          {result.step?.extraData?.visualDiff && <Badge variant="destructive" className="text-xs">
                            {result.step.extraData.mismatchPercentage}% difference
                          </Badge>}
                          {result.step?.extraData?.visualMatch && <Badge variant="default" className="text-xs bg-green-500">
                            Match ({result.step.extraData.mismatchPercentage}% diff)
                          </Badge>}
                          {result.step?.extraData?.noBaselineYet && <Badge variant="secondary" className="text-xs">
                            No Baseline
                          </Badge>}
                        </div>

                        {/* No baseline message */}
                        {result.step?.extraData?.noBaselineYet && <div className="flex items-center justify-between p-2 bg-yellow-50 dark:bg-yellow-950/20 rounded border border-yellow-200 dark:border-yellow-800">
                          <span className="text-xs text-yellow-700 dark:text-yellow-300">
                            No baseline exists. Save the current screenshot as baseline.
                          </span>
                          <Button size="sm" variant="outline" onClick={() => handleSaveBaseline(result.step.id, result.step.description, result.step.extraData.currentScreenshot)} disabled={isSavingBaseline} className="gap-1">
                            {isSavingBaseline ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                            Save as Baseline
                          </Button>
                        </div>}

                        {/* Visual diff available */}
                        {result.step?.extraData?.visualDiff && <div className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800">
                          <span className="text-xs text-red-700 dark:text-red-300">
                            Visual difference detected (threshold: {result.step.extraData.threshold}%)
                          </span>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleViewVisualComparison(result)} className="gap-1">
                              <Eye className="h-3 w-3" />
                              Compare
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleSaveBaseline(result.step.id, result.step.description, result.step.extraData.currentScreenshot)} disabled={isSavingBaseline} className="gap-1">
                              {isSavingBaseline ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                              Update Baseline
                            </Button>
                          </div>
                        </div>}
                      </div>}

                      {result.screenshot && <div className="mt-3">
                        <Label className="text-xs text-muted-foreground mb-2 block">Screenshot</Label>
                        <img src={result.screenshot} alt={`Step ${index + 1} screenshot`} className="w-full max-w-2xl border rounded-lg shadow-sm cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenScreenshot(result.screenshot)} title="Click to view fullscreen" />
                      </div>}
                    </div>
                  </div>
                </CardContent>
              </Card>)}
            </div> : <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
              <p>No detailed logs available for this execution</p>
            </div>}
          </ScrollArea>
        </div>}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowLogsDialog(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Add Step Dialog */}
    <Dialog open={showStepDialog} onOpenChange={open => {
      setShowStepDialog(open);
      if (!open) {
        resetStepForm();
        setInsertStepAtIndex(null);
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{editCreateStepIndex !== null ? "Edit Test Step" : "Add Test Step"}</DialogTitle>
          <DialogDescription>
            {editCreateStepIndex !== null ? "Modify the step configuration" : "Select an action category and configure the step"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Category Selection */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Action Category</Label>
            <div className="flex flex-wrap gap-1">
              {ACTION_CATEGORIES.map(cat => <Button key={cat.id} variant={selectedActionCategory === cat.id ? "default" : "outline"} size="sm" onClick={() => {
                setSelectedActionCategory(cat.id);
                const actions = getActionsByCategory(cat.id);
                if (actions.length > 0) setStepType(actions[0].type);
              }} className="text-xs h-7">
                <span className="mr-1">{cat.icon}</span>
                {cat.label}
              </Button>)}
            </div>
          </div>

          {/* Action Selection */}
          <div>
            <Label htmlFor="stepType">Action Type</Label>
            <Select value={stepType} onValueChange={(value: any) => {
              setStepType(value);
              setStepExtraData({});
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {getActionsByCategory(selectedActionCategory).map(action => <SelectItem key={action.type} value={action.type}>
                  <span className="flex items-center gap-2">
                    <span>{action.icon}</span>
                    <span>{action.label}</span>
                  </span>
                </SelectItem>)}
              </SelectContent>
            </Select>
            {getActionDefinition(stepType)?.description && <p className="text-xs text-muted-foreground mt-1">{getActionDefinition(stepType)?.description}</p>}
          </div>

          {/* Dynamic Fields based on Action */}
          <ScrollArea className="flex-1 pr-4 overflow-auto">
            <div className="space-y-4">
              {/* Selector Field */}
              {getActionDefinition(stepType)?.requiresSelector && <div>
                <Label htmlFor="stepSelector">Element Selector *</Label>
                <Input id="stepSelector" value={stepSelector} onChange={e => setStepSelector(e.target.value)} placeholder="e.g., #username, .submit-button, [data-testid='login']" className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground mt-1">CSS selector, XPath, or Playwright locator</p>
              </div>}

              {/* Value Field */}
              {getActionDefinition(stepType)?.requiresValue && <div>
                <Label htmlFor="stepValue">{getActionDefinition(stepType)?.valueLabel || "Value"} *</Label>
                <Input id="stepValue" value={stepValue} onChange={e => setStepValue(e.target.value)} placeholder={getActionDefinition(stepType)?.valuePlaceholder || "Enter value..."} />
              </div>}

              {/* Extra Fields */}
              {getActionDefinition(stepType)?.extraFields?.map(field => <div key={field.name}>
                <Label htmlFor={`extra-${field.name}`}>
                  {field.label} {field.required && "*"}
                </Label>
                {field.type === "select" ? <Select value={stepExtraData[field.name] || ""} onValueChange={v => setStepExtraData({
                  ...stepExtraData,
                  [field.name]: v
                })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map(opt => <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>)}
                  </SelectContent>
                </Select> : <Input id={`extra-${field.name}`} type={field.type === "number" ? "number" : "text"} value={stepExtraData[field.name] || ""} onChange={e => setStepExtraData({
                  ...stepExtraData,
                  [field.name]: e.target.value
                })} placeholder={field.placeholder} />}
              </div>)}

              {/* Description Field */}
              <div>
                <Label htmlFor="stepDescription">Description *</Label>
                <Input id="stepDescription" value={stepDescription} onChange={e => setStepDescription(e.target.value)} placeholder="Describe what this step does" />
              </div>

              {/* Skip Step Checkbox */}
              <div className="flex items-center space-x-2">
                <Checkbox id="stepSkip" checked={stepSkip} onCheckedChange={checked => setStepSkip(checked === true)} />
                <Label htmlFor="stepSkip" className="text-sm font-normal cursor-pointer">
                  Skip this step during execution
                </Label>
              </div>
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => {
            setShowStepDialog(false);
            resetStepForm();
          }}>
            Cancel
          </Button>
          <Button onClick={handleAddStep}>
            {editCreateStepIndex !== null ? "Update Step" : "Add Step"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Edit Test Dialog */}
    <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Test</DialogTitle>
          <DialogDescription>Modify test details and automation steps</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="editTestName">Test Name *</Label>
            <Input id="editTestName" value={editTestName} onChange={e => setEditTestName(e.target.value)} placeholder="e.g., Login Flow Test" />
          </div>
          <div>
            <Label htmlFor="editTestDescription">Description</Label>
            <Textarea id="editTestDescription" value={editTestDescription} onChange={e => setEditTestDescription(e.target.value)} placeholder="Describe what this test does" />
          </div>
          <div>
            <Label htmlFor="editBaseUrl">Base URL *</Label>
            <Input id="editBaseUrl" value={editBaseUrl} onChange={e => setEditBaseUrl(e.target.value)} placeholder="https://example.com" />
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <Label>Test Steps</Label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  setImportStepsTarget("edit");
                  setImportFromTestId("");
                  setShowImportStepsDialog(true);
                }}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Steps
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowEditStepDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Step
                </Button>
              </div>
            </div>
            {editTestSteps.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No steps added yet</p> : <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {editTestSteps.map((step, index) => <Card key={step.id} className={cn("border-l-4 border-l-primary/50", step.skip && "opacity-60")}>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-semibold text-xs">
                            {index + 1}
                          </div>
                          <span className="text-lg">{getStepIcon(step.type)}</span>
                          {step.skip && <Badge variant="secondary" className="text-xs">Skipped</Badge>}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => moveEditStep(index, "up")} disabled={index === 0}>
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => moveEditStep(index, "down")} disabled={index === editTestSteps.length - 1}>
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => {
                            setInsertEditStepAtIndex(index);
                            setShowEditStepDialog(true);
                          }} title="Insert step below">
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleRemoveEditStep(step.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Action Type</Label>
                          <Select value={step.type} onValueChange={value => updateEditTestStep(index, "type", value)}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[200px]">
                              {ACTIONS.map(action => <SelectItem key={action.type} value={action.type}>
                                <span className="flex items-center gap-2">
                                  <span>{action.icon}</span>
                                  <span>{action.label}</span>
                                </span>
                              </SelectItem>)}
                            </SelectContent>
                          </Select>
                          {getActionDefinition(step.type)?.description && <p className="text-xs text-muted-foreground mt-1">{getActionDefinition(step.type)?.description}</p>}
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Description</Label>
                          <Input value={step.description} onChange={e => updateEditTestStep(index, "description", e.target.value)} className="h-9" />
                        </div>
                      </div>

                      {/* Selector Field - based on action definition */}
                      {getActionDefinition(step.type)?.requiresSelector && <div>
                        <Label className="text-xs text-muted-foreground">Element Selector *</Label>
                        <Input value={step.selector || ""} onChange={e => updateEditTestStep(index, "selector", e.target.value)} placeholder="e.g., #username, .btn-primary, [data-testid='login']" className="font-mono text-xs h-9" />
                      </div>}

                      {/* Value Field - based on action definition */}
                      {getActionDefinition(step.type)?.requiresValue && <div>
                        <Label className="text-xs text-muted-foreground">
                          {getActionDefinition(step.type)?.valueLabel || "Value"} *
                        </Label>
                        <Input value={step.value || ""} onChange={e => updateEditTestStep(index, "value", e.target.value)} placeholder={getActionDefinition(step.type)?.valuePlaceholder || "Enter value"} className="h-9" />
                      </div>}

                      {/* Extra Fields - based on action definition */}
                      {getActionDefinition(step.type)?.extraFields?.map(field => <div key={field.name}>
                        <Label className="text-xs text-muted-foreground">
                          {field.label} {field.required && "*"}
                        </Label>
                        {field.type === "select" ? <Select value={step.extraData?.[field.name] || ""} onValueChange={v => updateEditTestStep(index, "extraData", {
                          ...step.extraData,
                          [field.name]: v
                        })}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map(opt => <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>)}
                          </SelectContent>
                        </Select> : <Input type={field.type === "number" ? "number" : "text"} value={step.extraData?.[field.name] || ""} onChange={e => updateEditTestStep(index, "extraData", {
                          ...step.extraData,
                          [field.name]: e.target.value
                        })} placeholder={field.placeholder} className="h-9" />}
                      </div>)}

                      {/* Skip Step Checkbox */}
                      <div className="flex items-center space-x-2 pt-2 border-t">
                        <Checkbox id={`skip-edit-${step.id}`} checked={step.skip || false} onCheckedChange={checked => updateEditTestStep(index, "skip", checked === true)} />
                        <Label htmlFor={`skip-edit-${step.id}`} className="text-sm font-normal cursor-pointer">
                          Skip this step during execution
                        </Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>)}
              </div>
            </ScrollArea>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowEditDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpdateTest}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Add Edit Step Dialog */}
    <Dialog open={showEditStepDialog} onOpenChange={open => {
      setShowEditStepDialog(open);
      if (!open) {
        resetStepForm();
        setInsertEditStepAtIndex(null);
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Test Step</DialogTitle>
          <DialogDescription>Select an action category and configure the step</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Category Selection */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Action Category</Label>
            <div className="flex flex-wrap gap-1">
              {ACTION_CATEGORIES.map(cat => <Button key={cat.id} variant={selectedActionCategory === cat.id ? "default" : "outline"} size="sm" onClick={() => {
                setSelectedActionCategory(cat.id);
                const actions = getActionsByCategory(cat.id);
                if (actions.length > 0) setStepType(actions[0].type);
              }} className="text-xs h-7">
                <span className="mr-1">{cat.icon}</span>
                {cat.label}
              </Button>)}
            </div>
          </div>

          {/* Action Selection */}
          <div>
            <Label>Action Type</Label>
            <Select value={stepType} onValueChange={(value: any) => {
              setStepType(value);
              setStepExtraData({});
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {getActionsByCategory(selectedActionCategory).map(action => <SelectItem key={action.type} value={action.type}>
                  <span className="flex items-center gap-2">
                    <span>{action.icon}</span>
                    <span>{action.label}</span>
                  </span>
                </SelectItem>)}
              </SelectContent>
            </Select>
            {getActionDefinition(stepType)?.description && <p className="text-xs text-muted-foreground mt-1">{getActionDefinition(stepType)?.description}</p>}
          </div>

          {/* Dynamic Fields based on Action */}
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {/* Selector Field */}
              {getActionDefinition(stepType)?.requiresSelector && <div>
                <Label>Element Selector *</Label>
                <Input value={stepSelector} onChange={e => setStepSelector(e.target.value)} placeholder="e.g., #username, .submit-button, [data-testid='login']" className="font-mono text-sm" />
              </div>}

              {/* Value Field */}
              {getActionDefinition(stepType)?.requiresValue && <div>
                <Label>{getActionDefinition(stepType)?.valueLabel || "Value"} *</Label>
                <Input value={stepValue} onChange={e => setStepValue(e.target.value)} placeholder={getActionDefinition(stepType)?.valuePlaceholder || "Enter value..."} />
              </div>}

              {/* Extra Fields */}
              {getActionDefinition(stepType)?.extraFields?.map(field => <div key={field.name}>
                <Label>
                  {field.label} {field.required && "*"}
                </Label>
                {field.type === "select" ? <Select value={stepExtraData[field.name] || ""} onValueChange={v => setStepExtraData({
                  ...stepExtraData,
                  [field.name]: v
                })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map(opt => <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>)}
                  </SelectContent>
                </Select> : <Input type={field.type === "number" ? "number" : "text"} value={stepExtraData[field.name] || ""} onChange={e => setStepExtraData({
                  ...stepExtraData,
                  [field.name]: e.target.value
                })} placeholder={field.placeholder} />}
              </div>)}

              {/* Description Field */}
              <div>
                <Label>Description *</Label>
                <Input value={stepDescription} onChange={e => setStepDescription(e.target.value)} placeholder="Describe what this step does" />
              </div>

              {/* Skip Step Checkbox */}
              <div className="flex items-center space-x-2">
                <Checkbox id="editStepSkip" checked={stepSkip} onCheckedChange={checked => setStepSkip(checked === true)} />
                <Label htmlFor="editStepSkip" className="text-sm font-normal cursor-pointer">
                  Skip this step during execution
                </Label>
              </div>
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => {
            setShowEditStepDialog(false);
            resetStepForm();
          }}>
            Cancel
          </Button>
          <Button onClick={handleAddEditStep}>Add Step</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Create Suite Dialog */}
    <Dialog open={showCreateSuiteDialog} onOpenChange={setShowCreateSuiteDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Test Suite</DialogTitle>
          <DialogDescription>Create a group of tests to run together</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="suiteName">Suite Name *</Label>
            <Input id="suiteName" value={suiteName} onChange={e => setSuiteName(e.target.value)} placeholder="e.g., Smoke Tests, Regression Suite" />
          </div>
          <div>
            <Label htmlFor="suiteDescription">Description</Label>
            <Textarea id="suiteDescription" value={suiteDescription} onChange={e => setSuiteDescription(e.target.value)} placeholder="Describe the purpose of this test suite" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setShowCreateSuiteDialog(false);
            setSuiteName("");
            setSuiteDescription("");
          }}>
            Cancel
          </Button>
          <Button onClick={handleCreateSuite}>Create Suite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Add Tests to Suite Dialog */}
    <Dialog open={showAddTestsToSuiteDialog} onOpenChange={setShowAddTestsToSuiteDialog}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Tests to Suite</DialogTitle>
          <DialogDescription>Select tests to add to "{selectedSuite?.name}"</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {tests.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">
            No tests available. Create some tests first.
          </p> : <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {tests.filter(test => !suiteTests.some(st => st.test_id === test.id)).map(test => {
                const isSelected = selectedTestsForSuite.has(test.id);
                return <Card key={test.id} className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"}`} onClick={() => {
                  setSelectedTestsForSuite(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(test.id)) {
                      newSet.delete(test.id);
                    } else {
                      newSet.add(test.id);
                    }
                    return newSet;
                  });
                }}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Checkbox checked={isSelected} onCheckedChange={() => { }} className="pointer-events-none" />
                      <div className="flex-1">
                        <h4 className="font-medium">{test.name}</h4>
                        {test.description && <p className="text-sm text-muted-foreground">{test.description}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          {(Array.isArray(test.steps) ? test.steps : []).length} steps
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>;
              })}
            </div>
          </ScrollArea>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setShowAddTestsToSuiteDialog(false);
            setSelectedTestsForSuite(new Set());
          }}>
            Cancel
          </Button>
          <Button onClick={handleAddTestsToSuite} disabled={selectedTestsForSuite.size === 0}>
            Add {selectedTestsForSuite.size} Test{selectedTestsForSuite.size !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Suite Execution Logs Dialog */}
    <Dialog open={showSuiteLogsDialog} onOpenChange={setShowSuiteLogsDialog}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Suite Execution Logs</DialogTitle>
          <DialogDescription>
            Test results for this suite execution
            {selectedSuiteExecution && ` - ${new Date(selectedSuiteExecution.started_at).toLocaleString()}`}
          </DialogDescription>
        </DialogHeader>

        {selectedSuiteExecution && <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Summary */}
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg mb-4 flex-shrink-0">
            <div className="flex items-center gap-2">
              {getStatusIcon(selectedSuiteExecution.status)}
              <span className="font-medium capitalize">{selectedSuiteExecution.status}</span>
            </div>
            <div className="flex gap-4 ml-auto">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{selectedSuiteExecution.passed_tests}</p>
                <p className="text-xs text-muted-foreground">Passed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{selectedSuiteExecution.failed_tests}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{selectedSuiteExecution.total_tests}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </div>

          {/* Test Results */}
          <Label className="text-sm font-semibold mb-2 flex-shrink-0">Test Results</Label>
          <ScrollArea className="flex-1 min-h-0 h-[400px] overflow-auto">
            <div className="space-y-2 pr-4">
              {selectedSuiteExecution.results && Array.isArray(selectedSuiteExecution.results) ? selectedSuiteExecution.results.map((result: any, index: number) => {
                const isExpanded = expandedTestResults.has(result.execution_id || result.test_id);
                const stepResults = result.execution_id ? testStepResults[result.execution_id] : null;
                return <Card key={result.test_id || index} className={`border-l-4 ${result.status === "passed" ? "border-l-green-500" : "border-l-red-500"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleTestExpansion(result)}>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-semibold">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{result.test_name || "Unknown Test"}</p>
                          {result.error && <p className="text-sm text-red-500 mt-1">{result.error}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={result.status === "passed" ? "default" : "destructive"}>
                          {result.status}
                        </Badge>
                        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </div>

                    {/* Expanded Step Results */}
                    {isExpanded && <div className="mt-4 pt-4 border-t">
                      <ScrollArea className="max-h-[300px] overflow-auto">
                        <div className="space-y-3 pr-4">
                          {stepResults ? stepResults.length > 0 ? stepResults.map((step: any, stepIndex: number) => <div key={step.stepId || stepIndex} className="space-y-2">
                            <div className={`p-3 rounded-lg ${step.status === "passed" ? "bg-green-50 dark:bg-green-950/30" : step.status === "failed" ? "bg-red-50 dark:bg-red-950/30" : "bg-muted"}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    Step {stepIndex + 1}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {step.step?.type || "unknown"}
                                  </Badge>
                                  {getStatusIcon(step.status)}
                                </div>
                                <span className="text-xs text-muted-foreground">{step.duration}ms</span>
                              </div>
                              <p className="text-sm mt-1">
                                {step.step?.description || "No description"}
                              </p>
                              {step.step?.selector && <p className="text-xs text-muted-foreground mt-1 font-mono">
                                Selector: {step.step.selector}
                              </p>}
                              {step.error && <div className="mt-2">
                                <p className="text-xs text-red-500 font-semibold mb-1">Error Log:</p>
                                <pre className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto font-mono border border-red-200 dark:border-red-900">
                                  {step.error}
                                </pre>
                              </div>}
                            </div>

                            {/* Screenshot */}
                            {step.screenshot && <div className="rounded-lg overflow-hidden border">
                              <img src={step.screenshot} alt={`Step ${stepIndex + 1} screenshot`} className="w-full h-auto max-h-64 object-contain bg-muted cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenScreenshot(step.screenshot)} title="Click to view fullscreen" />
                            </div>}
                          </div>) : <p className="text-sm text-muted-foreground text-center py-4">
                            No step results available
                          </p> : <div className="flex justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>}
                        </div>
                      </ScrollArea>
                    </div>}
                  </CardContent>
                </Card>;
              }) : <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                <p>No detailed results available for this execution</p>
              </div>}
            </div>
          </ScrollArea>

          {/* Timing Info */}
          {selectedSuiteExecution.completed_at && <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
            <p>Started: {new Date(selectedSuiteExecution.started_at).toLocaleString()}</p>
            <p>Completed: {new Date(selectedSuiteExecution.completed_at).toLocaleString()}</p>
          </div>}
        </div>}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowSuiteLogsDialog(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Fullscreen Screenshot Dialog */}
    <Dialog open={!!fullscreenScreenshot} onOpenChange={() => setFullscreenScreenshot(null)}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>Screenshot</DialogTitle>
        </DialogHeader>
        <div className="p-4 pt-2 overflow-auto max-h-[calc(95vh-100px)]">
          {fullscreenScreenshot && <img src={fullscreenScreenshot} alt="Fullscreen screenshot" className="w-full h-auto object-contain" />}
        </div>
        <DialogFooter className="p-4 pt-0">
          <Button variant="outline" onClick={() => setFullscreenScreenshot(null)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Create Folder Dialog */}
    <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
          <DialogDescription>Create a folder to organize your automated tests</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="folder-name">Folder Name</Label>
            <Input id="folder-name" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="e.g., Login Tests, Checkout Flow" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setShowCreateFolderDialog(false);
            setNewFolderName("");
          }}>
            Cancel
          </Button>
          <Button onClick={handleCreateFolder}>Create Folder</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Bulk Move Dialog */}
    <Dialog open={showBulkMoveDialog} onOpenChange={setShowBulkMoveDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {bulkSelectedTests.size} Test(s)</DialogTitle>
          <DialogDescription>Select a destination folder for the selected tests</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Destination Folder</Label>
            <Select value={bulkMoveTargetFolderId || "root"} onValueChange={v => setBulkMoveTargetFolderId(v === "root" ? null : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4" />
                    Root level (no folder)
                  </div>
                </SelectItem>
                {folders.map(folder => <SelectItem key={folder.id} value={folder.id}>
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4" />
                    {folder.name}
                  </div>
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setShowBulkMoveDialog(false);
            setBulkMoveTargetFolderId(null);
          }}>
            Cancel
          </Button>
          <Button onClick={handleBulkMoveTests}>Move Tests</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Auto-Heal Results Dialog */}
    <Dialog open={showAutoHealDialog} onOpenChange={setShowAutoHealDialog}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Auto-Heal Results
          </DialogTitle>
          <DialogDescription>Review the proposed fixes before applying them to your test</DialogDescription>
        </DialogHeader>

        {autoHealResult && <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Analysis Summary */}
          <Alert className="bg-primary/5 border-primary/20">
            <Wand2 className="h-4 w-4" />
            <AlertTitle>Analysis</AlertTitle>
            <AlertDescription className="text-sm">{autoHealResult.analysis}</AlertDescription>
          </Alert>

          {/* Fixes List */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Proposed Fixes ({autoHealResult.fixes.length})</Label>
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-2">
                {autoHealResult.fixes.map((fix, index) => <Card key={index} className="border-l-4 border-l-primary">
                  <CardContent className="p-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Step {fix.stepIndex + 1}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-destructive">Issue:</span> {fix.issue}
                      </p>
                      <p className="text-sm">
                        <span className="font-medium text-primary">Fix:</span> {fix.fix}
                      </p>
                    </div>
                  </CardContent>
                </Card>)}
              </div>
            </ScrollArea>
          </div>

          {/* Preview Fixed Steps */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Updated Test Steps Preview</Label>
            <ScrollArea className="h-[150px] pr-4 border rounded-lg p-2 bg-muted/30">
              <div className="space-y-1">
                {autoHealResult.fixedSteps.map((step, index) => <div key={step.id || index} className="flex items-center gap-2 text-xs p-2 hover:bg-muted/50 rounded">
                  <span className="font-semibold text-muted-foreground w-6">{index + 1}.</span>
                  <Badge variant="outline" className="text-xs font-mono">
                    {step.type}
                  </Badge>
                  <span className="truncate flex-1">{step.description}</span>
                  {step.selector && <code className="text-xs bg-muted px-1 rounded truncate max-w-[200px]">{step.selector}</code>}
                </div>)}
              </div>
            </ScrollArea>
          </div>
        </div>}

        <DialogFooter className="flex gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => {
            setShowAutoHealDialog(false);
            setAutoHealResult(null);
          }}>
            Cancel
          </Button>
          <Button onClick={handleApplyAutoHealFix} disabled={isApplyingFix} className="gap-2">
            {isApplyingFix ? <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Applying...
            </> : <>
              <Check className="h-4 w-4" />
              Apply Fixes
            </>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Visual Comparison Dialog */}
    <Dialog open={showVisualComparisonDialog} onOpenChange={setShowVisualComparisonDialog}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Visual Regression Comparison</DialogTitle>
          <DialogDescription>
            {visualComparisonData?.stepName} - {visualComparisonData?.mismatchPercentage}% difference (threshold:{" "}
            {visualComparisonData?.threshold}%)
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-2 gap-4">
            {/* Baseline */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Image className="h-4 w-4" />
                Baseline
              </Label>
              {visualComparisonData?.baseline ? <img src={visualComparisonData.baseline} alt="Baseline screenshot" className="w-full border rounded-lg shadow-sm cursor-pointer" onClick={() => setFullscreenScreenshot(visualComparisonData?.baseline || null)} /> : <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                No baseline available
              </div>}
            </div>

            {/* Current */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Current
              </Label>
              {visualComparisonData?.current ? <img src={visualComparisonData.current} alt="Current screenshot" className="w-full border rounded-lg shadow-sm cursor-pointer" onClick={() => setFullscreenScreenshot(visualComparisonData?.current || null)} /> : <div className="h-48 bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                No current screenshot
              </div>}
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => setShowVisualComparisonDialog(false)}>
            Close
          </Button>
          {visualComparisonData && <Button onClick={() => {
            if (visualComparisonData.current && visualComparisonData.stepId) {
              handleSaveBaseline(visualComparisonData.stepId, visualComparisonData.stepName, visualComparisonData.current);
              setShowVisualComparisonDialog(false);
            }
          }} disabled={isSavingBaseline} className="gap-2">
            {isSavingBaseline ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Update Baseline
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Record Test Dialog */}
    <Dialog open={showRecordDialog} onOpenChange={open => {
      if (!open && isRecording) {
        handleStopRecording();
      }
      if (!open) {
        setRecordingUrl("");
        setRecordingTestName("");
        setRecordingTestDescription("");
        setRecordedSteps([]);
      }
      setShowRecordDialog(open);
    }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Record Test Script
          </DialogTitle>
          <DialogDescription>
            Record your browser interactions to automatically generate test steps
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {!isRecording && !showExtensionInstructions && recordedSteps.length === 0 && <>
            {/* URL Input */}
            <div>
              <Label>Starting URL *</Label>
              <Input value={recordingUrl} onChange={e => setRecordingUrl(e.target.value)} placeholder="https://example.com" />
              <p className="text-xs text-muted-foreground mt-1">
                Enter the URL where you want to start recording
              </p>
            </div>

            {/* Folder Selection */}
            <div>
              <Label>Save to Folder (Optional)</Label>
              <Select value={selectedFolderId || "none"} onValueChange={v => setSelectedFolderId(v === "none" ? null : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No folder (root level)</SelectItem>
                  {folders.map(folder => <SelectItem key={folder.id} value={folder.id}>
                    <div className="flex items-center gap-2">
                      <Folder className="h-4 w-4" />
                      {folder.name}
                    </div>
                  </SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>How Recording Works</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                  <li>Download and install the browser extension (one-time setup)</li>
                  <li>The target page will open in a new tab</li>
                  <li>Click the extension icon to start recording</li>
                  <li>Interact with the page - all actions will be captured</li>
                  <li>Return here to import and save your recorded steps</li>
                </ul>
              </AlertDescription>
            </Alert>
          </>}

          {/* Extension Instructions */}
          {showExtensionInstructions && <div className="space-y-4">
            <Alert className="border-primary bg-primary/5">
              <Video className="h-4 w-4 text-primary" />
              <AlertTitle>Browser Extension Recording</AlertTitle>
              <AlertDescription className="space-y-3">
                <p className="text-sm">Follow these steps to record your test:</p>
                <ol className="list-decimal list-inside text-sm space-y-2">
                  <li>
                    <strong>Install the browser extension (first time only):</strong>
                    <div className="mt-2 mb-2">
                      <Button onClick={handleDownloadExtension} disabled={isDownloadingExtension} size="sm" className="gap-2">
                        {isDownloadingExtension ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Download Extension
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1 bg-muted/50 p-2 rounded mt-2">
                      <p><strong>Installation:</strong></p>
                      <ol className="list-decimal list-inside ml-2 space-y-0.5">
                        <li>Extract the downloaded ZIP file</li>
                        <li>Open Chrome/Edge → Extensions (chrome://extensions)</li>
                        <li>Enable "Developer mode" (toggle in top right)</li>
                        <li>Click "Load unpacked" and select the extracted folder</li>
                      </ol>
                    </div>
                  </li>
                  <li>Go to the tab that opened with your target URL</li>
                  <li>Click the Wispr extension icon in your browser toolbar</li>
                  <li>Click "Start Recording" in the popup</li>
                  <li>Interact with the page - all actions will be captured</li>
                  <li>
                    <div className="flex items-center gap-2">
                      <span>Press</span>
                      <Badge variant="outline" className="font-mono text-xs">Ctrl+Space</Badge>
                      <span>to pause/resume,</span>
                      <Badge variant="outline" className="font-mono text-xs">ESC</Badge>
                      <span>or click "Stop" when done</span>
                    </div>
                  </li>
                  <li>The recorded data will be copied to your clipboard</li>
                  <li>Return here and paste the data below, then click "Import"</li>
                </ol>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Paste Recorded Data *</Label>
              <Textarea value={recordingPasteData} onChange={e => setRecordingPasteData(e.target.value)} placeholder='Paste the copied recording data here (e.g., [{"type":"click","selector":"#btn",...}])' className="font-mono text-xs min-h-[100px]" />
              <p className="text-xs text-muted-foreground">
                After stopping the recording, the data is automatically copied. Just paste it here (Ctrl+V / Cmd+V).
              </p>
            </div>

            <div className="flex items-center justify-center gap-4 p-4 border rounded-lg bg-muted/30">
              <div className="text-center">
                <p className="text-sm font-medium mb-2">Recording for:</p>
                <code className="text-xs bg-muted px-2 py-1 rounded break-all">{recordingUrl}</code>
              </div>
            </div>

            {/* Manual step entry option */}
            <div className="border-t pt-4">
              <Button variant="outline" size="sm" onClick={() => setManualStepMode(!manualStepMode)} className="w-full">
                {manualStepMode ? "Hide Manual Entry" : "Or Add Steps Manually"}
              </Button>

              {manualStepMode && <div className="mt-4 space-y-3 p-4 border rounded-lg bg-muted/20">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Action Type</Label>
                    <Select value={manualStepType} onValueChange={v => setManualStepType(v as TestStep["type"])}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="click">Click</SelectItem>
                        <SelectItem value="type">Type</SelectItem>
                        <SelectItem value="navigate">Navigate</SelectItem>
                        <SelectItem value="selectOption">Select Option</SelectItem>
                        <SelectItem value="wait">Wait</SelectItem>
                        <SelectItem value="assertVisible">Assert Visible</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Selector</Label>
                    <Input value={manualStepSelector} onChange={e => setManualStepSelector(e.target.value)} placeholder="#element-id" className="h-8 text-sm" />
                  </div>
                </div>
                {(manualStepType === "type" || manualStepType === "navigate" || manualStepType === "selectOption") && <div>
                  <Label className="text-xs">Value</Label>
                  <Input value={manualStepValue} onChange={e => setManualStepValue(e.target.value)} placeholder={manualStepType === "navigate" ? "https://..." : "Enter value"} className="h-8 text-sm" />
                </div>}
                <div>
                  <Label className="text-xs">Description *</Label>
                  <Input value={manualStepDescription} onChange={e => setManualStepDescription(e.target.value)} placeholder="Click on login button" className="h-8 text-sm" />
                </div>
                <Button size="sm" onClick={handleAddManualStep} className="w-full">
                  <Plus className="mr-2 h-3 w-3" />
                  Add Step
                </Button>
              </div>}
            </div>
          </div>}

          {recordedSteps.length > 0 && <>
            {/* Test Details */}
            {!showExtensionInstructions && <div className="space-y-4">
              <div>
                <Label>Test Name *</Label>
                <Input value={recordingTestName} onChange={e => setRecordingTestName(e.target.value)} placeholder="e.g., Login Flow Test" />
              </div>
              <div>
                <Label>Description (Optional)</Label>
                <Textarea value={recordingTestDescription} onChange={e => setRecordingTestDescription(e.target.value)} placeholder="Describe what this test validates..." className="min-h-[60px]" />
              </div>
            </div>}

            {/* Recorded Steps */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <Label>Steps ({recordedSteps.length})</Label>
                {recordedSteps.length > 0 && <Button size="sm" variant="outline" onClick={() => setRecordedSteps([])}>
                  <Trash2 className="mr-2 h-3 w-3" />
                  Clear All
                </Button>}
              </div>
              <ScrollArea className="h-[200px] border rounded-lg p-3">
                <div className="space-y-2">
                  {recordedSteps.map((step, index) => <Card key={step.id} className="border-l-4 border-l-primary/50">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-muted-foreground w-6">
                            {index + 1}.
                          </span>
                          <Badge variant="outline">{step.type}</Badge>
                          <span className="text-sm truncate max-w-[250px]">
                            {step.description}
                          </span>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleRemoveRecordedStep(step.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {step.selector && <p className="text-xs text-muted-foreground mt-1 ml-9 font-mono">
                        {step.selector}
                      </p>}
                    </CardContent>
                  </Card>)}
                </div>
              </ScrollArea>
            </div>
          </>}
        </div>

        <DialogFooter className="gap-2">
          {!isRecording && !showExtensionInstructions && recordedSteps.length === 0 && <>
            <Button variant="outline" onClick={() => setShowRecordDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartRecording} disabled={!recordingUrl.trim()}>
              <Video className="mr-2 h-4 w-4" />
              Start Recording
            </Button>
          </>}

          {showExtensionInstructions && <>
            <Button variant="outline" onClick={() => {
              setShowExtensionInstructions(false);
              setRecordedSteps([]);
              setIsRecording(false);
              setRecordingPasteData("");
            }}>
              Cancel
            </Button>
            <Button onClick={handleImportRecordedSteps} disabled={!recordingPasteData.trim()}>
              <Download className="mr-2 h-4 w-4" />
              Import Recorded Steps
            </Button>
          </>}

          {!showExtensionInstructions && recordedSteps.length > 0 && <>
            <Button variant="outline" onClick={() => {
              setRecordedSteps([]);
              setRecordingTestName("");
              setRecordingTestDescription("");
            }}>
              Start Over
            </Button>
            <Button onClick={handleSaveRecordedTest} disabled={!recordingTestName.trim()}>
              <Check className="mr-2 h-4 w-4" />
              Save Test
            </Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Delete Test Confirmation Dialog */}
    <AlertDialog open={!!testToDelete} onOpenChange={open => !open && setTestToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Test</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this test? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            if (testToDelete) {
              handleDeleteTest(testToDelete);
              setTestToDelete(null);
            }
          }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Delete Folder Confirmation Dialog */}
    <AlertDialog open={!!folderToDelete} onOpenChange={open => !open && setFolderToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Folder</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this folder? Tests in this folder will be moved to the root level.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            if (folderToDelete) {
              handleDeleteFolder(folderToDelete);
              setFolderToDelete(null);
            }
          }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Import Steps Dialog */}
    <Dialog open={showImportStepsDialog} onOpenChange={open => {
      setShowImportStepsDialog(open);
      if (!open) {
        setImportFromTestId("");
        setSelectedImportStepIds(new Set());
      }
    }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Test Steps</DialogTitle>
          <DialogDescription>
            Select an existing test and choose which steps to import.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Select Test</Label>
            <Select value={importFromTestId} onValueChange={value => {
              setImportFromTestId(value);
              // Auto-select all steps when test is selected
              const test = tests.find(t => t.id === value);
              if (test && Array.isArray(test.steps)) {
                setSelectedImportStepIds(new Set(test.steps.map((s: any, i: number) => s.id || `step-${i}`)));
              } else {
                setSelectedImportStepIds(new Set());
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a test to import steps from" />
              </SelectTrigger>
              <SelectContent>
                {tests.filter(t => importStepsTarget === "edit" ? t.id !== selectedTest?.id : true).map(test => <SelectItem key={test.id} value={test.id}>
                  {test.name} ({Array.isArray(test.steps) ? test.steps.length : 0} steps)
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {importFromTestId && <div className="border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Steps Preview</Label>
              {(() => {
                const selectedImportTest = tests.find(t => t.id === importFromTestId);
                const steps = selectedImportTest?.steps;
                if (!Array.isArray(steps) || steps.length === 0) return null;
                const allSelected = steps.every((s: any, i: number) => selectedImportStepIds.has(s.id || `step-${i}`));
                return <Button variant="ghost" size="sm" onClick={() => {
                  if (allSelected) {
                    setSelectedImportStepIds(new Set());
                  } else {
                    setSelectedImportStepIds(new Set(steps.map((s: any, i: number) => s.id || `step-${i}`)));
                  }
                }}>
                  {allSelected ? "Deselect All" : "Select All"}
                </Button>;
              })()}
            </div>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {(() => {
                  const selectedImportTest = tests.find(t => t.id === importFromTestId);
                  const steps = selectedImportTest?.steps;
                  if (!Array.isArray(steps) || steps.length === 0) {
                    return <p className="text-sm text-muted-foreground">No steps in this test</p>;
                  }
                  return steps.map((step: any, index: number) => {
                    const stepId = step.id || `step-${index}`;
                    const isSelected = selectedImportStepIds.has(stepId);
                    return <div key={stepId} className={cn("flex items-center gap-2 text-sm p-2 bg-background rounded border cursor-pointer transition-colors", isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50")} onClick={() => {
                      const newSet = new Set(selectedImportStepIds);
                      if (isSelected) {
                        newSet.delete(stepId);
                      } else {
                        newSet.add(stepId);
                      }
                      setSelectedImportStepIds(newSet);
                    }}>
                      <Checkbox checked={isSelected} onCheckedChange={checked => {
                        const newSet = new Set(selectedImportStepIds);
                        if (checked) {
                          newSet.add(stepId);
                        } else {
                          newSet.delete(stepId);
                        }
                        setSelectedImportStepIds(newSet);
                      }} onClick={e => e.stopPropagation()} />
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary font-medium text-xs">
                        {index + 1}
                      </span>
                      <Badge variant="outline" className="text-xs">{step.type}</Badge>
                      <span className="text-muted-foreground truncate flex-1">{step.description}</span>
                    </div>;
                  });
                })()}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground mt-2">
              {selectedImportStepIds.size} step{selectedImportStepIds.size !== 1 ? 's' : ''} selected
            </p>
          </div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowImportStepsDialog(false)}>
            Cancel
          </Button>
          <Button disabled={!importFromTestId || selectedImportStepIds.size === 0} onClick={() => {
            const selectedImportTest = tests.find(t => t.id === importFromTestId);
            const steps = selectedImportTest?.steps;
            if (!Array.isArray(steps) || steps.length === 0) {
              toast({
                title: "No Steps",
                description: "The selected test has no steps to import",
                variant: "destructive"
              });
              return;
            }
            const importedSteps: TestStep[] = steps.filter((step: any, index: number) => selectedImportStepIds.has(step.id || `step-${index}`)).map((step: any, index: number) => ({
              id: `imported-step-${Date.now()}-${index}`,
              type: step.type || "click",
              selector: step.selector || "",
              value: step.value || "",
              description: step.description || `Step ${index + 1}`,
              extraData: step.extraData,
              skip: step.skip || false
            }));
            if (importStepsTarget === "create") {
              setCurrentSteps([...currentSteps, ...importedSteps]);
            } else {
              setEditTestSteps([...editTestSteps, ...importedSteps]);
            }
            toast({
              title: "Steps Imported",
              description: `Successfully imported ${importedSteps.length} steps from "${selectedImportTest?.name}"`
            });
            setShowImportStepsDialog(false);
            setImportFromTestId("");
            setSelectedImportStepIds(new Set());
          }}>
            Import Steps
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
};