import { useState, useEffect } from "react";
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
  Target,
  Trash2,
  Clock,
  BarChart3,
  Send,
  Upload,
  X,
  Image as ImageIcon,
  FileUp,
  Bug,
  Brain,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Shield
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
import { useAISafetyControls } from "@/hooks/useAISafetyControls";
import { AIContentApprovalDialog } from "./AIContentApprovalDialog";

interface Defect {
  id: string;
  title: string;
  description: string;
  steps_to_reproduce: string;
  expected_result: string;
  actual_result: string;
  source: 'manual' | 'ai';
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  test_case_id?: string;
  project_id: string;
  created_at: string;
  updated_at: string;
}

interface DefectsProps {
  onViewChange: (view: string) => void;
  projectId: string;
}

// Create Defect Form Data
interface DefectFormData {
  scenario: string;
  screenshot?: File;
  logs: string;
  errorSnippet: string;
  testCaseId: string;
}

// Generated Defect Report Data
interface GeneratedDefectReport {
  title: string;
  stepsToReproduce: string[];
  actualResult: string;
  expectedResult: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  severity: '1 - Critical' | '2 - High' | '3 - Medium' | '4 - Low';
  screenshot?: File;
}

// AI Defect Analysis Result
interface DefectAnalysisResult {
  severity: string;
  category: string;
  rootCause: string;
  suggestedFix: string;
  similarIssues: string[];
  testCoverage: string;
}

export const Defects = ({ onViewChange, projectId }: DefectsProps) => {
  const { toast } = useToast();
  const { session } = useAuth();
  const { checkRateLimit, safetyConfig, processGenerationResult, loadSafetyConfig } = useAISafetyControls(projectId);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  
  // Approval dialog states
  const [showDefectApprovalDialog, setShowDefectApprovalDialog] = useState(false);
  const [pendingDefectReport, setPendingDefectReport] = useState<GeneratedDefectReport | null>(null);
  const [pendingDefectConfidence, setPendingDefectConfidence] = useState(0.7);
  const [pendingDefectWarnings, setPendingDefectWarnings] = useState<string[]>([]);
  const [isProcessingDefectApproval, setIsProcessingDefectApproval] = useState(false);

  // Load safety config on mount
  useEffect(() => {
    if (projectId) {
      loadSafetyConfig(projectId);
    }
  }, [projectId, loadSafetyConfig]);

  // Create Defect form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<DefectFormData>({
    scenario: '',
    screenshot: undefined,
    logs: '',
    errorSnippet: '',
    testCaseId: ''
  });

  // Generated report state
  const [generatedReport, setGeneratedReport] = useState<GeneratedDefectReport | null>(null);
  const [aiGeneratedReport, setAiGeneratedReport] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  
  // State to control Azure DevOps section visibility
  const [showAzureDefects, setShowAzureDefects] = useState(true);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  // Regenerate modal states
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [selectedDefectForRegenerate, setSelectedDefectForRegenerate] = useState<string | null>(null);

  // KPI Stats
  const [kpiStats, setKpiStats] = useState({
    totalDefects: 0,
    openDefects: 0,
    resolvedDefects: 0,
    timeSaved: 0
  });

  // Azure DevOps defects state
  const [azureDefects, setAzureDefects] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [azureMetrics, setAzureMetrics] = useState({
    totalDefects: 0,
    openDefects: 0,
    closedDefects: 0,
    criticalDefects: 0,
    defectClosureRate: '0'
  });

  // Jira defects state
  const [jiraDefects, setJiraDefects] = useState<any[]>([]);
  const [isSyncingJira, setIsSyncingJira] = useState(false);
  const [jiraMetrics, setJiraMetrics] = useState({
    totalDefects: 0,
    openDefects: 0,
    closedDefects: 0,
    criticalDefects: 0
  });

  // AI Analysis state
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedDefectForAnalysis, setSelectedDefectForAnalysis] = useState<{
    title: string;
    description: string;
    stepsToReproduce?: string;
  } | null>(null);
  const [analysisResult, setAnalysisResult] = useState<DefectAnalysisResult | null>(null);
  const filteredDefects = defects.filter(defect => {
    const matchesSearch = defect.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         defect.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || defect.priority === priorityFilter;
    const matchesStatus = statusFilter === 'all' || defect.status === statusFilter;
    const matchesSource = sourceFilter === 'all' || defect.source === sourceFilter;
    
    return matchesSearch && matchesPriority && matchesStatus && matchesSource;
  });

  // Load defects from database
  const loadDefects = async () => {
    const isPublicProject = publicProjectIds.includes(projectId as any);
    if ((!session?.user?.id && !isPublicProject) || !projectId) return;

    setIsLoading(true);
    try {
      // Since there's no defects table, we'll mock some data for demonstration
      // In a real implementation, you would create a defects table first
      const mockDefects: Defect[] = [];

      setDefects(mockDefects);

      // Calculate KPI stats
      const totalDefects = mockDefects.length;
      const openDefects = mockDefects.filter(d => ['open', 'in-progress'].includes(d.status)).length;
      const resolvedDefects = mockDefects.filter(d => ['resolved', 'closed'].includes(d.status)).length;
      const timeSaved = Math.round(totalDefects * 0.5); // 30 minutes per defect = 0.5 hours

      setKpiStats({
        totalDefects,
        openDefects,
        resolvedDefects,
        timeSaved
      });

    } catch (error) {
      console.error('Error loading defects:', error);
      toast({
        title: "Error",
        description: "Failed to load defects",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load defects on component mount
  useEffect(() => {
    const isPublicProject = publicProjectIds.includes(projectId as any);
    if ((session?.user?.id || isPublicProject) && projectId) {
      loadDefects();
      syncAzureDefects(); // Automatically load Azure defects when component mounts
      syncJiraDefects(); // Automatically load Jira defects when component mounts
    }
  }, [session?.user?.id, projectId]);

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "File size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setFormData(prev => ({ ...prev, screenshot: file }));
  };

  // Analyze defect using AI QA Orchestrator
  const analyzeDefectWithAI = async (defect: { title: string; description: string; stepsToReproduce?: string }) => {
    setSelectedDefectForAnalysis(defect);
    setAnalysisResult(null);
    setShowAnalysisDialog(true);
    setIsAnalyzing(true);

    // Check rate limit before proceeding
    const canProceed = await checkRateLimit(projectId);
    if (!canProceed) {
      toast({
        title: "Rate limit reached",
        description: "Daily AI generation limit reached. Try again tomorrow.",
        variant: "destructive",
      });
      setIsAnalyzing(false);
      setShowAnalysisDialog(false);
      return;
    }

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        throw new Error("Not authenticated");
      }

      const { data, error } = await supabase.functions.invoke('ai-qa-orchestrator', {
        body: {
          intent: 'defect_analysis',
          projectId: projectId,
          defect: {
            title: defect.title,
            description: defect.description,
            stepsToReproduce: defect.stepsToReproduce,
          }
        }
      });

      if (error) throw error;

      if (data?.analysis) {
        setAnalysisResult(data.analysis);
        toast({
          title: "Analysis Complete",
          description: "AI has analyzed the defect and provided insights",
        });
      } else {
        throw new Error("No analysis returned from AI");
      }
    } catch (error) {
      console.error('Error analyzing defect:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze defect",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Generate defect report using AI
  const generateDefectReport = async () => {
    if (!formData.scenario.trim()) {
      toast({
        title: "Error",
        description: "Please provide a test scenario",
        variant: "destructive",
      });
      return;
    }

    // Get Azure OpenAI configuration from database
    let azureOpenAiConfig = null;
    
    try {
      const { data, error } = await supabase
        .from('integration_configs')
        .select('config, enabled')
        .eq('project_id', projectId)
        .eq('integration_id', 'openai')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }

      if (data && data.enabled) {
        azureOpenAiConfig = data.config;
      }
    } catch (error) {
      console.error('Error loading OpenAI config:', error);
    }

    if (!azureOpenAiConfig || !azureOpenAiConfig.apiKey || !azureOpenAiConfig.endpoint) {
      toast({
        title: "Azure OpenAI Not Configured",
        description: "Please configure Azure OpenAI in the Integrations tab first",
        variant: "destructive",
      });
      return;
    }

    // Check rate limit before proceeding
    const canProceed = await checkRateLimit(projectId);
    if (!canProceed) {
      toast({
        title: "Rate limit reached",
        description: "Daily AI generation limit reached. Try again tomorrow.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingReport(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-defect-report', {
        body: {
          scenario: formData.scenario,
          steps: formData.logs,
          expectedResult: "Application should work correctly",
          actualResult: formData.errorSnippet || "System shows unexpected behavior",
          priority: "medium",
          projectId: projectId,
          azureOpenAiConfig
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate defect report');
      }

      // Use the parsed report if available, otherwise use the raw report
      const report: GeneratedDefectReport = data.parsedReport ? {
        title: data.parsedReport.title,
        stepsToReproduce: Array.isArray(data.parsedReport.stepsToReproduce) ? data.parsedReport.stepsToReproduce : [data.parsedReport.stepsToReproduce || "Review scenario"],
        actualResult: data.parsedReport.actualResult,
        expectedResult: data.parsedReport.expectedResult,
        priority: data.parsedReport.priority || 'P3',
        severity: (data.parsedReport.severity === 'Medium' || data.parsedReport.severity === 'medium') ? '3 - Medium' : (data.parsedReport.severity || '3 - Medium'),
        screenshot: formData.screenshot
      } : {
        title: "Generated Defect Report",
        stepsToReproduce: ["Review the scenario provided", "Follow the steps described in the logs"],
        actualResult: formData.errorSnippet || "System shows unexpected behavior",
        expectedResult: "Application should work correctly",
        priority: 'P3',
        severity: '3 - Medium',
        screenshot: formData.screenshot
      };

      // Check if approval is required for defect reports
      const requiresApproval = safetyConfig.requireApprovalForDefects;
      
      if (requiresApproval) {
        const result = await processGenerationResult(
          projectId,
          'defect_analysis',
          report,
          data.confidence || 0.7,
          { similarExamplesFound: 0, patternsUsed: 0, generationTimeMs: 0 }
        );
        
        if (result.requiresApproval) {
          setPendingDefectReport(report);
          setPendingDefectConfidence(result.confidence);
          setPendingDefectWarnings(result.warnings);
          setShowDefectApprovalDialog(true);
          toast({
            title: "Review Required",
            description: "Defect report requires approval before use",
          });
        } else {
          setGeneratedReport(report);
          setAiGeneratedReport(data.report || JSON.stringify(data.parsedReport, null, 2));
          toast({
            title: "Success",
            description: "Defect report generated and auto-approved",
          });
        }
      } else {
        setGeneratedReport(report);
        setAiGeneratedReport(data.report || JSON.stringify(data.parsedReport, null, 2));
        toast({
          title: "Success",
          description: "Defect report generated successfully",
        });
      }

    } catch (error) {
      console.error('Error generating defect report:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate defect report",
        variant: "destructive",
      });
    } finally {
      setGeneratingReport(false);
    }
  };
  
  const handleApproveDefectReport = async (approvedItems: any[]) => {
    setIsProcessingDefectApproval(true);
    try {
      const report = approvedItems[0] || pendingDefectReport;
      setGeneratedReport(report);
      setAiGeneratedReport(JSON.stringify(report, null, 2));
      
      // Log approval
      if (session?.user?.id) {
        await supabase.from('qa_ai_feedback').insert({
          project_id: projectId,
          user_id: session.user.id,
          artifact_type: 'defect_report',
          action: 'approved',
          original_content: JSON.stringify(pendingDefectReport),
          edited_content: JSON.stringify(report) !== JSON.stringify(pendingDefectReport) ? JSON.stringify(report) : null,
          feedback_notes: JSON.stringify({ confidence: pendingDefectConfidence }),
        });
      }
      
      setShowDefectApprovalDialog(false);
      setPendingDefectReport(null);
      toast({
        title: "Approved",
        description: "Defect report has been approved and is ready for submission",
      });
    } catch (error) {
      console.error('Error approving defect:', error);
      toast({
        title: "Error",
        description: "Failed to save approval",
        variant: "destructive",
      });
    } finally {
      setIsProcessingDefectApproval(false);
    }
  };
  
  const handleRejectDefectReport = async (reason: string) => {
    try {
      if (session?.user?.id) {
        await supabase.from('qa_ai_feedback').insert({
          project_id: projectId,
          user_id: session.user.id,
          artifact_type: 'defect_report',
          action: 'rejected',
          original_content: JSON.stringify(pendingDefectReport),
          feedback_notes: JSON.stringify({ confidence: pendingDefectConfidence, reason }),
        });
      }
      
      setShowDefectApprovalDialog(false);
      setPendingDefectReport(null);
      toast({
        title: "Rejected",
        description: "Defect report has been rejected",
      });
    } catch (error) {
      console.error('Error rejecting defect:', error);
    }
  };

  // Submit defect to Azure DevOps or Jira
  const submitDefect = async () => {
    if (!session?.user?.id) {
      toast({
        title: "Error",
        description: "You must be logged in to submit a defect",
        variant: "destructive",
      });
      return;
    }

    if (!generatedReport) {
      toast({
        title: "Error",
        description: "Please generate a defect report first before submitting",
        variant: "destructive",
      });
      return;
    }

    // Validate required fields in the generated report
    if (!generatedReport.title.trim()) {
      toast({
        title: "Error", 
        description: "Defect title is required",
        variant: "destructive",
      });
      return;
    }

    if (!generatedReport.stepsToReproduce.some(step => step.trim())) {
      toast({
        title: "Error",
        description: "At least one step to reproduce is required", 
        variant: "destructive",
      });
      return;
    }

    // Get Azure DevOps configuration
    let azureDevOpsConfig = null;
    // Get Jira configuration
    let jiraConfig = null;
    
    try {
      const [azureResult, jiraResult] = await Promise.all([
        supabase
          .from('integration_configs')
          .select('config, enabled')
          .eq('project_id', projectId)
          .eq('integration_id', 'azure-devops')
          .single(),
        supabase
          .from('integration_configs')
          .select('config, enabled')
          .eq('project_id', projectId)
          .eq('integration_id', 'jira')
          .single()
      ]);

      if (!azureResult.error && azureResult.data?.enabled) {
        azureDevOpsConfig = azureResult.data.config;
      }

      if (!jiraResult.error && jiraResult.data?.enabled) {
        jiraConfig = jiraResult.data.config;
      }
    } catch (error) {
      console.error('Error loading integration configs:', error);
    }

    // Check if Azure DevOps is properly configured
    const isAzureConfigured = azureDevOpsConfig && 
      azureDevOpsConfig.organizationUrl && 
      azureDevOpsConfig.projectName && 
      azureDevOpsConfig.personalAccessToken;

    // Check if Jira is properly configured (config uses 'url' field)
    const isJiraConfigured = jiraConfig && 
      jiraConfig.url && 
      jiraConfig.projectKey && 
      jiraConfig.email && 
      jiraConfig.apiToken;

    if (!isAzureConfigured && !isJiraConfigured) {
      toast({
        title: "No Integration Configured",
        description: "Please configure Azure DevOps or Jira in the Integrations tab first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      let submissionResult;

      // Prefer Jira if configured, otherwise use Azure DevOps
      if (isJiraConfigured) {
        // Submit defect to Jira
        const { data, error } = await supabase.functions.invoke('jira-submit-defect', {
          body: {
            title: generatedReport.title,
            description: formData.scenario || generatedReport.title,
            stepsToReproduce: generatedReport.stepsToReproduce,
            expectedResult: generatedReport.expectedResult,
            actualResult: generatedReport.actualResult,
            priority: generatedReport.priority,
            severity: generatedReport.severity,
            jiraUrl: jiraConfig.url,
            projectKey: jiraConfig.projectKey,
            email: jiraConfig.email,
            apiToken: jiraConfig.apiToken
          }
        });

        if (error) {
          throw new Error(error.message);
        }

        if (!data.success) {
          throw new Error(data.error || 'Failed to submit defect to Jira');
        }

        submissionResult = {
          type: 'jira',
          id: data.issueKey,
          url: data.issueUrl,
          message: data.message
        };
      } else if (isAzureConfigured) {
        // Submit defect to Azure DevOps
        const { data, error } = await supabase.functions.invoke('azure-devops-submit-defect', {
          body: {
            title: generatedReport.title,
            description: formData.scenario || generatedReport.title,
            stepsToReproduce: generatedReport.stepsToReproduce,
            expectedResult: generatedReport.expectedResult,
            actualResult: generatedReport.actualResult,
            priority: generatedReport.priority,
            severity: generatedReport.severity,
            organizationUrl: azureDevOpsConfig.organizationUrl,
            projectName: azureDevOpsConfig.projectName,
            personalAccessToken: azureDevOpsConfig.personalAccessToken
          }
        });

        if (error) {
          throw new Error(error.message);
        }

        if (!data.success) {
          throw new Error(data.error || 'Failed to submit defect to Azure DevOps');
        }

        submissionResult = {
          type: 'azure-devops',
          id: data.workItemId,
          url: data.workItemUrl,
          message: data.message
        };
      }

      // Create a local defect record for display
      const newDefect: Defect = {
        id: submissionResult?.id?.toString() || Date.now().toString(),
        project_id: projectId,
        title: generatedReport.title,
        description: formData.scenario,
        steps_to_reproduce: generatedReport.stepsToReproduce.join('\n'),
        expected_result: generatedReport.expectedResult,
        actual_result: generatedReport.actualResult,
        priority: generatedReport.priority.toLowerCase().replace('p', '') as 'low' | 'medium' | 'high',
        status: 'open',
        source: 'ai',
        test_case_id: formData.testCaseId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      setDefects(prev => [newDefect, ...prev]);

      // Reset form and generated report
      setFormData({
        scenario: '',
        screenshot: undefined,
        logs: '',
        errorSnippet: '',
        testCaseId: ''
      });
      setGeneratedReport(null);
      setIsEditing(false);
      setShowCreateForm(false);
      setShowAzureDefects(true);

      const integrationName = submissionResult?.type === 'jira' ? 'Jira' : 'Azure DevOps';
      toast({
        title: "Success",
        description: `Defect submitted successfully to ${integrationName}! ID: ${submissionResult?.id}`,
      });

      // Reload defects to show updated list
      loadDefects();

    } catch (error) {
      console.error('Error submitting defect:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit defect",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle regenerate defect
  const handleRegenerateDefect = async () => {
    if (!selectedDefectForRegenerate) return;

    setGeneratingReport(true);
    try {
      // Mock regeneration for now
      const updatedReport: GeneratedDefectReport = {
        ...generatedReport!,
        title: `Updated: ${generatedReport?.title}`,
        stepsToReproduce: [
          'Updated step 1',
          'Updated step 2',
          'Updated step 3'
        ]
      };

      setGeneratedReport(updatedReport);
      setShowRegenerateModal(false);
      setCustomInstructions('');

      toast({
        title: "Success",
        description: "Defect report regenerated with custom instructions",
      });
    } catch (error) {
      console.error('Error regenerating defect:', error);
      toast({
        title: "Error",
        description: "Failed to regenerate defect",
        variant: "destructive",
      });
    } finally {
      setGeneratingReport(false);
    }
  };

  // Delete defect
  const deleteDefect = async (defectId: string) => {
    try {
      // Mock deletion since there's no defects table
      setDefects(prev => prev.filter(d => d.id !== defectId));

      toast({
        title: "Success",
        description: "Defect deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting defect:', error);
      toast({
        title: "Error",
        description: "Failed to delete defect",
        variant: "destructive",
      });
    }
  };

  // Sync defects from Azure DevOps
  const syncAzureDefects = async () => {
    if (!projectId) return;

    // Get Azure DevOps configuration
    let azureDevOpsConfig = null;
    
    try {
      const { data, error } = await supabase
        .from('integration_configs')
        .select('config, enabled')
        .eq('project_id', projectId)
        .eq('integration_id', 'azure-devops')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }

      if (data && data.enabled) {
        azureDevOpsConfig = data.config;
      }
    } catch (error) {
      console.error('Error loading Azure DevOps config:', error);
    }

    if (!azureDevOpsConfig || !azureDevOpsConfig.organizationUrl || !azureDevOpsConfig.projectName || !azureDevOpsConfig.personalAccessToken) {
      console.log("Azure DevOps not configured, skipping sync");
      return;
    }

    setIsSyncing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('azure-devops-defects', {
        body: {
          organizationUrl: azureDevOpsConfig.organizationUrl,
          projectName: azureDevOpsConfig.projectName,
          personalAccessToken: azureDevOpsConfig.personalAccessToken
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to sync defects from Azure DevOps');
      }

      setAzureDefects(data.defects || []);
      setAzureMetrics(data.metrics || {
        totalDefects: 0,
        openDefects: 0,
        closedDefects: 0,
        criticalDefects: 0,
        defectClosureRate: '0'
      });

      toast({
        title: "Success",
        description: `Successfully synced ${data.defects?.length || 0} defects from Azure DevOps`,
      });

    } catch (error) {
      console.error('Error syncing Azure DevOps defects:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to sync defects from Azure DevOps",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync defects from Jira
  const syncJiraDefects = async () => {
    if (!projectId) {
      console.log("No project ID, skipping Jira sync");
      return;
    }

    console.log("Starting Jira defects sync for project:", projectId);

    // Get Jira configuration
    let jiraConfig = null;
    
    try {
      const { data, error } = await supabase
        .from('integration_configs')
        .select('config, enabled')
        .eq('project_id', projectId)
        .eq('integration_id', 'jira')
        .maybeSingle();

      if (error) {
        console.error('Error fetching Jira config:', error);
        throw error;
      }

      if (data && data.enabled) {
        jiraConfig = data.config;
        console.log("Jira config found:", { 
          hasJiraUrl: !!jiraConfig.url, 
          hasEmail: !!jiraConfig.email,
          hasApiToken: !!jiraConfig.apiToken,
          hasProjectKey: !!jiraConfig.projectKey
        });
      } else {
        console.log("Jira integration not enabled or config not found");
      }
    } catch (error) {
      console.error('Error loading Jira config:', error);
      return;
    }

    if (!jiraConfig || !jiraConfig.url || !jiraConfig.email || !jiraConfig.apiToken || !jiraConfig.projectKey) {
      console.log("Jira not configured properly, skipping sync");
      return;
    }

    setIsSyncingJira(true);
    
    try {
      console.log("Invoking jira-integration edge function...");
      
      const { data, error } = await supabase.functions.invoke('jira-integration', {
        body: {
          jiraUrl: jiraConfig.url,
          email: jiraConfig.email,
          apiToken: jiraConfig.apiToken,
          projectKey: jiraConfig.projectKey
        }
      });

      console.log("Jira integration response:", { data, error });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message);
      }

      if (!data || !data.success) {
        console.error('Jira sync failed:', data);
        throw new Error(data?.error || 'Failed to sync defects from Jira');
      }

      console.log("Jira stories fetched:", data.stories?.length || 0);

      // Filter for Bug type issues only
      const bugs = (data.stories || []).filter((issue: any) => 
        issue.issueType === 'Bug' || issue.issueType === 'Defect'
      );

      console.log("Filtered bugs:", bugs.length);

      // Transform Jira bugs to defects format
      const transformedDefects = bugs.map((bug: any) => ({
        id: bug.id,
        jiraKey: bug.jiraKey,
        title: bug.title,
        description: bug.description,
        priority: bug.priority,
        status: bug.status,
        issueType: bug.issueType
      }));

      setJiraDefects(transformedDefects);

      // Calculate metrics
      const totalDefects = transformedDefects.length;
      const openDefects = transformedDefects.filter((d: any) => 
        ['To Do', 'Open', 'In Progress', 'Reopened'].includes(d.status)
      ).length;
      const closedDefects = transformedDefects.filter((d: any) => 
        ['Done', 'Closed', 'Resolved'].includes(d.status)
      ).length;
      const criticalDefects = transformedDefects.filter((d: any) => 
        ['Highest', 'Critical', 'Blocker'].includes(d.priority)
      ).length;

      setJiraMetrics({
        totalDefects,
        openDefects,
        closedDefects,
        criticalDefects
      });

      console.log("Jira metrics calculated:", { totalDefects, openDefects, closedDefects, criticalDefects });

      toast({
        title: "Success",
        description: `Successfully synced ${transformedDefects.length} defects from Jira`,
      });

    } catch (error) {
      console.error('Error syncing Jira defects:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to sync defects from Jira",
        variant: "destructive",
      });
    } finally {
      setIsSyncingJira(false);
    }
  };

  // Sync all defects
  const syncAllDefects = async () => {
    await Promise.all([syncAzureDefects(), syncJiraDefects()]);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-destructive text-destructive-foreground';
      case 'medium': return 'bg-warning text-warning-foreground';
      case 'low': return 'bg-success text-success-foreground';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-destructive text-destructive-foreground';
      case 'in-progress': return 'bg-warning text-warning-foreground';
      case 'resolved': return 'bg-success text-success-foreground';
      case 'closed': return 'bg-secondary text-secondary-foreground';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'ai': return <Bot className="h-3 w-3" />;
      default: return <FileText className="h-3 w-3" />;
    }
  };

  // Add step to steps to reproduce
  const addStep = () => {
    if (!generatedReport) return;
    setGeneratedReport({
      ...generatedReport,
      stepsToReproduce: [...generatedReport.stepsToReproduce, '']
    });
  };

  // Remove step from steps to reproduce
  const removeStep = (index: number) => {
    if (!generatedReport) return;
    setGeneratedReport({
      ...generatedReport,
      stepsToReproduce: generatedReport.stepsToReproduce.filter((_, i) => i !== index)
    });
  };

  // Update step in steps to reproduce
  const updateStep = (index: number, value: string) => {
    if (!generatedReport) return;
    const newSteps = [...generatedReport.stepsToReproduce];
    newSteps[index] = value;
    setGeneratedReport({
      ...generatedReport,
      stepsToReproduce: newSteps
    });
  };

  // Move step up
  const moveStepUp = (index: number) => {
    if (!generatedReport || index === 0) return;
    const newSteps = [...generatedReport.stepsToReproduce];
    [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
    setGeneratedReport({
      ...generatedReport,
      stepsToReproduce: newSteps
    });
  };

  // Move step down
  const moveStepDown = (index: number) => {
    if (!generatedReport || index === generatedReport.stepsToReproduce.length - 1) return;
    const newSteps = [...generatedReport.stepsToReproduce];
    [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
    setGeneratedReport({
      ...generatedReport,
      stepsToReproduce: newSteps
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Defects</h2>
          <p className="text-muted-foreground">
            Create Defect using AI
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onViewChange('integrations')}>
            <Settings className="mr-2 h-4 w-4" />
            Setup Integrations
          </Button>
          <Button 
            onClick={syncAllDefects} 
            disabled={isSyncing || isSyncingJira}
            variant="outline"
          >
            {(isSyncing || isSyncingJira) ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Defects
              </>
            )}
          </Button>
          <Button variant="gradient" onClick={() => {
            setShowCreateForm(true);
            setShowAzureDefects(false);
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Create Defect
          </Button>
        </div>
      </div>

     
      {/* Create Defect Form */}
      {showCreateForm && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Create Defect</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Input Fields */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="scenario">Defect Scenario / Description *</Label>
                <Textarea
                  id="scenario"
                  placeholder="Describe the defect scenario in detail..."
                  value={formData.scenario}
                  onChange={(e) => setFormData({ ...formData, scenario: e.target.value })}
                  rows={4}
                  className="mt-1"
                />
              </div>

                <div>
                  <Label htmlFor="screenshot">Screenshot of the Defect (Optional)</Label>
                  <div className="mt-1">
                    <Input
                      id="screenshot"
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('screenshot')?.click()}
                      className="w-48"
                    >
                      <Upload className="mr-2 h-3 w-3" />
                      {formData.screenshot ? 'Change File' : 'Upload Screenshot'}
                    </Button>
                    {formData.screenshot && (
                      <div className="mt-2 flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{formData.screenshot.name}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setFormData({ ...formData, screenshot: undefined })}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

              <div>
                <Label htmlFor="logs">Defect Logs (Optional)</Label>
                <Textarea
                  id="logs"
                  placeholder="Paste relevant log entries..."
                  value={formData.logs}
                  onChange={(e) => setFormData({ ...formData, logs: e.target.value })}
                  rows={4}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="errorSnippet">Error Snippet (Optional)</Label>
                <Textarea
                  id="errorSnippet"
                  placeholder="Paste error messages or code snippets..."
                  value={formData.errorSnippet}
                  onChange={(e) => setFormData({ ...formData, errorSnippet: e.target.value })}
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="testCaseId">Test Case ID (Optional)</Label>
                <Input
                  id="testCaseId"
                  placeholder="e.g., TC-001"
                  value={formData.testCaseId}
                  onChange={(e) => setFormData({ ...formData, testCaseId: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button 
                onClick={generateDefectReport} 
                disabled={generatingReport || !formData.scenario.trim()}
                size="sm"
                variant="gradient"
              >
                {generatingReport ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Generating Defect...
                  </>
                ) : (
                  <>
                    <Bot className="mr-2 h-4 w-4" />
                    Generate Defect
                  </>
                )}
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreateForm(false);
                  setShowAzureDefects(true);
                  setFormData({
                    scenario: '',
                    screenshot: undefined,
                    logs: '',
                    errorSnippet: '',
                    testCaseId: ''
                  });
                  setGeneratedReport(null);
                  setIsEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>

            {/* Generated Report */}
            {generatedReport && (
              <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-semibold">Generated Defect</h3>
                
                <div>
                  <Label htmlFor="defectTitle">Defect Title</Label>
                  <Input
                    id="defectTitle"
                    value={generatedReport.title}
                    onChange={(e) => setGeneratedReport({ ...generatedReport, title: e.target.value })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Steps to Reproduce</Label>
                  <div className="space-y-2 mt-1">
                    {generatedReport.stepsToReproduce.map((step, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground w-8">{index + 1}.</span>
                        <Input
                          value={step}
                          onChange={(e) => updateStep(index, e.target.value)}
                          className="flex-1"
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => moveStepUp(index)}
                            disabled={index === 0}
                          >
                            ↑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => moveStepDown(index)}
                            disabled={index === generatedReport.stepsToReproduce.length - 1}
                          >
                            ↓
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeStep(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={addStep}>
                      <Plus className="mr-2 h-3 w-3" />
                      Add Step
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="actualResult">Actual Results</Label>
                  <Textarea
                    id="actualResult"
                    value={generatedReport.actualResult}
                    onChange={(e) => setGeneratedReport({ ...generatedReport, actualResult: e.target.value })}
                    rows={3}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="expectedResult">Expected Results</Label>
                  <Textarea
                    id="expectedResult"
                    value={generatedReport.expectedResult}
                    onChange={(e) => setGeneratedReport({ ...generatedReport, expectedResult: e.target.value })}
                    rows={3}
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={generatedReport.priority}
                      onValueChange={(value: 'P1' | 'P2' | 'P3' | 'P4') => 
                        setGeneratedReport({ ...generatedReport, priority: value })
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="P1">P1 - Critical</SelectItem>
                        <SelectItem value="P2">P2 - High</SelectItem>
                        <SelectItem value="P3">P3 - Medium</SelectItem>
                        <SelectItem value="P4">P4 - Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="severity">Severity</Label>
                    <Select
                      value={generatedReport.severity}
                      onValueChange={(value: '1 - Critical' | '2 - High' | '3 - Medium' | '4 - Low') => 
                        setGeneratedReport({ ...generatedReport, severity: value })
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1 - Critical">1 - Critical</SelectItem>
                        <SelectItem value="2 - High">2 - High</SelectItem>
                        <SelectItem value="3 - Medium">3 - Medium</SelectItem>
                        <SelectItem value="4 - Low">4 - Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="finalScreenshot">Screenshot (Optional)</Label>
                  <div className="mt-1">
                    <Input
                      id="finalScreenshot"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setGeneratedReport({ ...generatedReport, screenshot: file });
                        }
                      }}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('finalScreenshot')?.click()}
                      className="w-full justify-center"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {generatedReport.screenshot ? generatedReport.screenshot.name : 'Upload Screenshot'}
                    </Button>
                    {generatedReport.screenshot && (
                      <div className="mt-2 flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{generatedReport.screenshot.name}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setGeneratedReport({ ...generatedReport, screenshot: undefined })}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                {!generatedReport && (
                  <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground mb-4">
                    Generate a defect report using AI first to enable submission
                  </div>
                )}
                <div className="flex gap-2 pt-4">
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setSelectedDefectForRegenerate('current');
                      setShowRegenerateModal(true);
                    }}
                    disabled={generatingReport || !generatedReport}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate Defect
                  </Button>
                  <Button 
                    onClick={submitDefect}
                    disabled={generatingReport || !generatedReport}
                    variant="gradient"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Submit Defect
                  </Button>
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search defects..."
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
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Source</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Azure DevOps Defects Section */}
      {showAzureDefects && azureDefects.length > 0 && (
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bug className="h-5 w-5" />
                Azure DevOps Defects
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Defects synced from Azure DevOps
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Azure DevOps Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{azureMetrics.totalDefects}</div>
              <div className="text-xs text-muted-foreground">Total Defects</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-warning">{azureMetrics.openDefects}</div>
              <div className="text-xs text-muted-foreground">Open Defects</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-success">{azureMetrics.closedDefects}</div>
              <div className="text-xs text-muted-foreground">Closed Defects</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-destructive">{azureMetrics.criticalDefects}</div>
              <div className="text-xs text-muted-foreground">Critical Defects</div>
            </div>
          </div>

          {/* Azure DevOps Defects List */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {azureDefects.map((defect) => (
                  <TableRow key={defect.id}>
                    <TableCell className="font-mono text-sm">{defect.azureDevOpsId}</TableCell>
                    <TableCell className="font-medium">{defect.title}</TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(defect.priority)}>
                        {defect.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{defect.severity}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(defect.state.toLowerCase())}>
                        {defect.state}
                      </Badge>
                    </TableCell>
                    <TableCell>{defect.assignedTo}</TableCell>
                    <TableCell>
                      {new Date(defect.createdDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          title="Analyze with AI"
                          onClick={() => analyzeDefectWithAI({
                            title: defect.title,
                            description: defect.description || defect.title,
                            stepsToReproduce: defect.reproSteps,
                          })}
                        >
                          <Brain className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          title="Open in Azure DevOps"
                          onClick={() => window.open(`${defect.organizationUrl}/_workitems/edit/${defect.azureDevOpsId}`, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Jira Defects Section */}
      {showAzureDefects && jiraDefects.length > 0 && (
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bug className="h-5 w-5" />
                Jira Defects
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Defects synced from Jira
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Jira Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{jiraMetrics.totalDefects}</div>
              <div className="text-xs text-muted-foreground">Total Defects</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-warning">{jiraMetrics.openDefects}</div>
              <div className="text-xs text-muted-foreground">Open Defects</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-success">{jiraMetrics.closedDefects}</div>
              <div className="text-xs text-muted-foreground">Closed Defects</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-destructive">{jiraMetrics.criticalDefects}</div>
              <div className="text-xs text-muted-foreground">Critical Defects</div>
            </div>
          </div>

          {/* Jira Defects List */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jiraDefects.map((defect) => (
                  <TableRow key={defect.id}>
                    <TableCell className="font-mono text-sm">{defect.jiraKey}</TableCell>
                    <TableCell className="font-medium max-w-xs truncate">{defect.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{defect.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{defect.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{defect.issueType}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          title="Analyze with AI"
                          onClick={() => analyzeDefectWithAI({
                            title: defect.title,
                            description: defect.description || defect.title,
                          })}
                        >
                          <Brain className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          title="Open in Jira"
                          onClick={() => {
                            // Get Jira URL from config to construct link
                            supabase
                              .from('integration_configs')
                              .select('config')
                              .eq('project_id', projectId)
                              .eq('integration_id', 'jira')
                              .single()
                              .then(({ data }) => {
                                const config = data?.config as any;
                                if (config?.url) {
                                  window.open(`${config.url}/browse/${defect.jiraKey}`, '_blank');
                                }
                              });
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card className="shadow-card">
          <CardContent className="py-8 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading defects...</p>
          </CardContent>
        </Card>
      )}


      {/* No Filtered Results */}
      {!isLoading && defects.length > 0 && filteredDefects.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="py-8 text-center">
            <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Defects Match Your Filters</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your search terms or filters to see more results.
            </p>
            <Button variant="outline" onClick={() => {
              setSearchTerm('');
              setPriorityFilter('all');
              setStatusFilter('all');
              setSourceFilter('all');
            }}>
              Clear All Filters
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Defects Table */}
      {!isLoading && filteredDefects.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Defects List</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Defect ID</TableHead>
                  <TableHead>Defect Title</TableHead>
                  <TableHead>Test Case ID</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDefects.map((defect) => (
                  <TableRow key={defect.id}>
                    <TableCell className="font-mono">
                      <div className="flex items-center gap-2">
                        {getSourceIcon(defect.source)}
                        {defect.id.slice(0, 8)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="truncate" title={defect.title}>
                        {defect.title}
                      </div>
                    </TableCell>
                    <TableCell>
                      {defect.test_case_id ? (
                        <Badge variant="outline">{defect.test_case_id}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(defect.priority)}>
                        {defect.priority.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(defect.status)}>
                        {defect.status.replace('-', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedDefectForRegenerate(defect.id);
                            setShowRegenerateModal(true);
                          }}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Defect</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this defect? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteDefect(defect.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <Button size="sm" variant="default">
                          <Send className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Regenerate Modal */}
      <Dialog open={showRegenerateModal} onOpenChange={setShowRegenerateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom Instructions (Optional)</DialogTitle>
            <DialogDescription>
              Provide additional instructions to customize the regenerated defect report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="e.g., Focus more on security aspects, include browser compatibility steps..."
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleRegenerateDefect} disabled={generatingReport}>
              {generatingReport ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <Bot className="mr-2 h-4 w-4" />
                  Regenerate Report
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Defect Analysis Dialog */}
      <Dialog open={showAnalysisDialog} onOpenChange={setShowAnalysisDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              AI Defect Analysis
            </DialogTitle>
            <DialogDescription>
              {selectedDefectForAnalysis?.title}
            </DialogDescription>
          </DialogHeader>
          
          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Analyzing defect with AI...</p>
            </div>
          ) : analysisResult ? (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                {/* Severity & Category */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      <span className="text-sm font-medium">Severity</span>
                    </div>
                    <Badge className={
                      analysisResult.severity === 'Critical' ? 'bg-red-500' :
                      analysisResult.severity === 'High' ? 'bg-orange-500' :
                      analysisResult.severity === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
                    }>
                      {analysisResult.severity}
                    </Badge>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Category</span>
                    </div>
                    <Badge variant="outline">{analysisResult.category}</Badge>
                  </div>
                </div>

                <Separator />

                {/* Root Cause */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Bug className="h-4 w-4 text-destructive" />
                    <span className="font-medium">Root Cause Analysis</span>
                  </div>
                  <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                    {analysisResult.rootCause}
                  </p>
                </div>

                {/* Suggested Fix */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-yellow-500" />
                    <span className="font-medium">Suggested Fix</span>
                  </div>
                  <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                    {analysisResult.suggestedFix}
                  </p>
                </div>

                {/* Similar Issues */}
                {analysisResult.similarIssues && analysisResult.similarIssues.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">Related Issues to Check</span>
                    </div>
                    <ul className="text-sm space-y-1 bg-muted/30 p-3 rounded-md">
                      {analysisResult.similarIssues.map((issue, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Test Coverage */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-500" />
                    <span className="font-medium">Suggested Test Coverage</span>
                  </div>
                  <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                    {analysisResult.testCoverage}
                  </p>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Brain className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No analysis available</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAnalysisDialog(false)}>
              Close
            </Button>
            {analysisResult && (
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(analysisResult, null, 2));
                  toast({
                    title: "Copied",
                    description: "Analysis copied to clipboard",
                  });
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                Copy Analysis
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Defect Report Approval Dialog */}
      <AIContentApprovalDialog
        open={showDefectApprovalDialog}
        onOpenChange={setShowDefectApprovalDialog}
        artifactType="defect_report"
        items={pendingDefectReport ? [{
          title: pendingDefectReport.title,
          description: `Priority: ${pendingDefectReport.priority}, Severity: ${pendingDefectReport.severity}`,
          stepsToReproduce: pendingDefectReport.stepsToReproduce,
          actualResult: pendingDefectReport.actualResult,
          expectedResult: pendingDefectReport.expectedResult,
        }] : []}
        confidence={pendingDefectConfidence}
        warnings={pendingDefectWarnings}
        onApprove={handleApproveDefectReport}
        onReject={handleRejectDefectReport}
        isProcessing={isProcessingDefectApproval}
        getItemTitle={(item) => item.title}
        getItemDescription={(item) => item.description}
        renderItem={(item, index, isEditing, onEdit) => (
          <div className="space-y-3 pt-3">
            {isEditing ? (
              <>
                <div>
                  <Label>Title</Label>
                  <Input value={item.title} onChange={(e) => onEdit("title", e.target.value)} />
                </div>
                <div>
                  <Label>Steps to Reproduce</Label>
                  <Textarea
                    value={item.stepsToReproduce?.join("\n") || ""}
                    onChange={(e) => onEdit("stepsToReproduce", e.target.value.split("\n"))}
                    rows={4}
                  />
                </div>
                <div>
                  <Label>Actual Result</Label>
                  <Textarea value={item.actualResult || ""} onChange={(e) => onEdit("actualResult", e.target.value)} />
                </div>
                <div>
                  <Label>Expected Result</Label>
                  <Textarea value={item.expectedResult || ""} onChange={(e) => onEdit("expectedResult", e.target.value)} />
                </div>
              </>
            ) : (
              <>
                {item.stepsToReproduce && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Steps to Reproduce</p>
                    <ol className="text-sm list-decimal list-inside space-y-1">
                      {item.stepsToReproduce.map((step: string, i: number) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {item.actualResult && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Actual Result</p>
                    <p className="text-sm">{item.actualResult}</p>
                  </div>
                )}
                {item.expectedResult && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Expected Result</p>
                    <p className="text-sm">{item.expectedResult}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      />
    </div>
  );
};