import { useState, useEffect, Fragment, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { publicProjectIds } from "@/config/features";
import { Play, Plus, Trash2, Clock, CheckCircle, XCircle, AlertCircle, Search, MoreHorizontal, ArrowLeft, MinusCircle, SkipForward, GitCompare, History, Copy, Pencil, ChevronDown, ChevronRight, ListChecks, Camera, MessageSquare, Image } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { TestRunComparison } from "@/components/TestRunComparison";

interface TestRun {
  id: string;
  name: string;
  runType: string;
  status: string;
  description: string;
  createdBy: string;
  createdAt: string;
  testCaseCount: number;
  passedCount: number;
  failedCount: number;
  blockedCount: number;
  skippedCount: number;
}

interface TestCase {
  id: string;
  title: string;
  readableId: string;
  status: string;
  priority: string;
}

interface StepResult {
  stepIndex: number;
  status: string;
  notes: string;
  screenshotUrl: string;
}

interface TestRunCase {
  id: string;
  testCaseId: string;
  testCaseTitle: string;
  testCaseReadableId: string;
  testCasePriority: string;
  status: string;
  notes: string;
  executedAt: string | null;
  steps: string | null;
  structuredSteps: any[] | null;
  stepResults: StepResult[];
}

interface TestRunsProps {
  projectId: string;
}

const RUN_TYPES = [
  { value: "smoke", label: "Smoke" },
  { value: "regression", label: "Regression" },
  { value: "sanity", label: "Sanity" },
  { value: "integration", label: "Integration" },
  { value: "uat", label: "UAT" },
  { value: "manual", label: "Manual" },
];

const RUN_STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started", icon: Clock, color: "text-muted-foreground" },
  { value: "in_progress", label: "In Progress", icon: Play, color: "text-blue-500" },
  { value: "completed", label: "Completed", icon: CheckCircle, color: "text-green-500" },
  { value: "failed", label: "Failed", icon: XCircle, color: "text-destructive" },
  { value: "blocked", label: "Blocked", icon: AlertCircle, color: "text-yellow-500" },
];

const CASE_STATUS_OPTIONS = [
  { value: "not_run", label: "Not Run", icon: Clock, color: "text-muted-foreground", bgColor: "bg-muted" },
  { value: "in_progress", label: "In Progress", icon: Play, color: "text-blue-500", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
  { value: "passed", label: "Passed", icon: CheckCircle, color: "text-green-600", bgColor: "bg-green-100 dark:bg-green-900/30" },
  { value: "failed", label: "Failed", icon: XCircle, color: "text-destructive", bgColor: "bg-red-100 dark:bg-red-900/30" },
  { value: "blocked", label: "Blocked", icon: AlertCircle, color: "text-yellow-600", bgColor: "bg-yellow-100 dark:bg-yellow-900/30" },
  { value: "skipped", label: "Skipped", icon: SkipForward, color: "text-gray-500", bgColor: "bg-gray-100 dark:bg-gray-900/30" },
];

const STEP_STATUS_OPTIONS = [
  { value: "not_run", label: "Not Run", icon: Clock, color: "text-muted-foreground" },
  { value: "passed", label: "Passed", icon: CheckCircle, color: "text-green-600" },
  { value: "failed", label: "Failed", icon: XCircle, color: "text-destructive" },
  { value: "blocked", label: "Blocked", icon: AlertCircle, color: "text-yellow-600" },
  { value: "skipped", label: "Skipped", icon: SkipForward, color: "text-gray-500" },
];

export const TestRuns = ({ projectId }: TestRunsProps) => {
  const { toast } = useToast();
  const { session } = useAuth();
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  // View mode: "list", "execute", or "compare"
  const [viewMode, setViewMode] = useState<"list" | "execute" | "compare">("list");
  const [activeTestRun, setActiveTestRun] = useState<TestRun | null>(null);
  const [testRunCases, setTestRunCases] = useState<TestRunCase[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set());
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectTestCasesDialogOpen, setSelectTestCasesDialogOpen] = useState(false);
  const [selectedTestRunId, setSelectedTestRunId] = useState<string | null>(null);
  const [selectedTestCaseIds, setSelectedTestCaseIds] = useState<Set<string>>(new Set());
  
  // Notes dialog
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");
  
  // Step notes dialog
  const [stepNotesDialogOpen, setStepNotesDialogOpen] = useState(false);
  const [editingStepCaseId, setEditingStepCaseId] = useState<string | null>(null);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [stepNotesText, setStepNotesText] = useState("");
  
  // Step screenshot dialog
  const [screenshotDialogOpen, setScreenshotDialogOpen] = useState(false);
  const [screenshotCaseId, setScreenshotCaseId] = useState<string | null>(null);
  const [screenshotStepIndex, setScreenshotStepIndex] = useState<number | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  
  // Rename dialog
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingRun, setRenamingRun] = useState<TestRun | null>(null);
  const [renameValue, setRenameValue] = useState("");
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    runType: "smoke",
    description: "",
  });

  const loadTestRuns = async () => {
    const isPublicProject = publicProjectIds.includes(projectId as any);
    if (!session?.user?.id && !isPublicProject) return;
    
    setIsLoading(true);
    try {
      const { data: runs, error } = await supabase
        .from("test_runs")
        .select(`
          *,
          test_run_cases(id, status)
        `)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const transformedRuns: TestRun[] = (runs || []).map((run: any) => {
        const cases = run.test_run_cases || [];
        return {
          id: run.id,
          name: run.name,
          runType: run.run_type,
          status: run.status,
          description: run.description || "",
          createdBy: run.created_by,
          createdAt: run.created_at,
          testCaseCount: cases.length,
          passedCount: cases.filter((c: any) => c.status === "passed").length,
          failedCount: cases.filter((c: any) => c.status === "failed").length,
          blockedCount: cases.filter((c: any) => c.status === "blocked").length,
          skippedCount: cases.filter((c: any) => c.status === "skipped").length,
        };
      });

      setTestRuns(transformedRuns);
    } catch (error) {
      console.error("Error loading test runs:", error);
      toast({
        title: "Error",
        description: "Failed to load test runs",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadTestCases = async () => {
    try {
      const { data, error } = await supabase
        .from("test_cases")
        .select("id, title, readable_id, status, priority")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setTestCases((data || []).map((tc: any) => ({
        id: tc.id,
        title: tc.title,
        readableId: tc.readable_id || "",
        status: tc.status,
        priority: tc.priority,
      })));
    } catch (error) {
      console.error("Error loading test cases:", error);
    }
  };

  const loadTestRunCases = async (runId: string) => {
    setIsLoadingCases(true);
    try {
      const { data, error } = await supabase
        .from("test_run_cases")
        .select(`
          id,
          test_case_id,
          status,
          notes,
          executed_at,
          step_results,
          test_cases(title, readable_id, priority, steps, structured_steps)
        `)
        .eq("test_run_id", runId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const transformedCases: TestRunCase[] = (data || []).map((trc: any) => ({
        id: trc.id,
        testCaseId: trc.test_case_id,
        testCaseTitle: trc.test_cases?.title || "Unknown",
        testCaseReadableId: trc.test_cases?.readable_id || "",
        testCasePriority: trc.test_cases?.priority || "medium",
        status: trc.status,
        notes: trc.notes || "",
        executedAt: trc.executed_at,
        steps: trc.test_cases?.steps || null,
        structuredSteps: trc.test_cases?.structured_steps || null,
        stepResults: Array.isArray(trc.step_results) ? trc.step_results : [],
      }));

      setTestRunCases(transformedCases);
    } catch (error) {
      console.error("Error loading test run cases:", error);
      toast({
        title: "Error",
        description: "Failed to load test cases for this run",
        variant: "destructive",
      });
    } finally {
      setIsLoadingCases(false);
    }
  };

  useEffect(() => {
    const isPublicProject = publicProjectIds.includes(projectId as any);
    if ((session?.user?.id || isPublicProject) && projectId) {
      loadTestRuns();
      loadTestCases();
    }
  }, [session?.user?.id, projectId]);

  const createTestRun = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for the test run",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("test_runs")
        .insert({
          project_id: projectId,
          name: formData.name,
          run_type: formData.runType,
          description: formData.description,
          created_by: session?.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Test Run Created",
        description: `Created "${formData.name}" test run`,
      });

      setCreateDialogOpen(false);
      setFormData({ name: "", runType: "smoke", description: "" });
      
      setSelectedTestRunId(data.id);
      setSelectTestCasesDialogOpen(true);
      
      loadTestRuns();
    } catch (error) {
      console.error("Error creating test run:", error);
      toast({
        title: "Error",
        description: "Failed to create test run",
        variant: "destructive",
      });
    }
  };

  const addTestCasesToRun = async () => {
    if (!selectedTestRunId || selectedTestCaseIds.size === 0) return;

    try {
      const casesToInsert = Array.from(selectedTestCaseIds).map(tcId => ({
        test_run_id: selectedTestRunId,
        test_case_id: tcId,
        status: "not_run",
      }));

      const { error } = await supabase
        .from("test_run_cases")
        .insert(casesToInsert);

      if (error) throw error;

      toast({
        title: "Test Cases Added",
        description: `Added ${selectedTestCaseIds.size} test case(s) to the run`,
      });

      setSelectTestCasesDialogOpen(false);
      setSelectedTestRunId(null);
      setSelectedTestCaseIds(new Set());
      loadTestRuns();
      
      if (activeTestRun && activeTestRun.id === selectedTestRunId) {
        loadTestRunCases(selectedTestRunId);
      }
    } catch (error) {
      console.error("Error adding test cases:", error);
      toast({
        title: "Error",
        description: "Failed to add test cases",
        variant: "destructive",
      });
    }
  };

  const deleteTestRun = async (runId: string) => {
    try {
      const { error } = await supabase
        .from("test_runs")
        .delete()
        .eq("id", runId);

      if (error) throw error;

      toast({
        title: "Test Run Deleted",
        description: "Test run has been deleted",
      });

      loadTestRuns();
    } catch (error) {
      console.error("Error deleting test run:", error);
      toast({
        title: "Error",
        description: "Failed to delete test run",
        variant: "destructive",
      });
    }
  };

  const cloneTestRun = async (run: TestRun) => {
    try {
      // Create new test run with copied details
      const { data: newRun, error: runError } = await supabase
        .from("test_runs")
        .insert({
          project_id: projectId,
          name: `${run.name} (Copy)`,
          run_type: run.runType,
          description: run.description,
          created_by: session?.user?.id,
          status: "not_started",
        })
        .select()
        .single();

      if (runError) throw runError;

      // Get test cases from original run
      const { data: originalCases, error: casesError } = await supabase
        .from("test_run_cases")
        .select("test_case_id")
        .eq("test_run_id", run.id);

      if (casesError) throw casesError;

      // Copy test cases to new run (reset status to not_run)
      if (originalCases && originalCases.length > 0) {
        const newCases = originalCases.map(tc => ({
          test_run_id: newRun.id,
          test_case_id: tc.test_case_id,
          status: "not_run",
        }));

        const { error: insertError } = await supabase
          .from("test_run_cases")
          .insert(newCases);

        if (insertError) throw insertError;
      }

      toast({
        title: "Test Run Cloned",
        description: `Created "${run.name} (Copy)" with ${originalCases?.length || 0} test cases`,
      });

      loadTestRuns();
    } catch (error) {
      console.error("Error cloning test run:", error);
      toast({
        title: "Error",
        description: "Failed to clone test run",
        variant: "destructive",
      });
    }
  };

  const openRenameDialog = (run: TestRun) => {
    setRenamingRun(run);
    setRenameValue(run.name);
    setRenameDialogOpen(true);
  };

  const renameTestRun = async () => {
    if (!renamingRun || !renameValue.trim()) return;

    try {
      const { error } = await supabase
        .from("test_runs")
        .update({ name: renameValue.trim() })
        .eq("id", renamingRun.id);

      if (error) throw error;

      toast({
        title: "Test Run Renamed",
        description: `Renamed to "${renameValue.trim()}"`,
      });

      setRenameDialogOpen(false);
      setRenamingRun(null);
      setRenameValue("");
      loadTestRuns();
    } catch (error) {
      console.error("Error renaming test run:", error);
      toast({
        title: "Error",
        description: "Failed to rename test run",
        variant: "destructive",
      });
    }
  };

  const updateTestRunStatus = async (runId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("test_runs")
        .update({ status: newStatus })
        .eq("id", runId);

      if (error) throw error;

      loadTestRuns();
      if (activeTestRun && activeTestRun.id === runId) {
        setActiveTestRun({ ...activeTestRun, status: newStatus });
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const updateTestCaseStatus = async (caseId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("test_run_cases")
        .update({ 
          status: newStatus,
          executed_at: newStatus !== "not_run" ? new Date().toISOString() : null,
          executed_by: session?.user?.id,
        })
        .eq("id", caseId);

      if (error) throw error;

      // Update local state
      setTestRunCases(prev => prev.map(tc => 
        tc.id === caseId 
          ? { ...tc, status: newStatus, executedAt: newStatus !== "not_run" ? new Date().toISOString() : null }
          : tc
      ));

      // Check if all cases are executed and update run status
      const updatedCases = testRunCases.map(tc => tc.id === caseId ? { ...tc, status: newStatus } : tc);
      const allExecuted = updatedCases.every(tc => tc.status !== "not_run");
      const hasFailed = updatedCases.some(tc => tc.status === "failed");
      const hasBlocked = updatedCases.some(tc => tc.status === "blocked");

      if (allExecuted && activeTestRun) {
        const finalStatus = hasFailed ? "failed" : hasBlocked ? "blocked" : "completed";
        if (activeTestRun.status !== finalStatus) {
          await updateTestRunStatus(activeTestRun.id, finalStatus);
        }
      } else if (activeTestRun && activeTestRun.status === "not_started") {
        await updateTestRunStatus(activeTestRun.id, "in_progress");
      }

      loadTestRuns();
    } catch (error) {
      console.error("Error updating test case status:", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const updateTestCaseNotes = async () => {
    if (!editingCaseId) return;

    try {
      const { error } = await supabase
        .from("test_run_cases")
        .update({ notes: notesText })
        .eq("id", editingCaseId);

      if (error) throw error;

      setTestRunCases(prev => prev.map(tc => 
        tc.id === editingCaseId ? { ...tc, notes: notesText } : tc
      ));

      setNotesDialogOpen(false);
      setEditingCaseId(null);
      setNotesText("");

      toast({
        title: "Notes Updated",
        description: "Test case notes have been saved",
      });
    } catch (error) {
      console.error("Error updating notes:", error);
      toast({
        title: "Error",
        description: "Failed to save notes",
        variant: "destructive",
      });
    }
  };

  const removeTestCaseFromRun = async (caseId: string) => {
    try {
      const { error } = await supabase
        .from("test_run_cases")
        .delete()
        .eq("id", caseId);

      if (error) throw error;

      setTestRunCases(prev => prev.filter(tc => tc.id !== caseId));
      loadTestRuns();

      toast({
        title: "Test Case Removed",
        description: "Test case removed from this run",
      });
    } catch (error) {
      console.error("Error removing test case:", error);
      toast({
        title: "Error",
        description: "Failed to remove test case",
        variant: "destructive",
      });
    }
  };

  const openExecuteView = (run: TestRun) => {
    setActiveTestRun(run);
    setViewMode("execute");
    loadTestRunCases(run.id);
  };

  const closeExecuteView = () => {
    setViewMode("list");
    setActiveTestRun(null);
    setTestRunCases([]);
  };

  const toggleTestCaseSelection = (tcId: string) => {
    setSelectedTestCaseIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tcId)) {
        newSet.delete(tcId);
      } else {
        newSet.add(tcId);
      }
      return newSet;
    });
  };

  const openNotesDialog = (trc: TestRunCase) => {
    setEditingCaseId(trc.id);
    setNotesText(trc.notes);
    setNotesDialogOpen(true);
  };

  const toggleCaseExpanded = (caseId: string) => {
    setExpandedCases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(caseId)) {
        newSet.delete(caseId);
      } else {
        newSet.add(caseId);
      }
      return newSet;
    });
  };

  // Step management functions
  const getStepResult = (trc: TestRunCase, stepIndex: number): StepResult => {
    const existing = trc.stepResults.find(sr => sr.stepIndex === stepIndex);
    return existing || { stepIndex, status: "not_run", notes: "", screenshotUrl: "" };
  };

  const calculateTestCaseStatusFromSteps = (trc: TestRunCase, stepResults: StepResult[]): string => {
    // If no step results exist, keep current status
    if (!stepResults || stepResults.length === 0) {
      return trc.status;
    }

    // Get statuses from the actual step results we have
    const stepStatuses = stepResults.map(sr => sr.status);

    // Priority-based status calculation
    // 1. If any step is failed → Failed
    if (stepStatuses.some(s => s === "failed")) {
      return "failed";
    }
    // 2. If any step is blocked → Blocked
    if (stepStatuses.some(s => s === "blocked")) {
      return "blocked";
    }
    // 3. If any step is skipped → Skipped
    if (stepStatuses.some(s => s === "skipped")) {
      return "skipped";
    }
    
    // 4. If ALL step results are "not_run" → Not Run
    if (stepStatuses.every(s => s === "not_run")) {
      return "not_run";
    }
    
    // 5. If ALL step results are "passed" → Passed
    if (stepStatuses.every(s => s === "passed")) {
      return "passed";
    }
    
    // 6. If any step is passed but not all → In Progress
    if (stepStatuses.some(s => s === "passed")) {
      return "in_progress";
    }
    
    return trc.status;
  };

  const updateStepResult = async (caseId: string, stepIndex: number, updates: Partial<StepResult>) => {
    const trc = testRunCases.find(c => c.id === caseId);
    if (!trc) return;

    const existingResults = [...trc.stepResults];
    const existingIndex = existingResults.findIndex(sr => sr.stepIndex === stepIndex);
    
    if (existingIndex >= 0) {
      existingResults[existingIndex] = { ...existingResults[existingIndex], ...updates };
    } else {
      existingResults.push({ stepIndex, status: "not_run", notes: "", screenshotUrl: "", ...updates });
    }

    try {
      const { error } = await supabase
        .from("test_run_cases")
        .update({ step_results: existingResults as unknown as any })
        .eq("id", caseId);

      if (error) throw error;

      setTestRunCases(prev => prev.map(c => 
        c.id === caseId ? { ...c, stepResults: existingResults } : c
      ));

      // Auto-calculate and update test case status based on step statuses
      if (updates.status) {
        const newCaseStatus = calculateTestCaseStatusFromSteps(trc, existingResults);
        if (newCaseStatus !== trc.status) {
          await updateTestCaseStatus(caseId, newCaseStatus);
        }
      }
    } catch (error) {
      console.error("Error updating step result:", error);
      toast({
        title: "Error",
        description: "Failed to update step",
        variant: "destructive",
      });
    }
  };

  const openStepNotesDialog = (caseId: string, stepIndex: number, currentNotes: string) => {
    setEditingStepCaseId(caseId);
    setEditingStepIndex(stepIndex);
    setStepNotesText(currentNotes);
    setStepNotesDialogOpen(true);
  };

  const saveStepNotes = async () => {
    if (editingStepCaseId === null || editingStepIndex === null) return;
    await updateStepResult(editingStepCaseId, editingStepIndex, { notes: stepNotesText });
    setStepNotesDialogOpen(false);
    setEditingStepCaseId(null);
    setEditingStepIndex(null);
    setStepNotesText("");
    toast({ title: "Step Notes Saved" });
  };

  const openScreenshotDialog = (caseId: string, stepIndex: number, currentUrl: string) => {
    setScreenshotCaseId(caseId);
    setScreenshotStepIndex(stepIndex);
    setScreenshotPreview(currentUrl || null);
    setScreenshotDialogOpen(true);
  };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveScreenshot = async () => {
    if (screenshotCaseId === null || screenshotStepIndex === null) return;
    await updateStepResult(screenshotCaseId, screenshotStepIndex, { screenshotUrl: screenshotPreview || "" });
    setScreenshotDialogOpen(false);
    setScreenshotCaseId(null);
    setScreenshotStepIndex(null);
    setScreenshotPreview(null);
    toast({ title: "Screenshot Saved" });
  };

  const renderSteps = (trc: TestRunCase) => {
    const renderStepRow = (stepContent: string, expectedResult: string | null, index: number) => {
      const stepResult = getStepResult(trc, index);
      const statusConfig = STEP_STATUS_OPTIONS.find(s => s.value === stepResult.status);
      
      return (
        <div key={index} className="flex flex-col gap-2 p-3 rounded bg-muted/50 border border-border/50">
          <div className="flex gap-3 items-start">
            <span className="font-mono text-xs text-muted-foreground min-w-[24px] pt-1">{index + 1}.</span>
            <div className="flex-1 space-y-1">
              <div className="text-sm">{stepContent}</div>
              {expectedResult && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Expected:</span> {expectedResult}
                </div>
              )}
            </div>
          </div>
          
          {/* Step Controls */}
          <div className="flex items-center gap-2 ml-7 pt-2 border-t border-border/30">
            <Select
              value={stepResult.status}
              onValueChange={(value) => updateStepResult(trc.id, index, { status: value })}
            >
              <SelectTrigger className="w-[120px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STEP_STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    <div className="flex items-center gap-2">
                      <status.icon className={`h-3 w-3 ${status.color}`} />
                      {status.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => openStepNotesDialog(trc.id, index, stepResult.notes)}
            >
              <MessageSquare className="h-3 w-3" />
              {stepResult.notes ? "Edit Notes" : "Add Notes"}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => openScreenshotDialog(trc.id, index, stepResult.screenshotUrl)}
            >
              <Camera className="h-3 w-3" />
              {stepResult.screenshotUrl ? "View Screenshot" : "Add Screenshot"}
            </Button>
            
            {stepResult.screenshotUrl && (
              <div className="ml-2">
                <img 
                  src={stepResult.screenshotUrl} 
                  alt="Step screenshot" 
                  className="h-6 w-10 object-cover rounded border cursor-pointer"
                  onClick={() => openScreenshotDialog(trc.id, index, stepResult.screenshotUrl)}
                />
              </div>
            )}
          </div>
          
          {stepResult.notes && (
            <div className="ml-7 text-xs text-muted-foreground bg-background/50 p-2 rounded">
              <span className="font-medium">Notes:</span> {stepResult.notes}
            </div>
          )}
        </div>
      );
    };

    // Prefer structured steps if available
    if (trc.structuredSteps && trc.structuredSteps.length > 0) {
      return (
        <div className="space-y-2">
          {trc.structuredSteps.map((step: any, index: number) => 
            renderStepRow(
              step.action || step.step || step.description || JSON.stringify(step),
              step.expectedResult || null,
              index
            )
          )}
        </div>
      );
    }
    
    // Fall back to plain text steps
    if (trc.steps) {
      const stepLines = trc.steps.split('\n').filter(line => line.trim());
      return (
        <div className="space-y-2">
          {stepLines.map((step, index) => renderStepRow(step, null, index))}
        </div>
      );
    }
    
    return <div className="text-sm text-muted-foreground italic">No steps defined for this test case.</div>;
  };

  const filteredTestRuns = testRuns.filter(run =>
    run.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    run.runType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRunTypeBadge = (runType: string) => {
    const typeConfig = RUN_TYPES.find(t => t.value === runType);
    return (
      <Badge variant="secondary" className="capitalize">
        {typeConfig?.label || runType}
      </Badge>
    );
  };

  const getCaseStatusBadge = (status: string) => {
    const statusConfig = CASE_STATUS_OPTIONS.find(s => s.value === status);
    if (!statusConfig) return <Badge variant="secondary">{status}</Badge>;
    
    const Icon = statusConfig.icon;
    return (
      <Badge variant="outline" className={`gap-1 ${statusConfig.color}`}>
        <Icon className="h-3 w-3" />
        {statusConfig.label}
      </Badge>
    );
  };

  const getProgressStats = () => {
    if (testRunCases.length === 0) return { executed: 0, total: 0, percentage: 0 };
    const executed = testRunCases.filter(tc => tc.status !== "not_run").length;
    return {
      executed,
      total: testRunCases.length,
      percentage: Math.round((executed / testRunCases.length) * 100),
    };
  };

  // Execute View
  if (viewMode === "execute" && activeTestRun) {
    const stats = getProgressStats();
    const passedCount = testRunCases.filter(tc => tc.status === "passed").length;
    const failedCount = testRunCases.filter(tc => tc.status === "failed").length;
    const blockedCount = testRunCases.filter(tc => tc.status === "blocked").length;

    return (
      <div className="h-full flex flex-col overflow-hidden rounded-lg border border-border bg-card">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3 mb-3">
            <Button variant="ghost" size="sm" onClick={closeExecuteView}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">{activeTestRun.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                {getRunTypeBadge(activeTestRun.runType)}
                <span className="text-sm text-muted-foreground">
                  {activeTestRun.description}
                </span>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setSelectedTestRunId(activeTestRun.id);
                setSelectTestCasesDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Cases
            </Button>
          </div>
          
          {/* Progress Section */}
          <div className="grid grid-cols-5 gap-4 mt-4">
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold">{stats.percentage}%</div>
                <div className="text-xs text-muted-foreground">Progress</div>
                <Progress value={stats.percentage} className="mt-2 h-1" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total Cases</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-green-600">{passedCount}</div>
                <div className="text-xs text-muted-foreground">Passed</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-destructive">{failedCount}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-yellow-600">{blockedCount}</div>
                <div className="text-xs text-muted-foreground">Blocked</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Test Cases Table */}
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead className="w-[100px]">ID</TableHead>
                <TableHead>Test Case</TableHead>
                <TableHead className="w-[100px]">Priority</TableHead>
                <TableHead className="w-[160px]">Status</TableHead>
                <TableHead className="w-[180px]">Notes</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingCases ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading test cases...
                  </TableCell>
                </TableRow>
              ) : testRunCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No test cases in this run. Add some to get started.
                  </TableCell>
                </TableRow>
              ) : (
                testRunCases.map((trc) => {
                  const statusConfig = CASE_STATUS_OPTIONS.find(s => s.value === trc.status);
                  const isExpanded = expandedCases.has(trc.id);
                  const hasSteps = (trc.structuredSteps && trc.structuredSteps.length > 0) || (trc.steps && trc.steps.trim());
                  return (
                    <Fragment key={trc.id}>
                      <TableRow className={statusConfig?.bgColor}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleCaseExpanded(trc.id)}
                            disabled={!hasSteps}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className={`h-4 w-4 ${!hasSteps ? 'opacity-30' : ''}`} />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{trc.testCaseReadableId}</TableCell>
                        <TableCell className="font-medium">{trc.testCaseTitle}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{trc.testCasePriority}</Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={trc.status}
                            onValueChange={(value) => updateTestCaseStatus(trc.id, value)}
                          >
                            <SelectTrigger className="w-[140px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CASE_STATUS_OPTIONS.map((status) => (
                                <SelectItem key={status.value} value={status.value}>
                                  <div className="flex items-center gap-2">
                                    <status.icon className={`h-3 w-3 ${status.color}`} />
                                    {status.label}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs h-7"
                            onClick={() => openNotesDialog(trc)}
                          >
                            {trc.notes ? trc.notes.substring(0, 20) + (trc.notes.length > 20 ? "..." : "") : "Add notes..."}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                <MinusCircle className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Test Case</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Remove this test case from the run? The test case itself will not be deleted.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removeTestCaseFromRun(trc.id)}>
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${trc.id}-steps`}>
                          <TableCell colSpan={7} className="bg-muted/30 p-4">
                            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                              <ListChecks className="h-4 w-4" />
                              Test Steps
                            </div>
                            {renderSteps(trc)}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        {/* Notes Dialog */}
        <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Test Case Notes</DialogTitle>
              <DialogDescription>
                Add execution notes, defect references, or observations.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Enter notes..."
              rows={5}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={updateTestCaseNotes}>Save Notes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Test Cases Dialog */}
        <Dialog open={selectTestCasesDialogOpen} onOpenChange={setSelectTestCasesDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Test Cases to Run</DialogTitle>
              <DialogDescription>
                Select test cases to include in this test run.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[400px] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testCases
                    .filter(tc => !testRunCases.some(trc => trc.testCaseId === tc.id))
                    .map((tc) => (
                    <TableRow key={tc.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedTestCaseIds.has(tc.id)}
                          onCheckedChange={() => toggleTestCaseSelection(tc.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{tc.readableId}</TableCell>
                      <TableCell>{tc.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{tc.priority}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setSelectTestCasesDialogOpen(false);
                setSelectedTestCaseIds(new Set());
              }}>
                Cancel
              </Button>
              <Button onClick={addTestCasesToRun} disabled={selectedTestCaseIds.size === 0}>
                Add {selectedTestCaseIds.size > 0 ? `(${selectedTestCaseIds.size})` : ""} Test Cases
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Step Notes Dialog */}
        <Dialog open={stepNotesDialogOpen} onOpenChange={setStepNotesDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Step Notes</DialogTitle>
              <DialogDescription>
                Add notes for this specific test step.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={stepNotesText}
              onChange={(e) => setStepNotesText(e.target.value)}
              placeholder="Enter step notes..."
              rows={4}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setStepNotesDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveStepNotes}>Save Notes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Screenshot Dialog */}
        <Dialog open={screenshotDialogOpen} onOpenChange={setScreenshotDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Step Screenshot</DialogTitle>
              <DialogDescription>
                Upload or view screenshot for this step.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {screenshotPreview && (
                <div className="border rounded-lg overflow-hidden">
                  <img 
                    src={screenshotPreview} 
                    alt="Step screenshot" 
                    className="w-full h-auto max-h-[300px] object-contain"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="file"
                  accept="image/*"
                  ref={screenshotInputRef}
                  onChange={handleScreenshotUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => screenshotInputRef.current?.click()}
                  className="gap-2"
                >
                  <Image className="h-4 w-4" />
                  {screenshotPreview ? "Replace" : "Upload"} Screenshot
                </Button>
                {screenshotPreview && (
                  <Button
                    variant="outline"
                    onClick={() => setScreenshotPreview(null)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScreenshotDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveScreenshot}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Compare View
  if (viewMode === "compare") {
    return (
      <TestRunComparison
        projectId={projectId}
        testRuns={testRuns}
        onBack={() => setViewMode("list")}
      />
    );
  }

  // List View
  return (
    <div className="h-full flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Test Run
        </Button>
        <Button 
          variant="outline" 
          onClick={() => setViewMode("compare")}
          disabled={testRuns.length < 2}
          className="gap-2"
        >
          <GitCompare className="h-4 w-4" />
          Compare Runs
        </Button>
        
        <div className="flex-1" />
        
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search test runs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 w-60 h-9"
          />
        </div>
      </div>

      {/* Test Runs Table */}
      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Total</TableHead>
              <TableHead className="text-center">Passed</TableHead>
              <TableHead className="text-center">Failed</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading test runs...
                </TableCell>
              </TableRow>
            ) : filteredTestRuns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No test runs found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredTestRuns.map((run) => (
                <TableRow key={run.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openExecuteView(run)}>
                  <TableCell className="font-medium">{run.name}</TableCell>
                  <TableCell>{getRunTypeBadge(run.runType)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={run.status}
                      onValueChange={(value) => updateTestRunStatus(run.id, value)}
                    >
                      <SelectTrigger className="w-[140px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RUN_STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            <div className="flex items-center gap-2">
                              <status.icon className={`h-3 w-3 ${status.color}`} />
                              {status.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-center">{run.testCaseCount}</TableCell>
                  <TableCell className="text-center text-green-600">{run.passedCount}</TableCell>
                  <TableCell className="text-center text-destructive">{run.failedCount}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(run.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openExecuteView(run)}>
                        <Play className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openExecuteView(run)}>
                            <Play className="h-4 w-4 mr-2" />
                            Execute
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedTestRunId(run.id);
                            setSelectTestCasesDialogOpen(true);
                          }}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Test Cases
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => cloneTestRun(run)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Clone
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openRenameDialog(run)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Test Run</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{run.name}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteTestRun(run.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Create Test Run Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Test Run</DialogTitle>
            <DialogDescription>
              Create a new test run to organize and execute your test cases.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Sprint 5 Regression"
              />
            </div>
            <div className="space-y-2">
              <Label>Run Type</Label>
              <Select
                value={formData.runType}
                onValueChange={(value) => setFormData({ ...formData, runType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RUN_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createTestRun}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select Test Cases Dialog (for list view) */}
      <Dialog open={selectTestCasesDialogOpen && viewMode === "list"} onOpenChange={setSelectTestCasesDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Test Cases to Run</DialogTitle>
            <DialogDescription>
              Select test cases to include in this test run.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testCases.map((tc) => (
                  <TableRow key={tc.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedTestCaseIds.has(tc.id)}
                        onCheckedChange={() => toggleTestCaseSelection(tc.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{tc.readableId}</TableCell>
                    <TableCell>{tc.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{tc.priority}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setSelectTestCasesDialogOpen(false);
              setSelectedTestCaseIds(new Set());
            }}>
              Cancel
            </Button>
            <Button onClick={addTestCasesToRun} disabled={selectedTestCaseIds.size === 0}>
              Add {selectedTestCaseIds.size > 0 ? `(${selectedTestCaseIds.size})` : ""} Test Cases
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Test Run Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Test Run</DialogTitle>
            <DialogDescription>
              Enter a new name for this test run.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Name *</Label>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Test run name"
              className="mt-2"
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameValue.trim()) {
                  renameTestRun();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={renameTestRun} disabled={!renameValue.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
