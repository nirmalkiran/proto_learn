import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun } from "docx";
import html2canvas from "html2canvas";
import {
  FileText,
  Download,
  Loader2,
  BarChart3,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Bug,
  Shield,
  TrendingUp,
  Save,
  FolderOpen,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface TestReportProps {
  projectId: string;
}

interface TestCase {
  id: string;
  title: string;
  status: "passed" | "failed" | "blocked" | "pending" | "not-run";
  automated: boolean;
  priority: "low" | "medium" | "high";
  userStoryTitle?: string;
}

interface SavedReport {
  id: string;
  report_name: string;
  report_content: string;
  statistics: any;
  project_name: string;
  report_type: string;
  azure_devops_data: any;
  jira_data: any;
  created_at: string;
  updated_at: string;
}

export const TestReport = ({ projectId }: TestReportProps) => {
  const [loading, setLoading] = useState(false);
  const [loadingDefects, setLoadingDefects] = useState(false);
  const [testReport, setTestReport] = useState<string>("");
  const [statistics, setStatistics] = useState<any>(null);
  const [projectName, setProjectName] = useState("");
  const [reportType, setReportType] = useState("executive");
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [includeDefects, setIncludeDefects] = useState(true);
  const [azureDevOpsData, setAzureDevOpsData] = useState<any>(null);
  const [jiraData, setJiraData] = useState<any>(null);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [loadingSavedReports, setLoadingSavedReports] = useState(false);
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveReportName, setSaveReportName] = useState("");
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);
  const { toast } = useToast();

  // Chart refs for capturing images
  const statusChartRef = useRef<HTMLDivElement>(null);
  const priorityChartRef = useRef<HTMLDivElement>(null);
  const defectChartRef = useRef<HTMLDivElement>(null);
  const automationChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadTestCases = async () => {
      try {
        const { data: testCasesData, error } = await supabase
          .from("test_cases")
          .select("id, title, status, automated, priority, steps, description, expected_result")
          .eq("project_id", projectId);

        if (error) {
          console.error("Error loading test cases:", error);
          toast({
            title: "Error",
            description: "Failed to load test cases from database",
            variant: "destructive",
          });
          return;
        }

        if (testCasesData) {
          // Cast the database data to match our interface
          const formattedTestCases: TestCase[] = testCasesData.map((tc) => ({
            id: tc.id,
            title: tc.title,
            status: tc.status as "passed" | "failed" | "blocked" | "pending" | "not-run",
            automated: tc.automated || false,
            priority: tc.priority as "low" | "medium" | "high",
            userStoryTitle: undefined, // Will be populated later if needed
          }));
          setTestCases(formattedTestCases);
        }
      } catch (error) {
        console.error("Error loading test cases:", error);
        toast({
          title: "Error",
          description: "Failed to load test cases from database",
          variant: "destructive",
        });
      }
    };

    const loadSavedReports = async () => {
      setLoadingSavedReports(true);
      try {
        const { data, error } = await supabase
          .from("saved_test_reports")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (data) {
          setSavedReports(data as SavedReport[]);
        }
      } catch (error) {
        console.error("Error loading saved reports:", error);
      } finally {
        setLoadingSavedReports(false);
      }
    };

    loadTestCases();
    loadSavedReports();
  }, [projectId, toast]);

  // Auto-load defects when component mounts
  useEffect(() => {
    const autoLoadDefects = async () => {
      const savedConfigs = await loadSavedConfigurations();
      const azureConfig = savedConfigs["azure-devops"];
      const jiraConfig = savedConfigs["jira"];

      // Auto-load Azure DevOps defects if configured
      if (
        azureConfig &&
        azureConfig.enabled &&
        azureConfig.organizationUrl &&
        azureConfig.projectName &&
        azureConfig.personalAccessToken
      ) {
        fetchAzureDevOpsDefects();
      }

      // Auto-load Jira defects if configured
      if (
        jiraConfig &&
        jiraConfig.enabled &&
        jiraConfig.url &&
        jiraConfig.email &&
        jiraConfig.projectKey &&
        jiraConfig.apiToken
      ) {
        fetchJiraDefects();
      }
    };

    autoLoadDefects();
  }, [projectId]);

  const fetchAzureDevOpsDefects = async () => {
    // Load configuration from database instead of localStorage
    const savedConfigs = await loadSavedConfigurations();
    const azureConfig = savedConfigs["azure-devops"];

    // Silently return if Azure DevOps is not configured - don't show error
    if (
      !azureConfig ||
      !azureConfig.enabled ||
      !azureConfig.organizationUrl ||
      !azureConfig.projectName ||
      !azureConfig.personalAccessToken
    ) {
      console.log("Azure DevOps integration not configured or missing required fields");
      toast({
        title: "Integration Not Configured",
        description: "Please configure Azure DevOps integration in the Integrations module first.",
        variant: "destructive",
      });
      return;
    }

    setLoadingDefects(true);

    try {
      const { data, error } = await supabase.functions.invoke("azure-devops-defects", {
        body: {
          organizationUrl: azureConfig.organizationUrl,
          projectName: azureConfig.projectName,
          personalAccessToken: azureConfig.personalAccessToken,
        },
      });

      if (error) throw error;

      if (data.success) {
        setAzureDevOpsData(data);
      } else {
        throw new Error(data.error || "Failed to fetch defects");
      }
    } catch (error: any) {
      console.error("Error fetching Azure DevOps defects:", error);

      // Provide more specific error messages
      let errorMessage = "Failed to fetch defects from Azure DevOps";
      if (error?.message?.includes("expired") || error?.message?.includes("Authentication failed")) {
        errorMessage =
          "Azure DevOps authentication failed. Your Personal Access Token may be expired. Please update it in the Integrations module.";
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoadingDefects(false);
    }
  };

  const fetchJiraDefects = async () => {
    // Load configuration from database
    const savedConfigs = await loadSavedConfigurations();
    const jiraConfig = savedConfigs["jira"];

    // Silently return if Jira is not configured
    if (
      !jiraConfig ||
      !jiraConfig.enabled ||
      !jiraConfig.url ||
      !jiraConfig.email ||
      !jiraConfig.projectKey ||
      !jiraConfig.apiToken
    ) {
      console.log("Jira integration not configured or missing required fields");
      return;
    }

    setLoadingDefects(true);

    try {
      const { data, error } = await supabase.functions.invoke("jira-integration", {
        body: {
          jiraUrl: jiraConfig.url,
          email: jiraConfig.email,
          apiToken: jiraConfig.apiToken,
          projectKey: jiraConfig.projectKey,
        },
      });

      if (error) throw error;

      if (data.success) {
        // Filter for bugs/defects and calculate metrics
        const issues = data.stories || [];
        const bugs = issues.filter((issue: any) => 
          issue.issueType?.toLowerCase().includes('bug') || 
          issue.issueType?.toLowerCase().includes('defect')
        );
        
        console.log('Jira stories fetched:', issues.length);
        console.log('Filtered bugs:', bugs.length);

        const openDefects = bugs.filter((bug: any) => 
          bug.status?.toLowerCase() !== 'closed' && 
          bug.status?.toLowerCase() !== 'resolved' &&
          bug.status?.toLowerCase() !== 'done'
        ).length;

        const closedDefects = bugs.length - openDefects;
        
        const criticalDefects = bugs.filter((bug: any) => 
          bug.priority?.toLowerCase() === 'highest' || 
          bug.priority?.toLowerCase() === 'critical'
        ).length;

        const defectClosureRate = bugs.length > 0 
          ? Math.round((closedDefects / bugs.length) * 100) 
          : 0;

        const jiraMetrics = {
          totalDefects: bugs.length,
          openDefects,
          closedDefects,
          criticalDefects,
          defectClosureRate,
        };

        console.log('Jira metrics calculated:', jiraMetrics);

        setJiraData({
          success: true,
          metrics: jiraMetrics,
          defects: bugs,
        });
      } else {
        throw new Error(data.error || "Failed to fetch defects from Jira");
      }
    } catch (error: any) {
      console.error("Error fetching Jira defects:", error);

      let errorMessage = "Failed to fetch defects from Jira";
      if (error?.message?.includes("Authentication failed") || error?.message?.includes("Unauthorized")) {
        errorMessage = "Jira authentication failed. Please check your API token in the Integrations module.";
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoadingDefects(false);
    }
  };

  const loadSavedConfigurations = async (): Promise<any> => {
    try {
      const { data, error } = await supabase
        .from("integration_configs")
        .select("integration_type, config, enabled")
        .eq("project_id", projectId);

      if (error || !data) {
        return {};
      }

      // Transform database records into the expected config format
      const configs: any = {};
      data.forEach((record: any) => {
        configs[record.integration_type] = {
          ...record.config,
          enabled: record.enabled,
        };
      });

      return configs;
    } catch {
      return {};
    }
  };

  const openSaveDialog = () => {
    if (!testReport || !projectName) {
      toast({
        title: "Error",
        description: "Please generate a report first and provide a project name",
        variant: "destructive",
      });
      return;
    }

    // Set default name
    setSaveReportName(`${projectName} - ${new Date().toLocaleDateString()}`);
    setShowSaveDialog(true);
  };

  const saveTestReport = async () => {
    if (!saveReportName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a report name",
        variant: "destructive",
      });
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id || "00000000-0000-0000-0000-000000000000";

      const reportData = {
        project_id: projectId,
        user_id: userId,
        name: saveReportName.trim(),
        report_name: saveReportName.trim(),
        report_content: testReport,
        statistics: statistics,
        project_name: projectName,
        report_type: reportType,
        azure_devops_data: azureDevOpsData,
        jira_data: jiraData,
      };

      if (currentReportId) {
        // Update existing report
        const { error } = await supabase.from("saved_test_reports").update(reportData).eq("id", currentReportId);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Report updated successfully",
        });
      } else {
        // Create new report
        const { data, error } = await supabase.from("saved_test_reports").insert([reportData]).select().single();

        if (error) throw error;

        setCurrentReportId(data.id);
        toast({
          title: "Success",
          description: "Report saved successfully",
        });
      }

      // Reload saved reports list
      const { data: updatedReports } = await supabase
        .from("saved_test_reports")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (updatedReports) {
        setSavedReports(updatedReports as SavedReport[]);
      }

      // Close dialog
      setShowSaveDialog(false);
    } catch (error: any) {
      console.error("Error saving report:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save report",
        variant: "destructive",
      });
    }
  };

  const loadReport = async (reportId: string) => {
    try {
      const { data, error } = await supabase.from("saved_test_reports").select("*").eq("id", reportId).single();

      if (error) throw error;

      if (data) {
        setTestReport(data.report_content);
        setStatistics(data.statistics);
        setProjectName(data.project_name);
        setReportType(data.report_type);
        setAzureDevOpsData(data.azure_devops_data);
        setJiraData(data.jira_data);
        setCurrentReportId(data.id);
        setIncludeDefects(!!data.azure_devops_data || !!data.jira_data);

        toast({
          title: "Success",
          description: "Report loaded successfully",
        });
      }
    } catch (error: any) {
      console.error("Error loading report:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load report",
        variant: "destructive",
      });
    }
  };

  const deleteReport = async (reportId: string) => {
    try {
      const { error } = await supabase.from("saved_test_reports").delete().eq("id", reportId);

      if (error) throw error;

      setSavedReports((prev) => prev.filter((r) => r.id !== reportId));

      if (currentReportId === reportId) {
        setCurrentReportId(null);
        setTestReport("");
        setStatistics(null);
      }

      toast({
        title: "Success",
        description: "Report deleted successfully",
      });
      
      setDeleteReportId(null);
    } catch (error: any) {
      console.error("Error deleting report:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete report",
        variant: "destructive",
      });
    }
  };

  const generateTestReport = async () => {
    if (!projectName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a project name",
        variant: "destructive",
      });
      return;
    }

    if (testCases.length === 0) {
      toast({
        title: "Error",
        description: "No test cases found. Please add test cases first.",
        variant: "destructive",
      });
      return;
    }

    // Load OpenAI configuration from database (same as UserStories)
    const savedConfigs = await loadSavedConfigurations();
    const openAIConfig = savedConfigs.openai;

    if (!openAIConfig || !openAIConfig.apiKey) {
      toast({
        title: "Error",
        description: "OpenAI API key not found. Please configure OpenAI integration first.",
        variant: "destructive",
      });
      return;
    }

    // Validate Azure OpenAI configuration if using Azure
    const isAzure = openAIConfig.endpoint && openAIConfig.endpoint.includes("openai.azure.com");
    if (isAzure) {
      if (!openAIConfig.deploymentId) {
        toast({
          title: "Error",
          description: "Azure OpenAI deployment ID is required. Please check your integration configuration.",
          variant: "destructive",
        });
        return;
      }

      // Ensure apiVersion is set
      if (!openAIConfig.apiVersion) {
        openAIConfig.apiVersion = "2024-02-15-preview";
      }

      console.log("Using Azure OpenAI:", {
        endpoint: openAIConfig.endpoint,
        deploymentId: openAIConfig.deploymentId,
        apiVersion: openAIConfig.apiVersion,
        hasApiKey: !!openAIConfig.apiKey,
      });
    } else {
      console.log("Using standard OpenAI API");
    }

    setLoading(true);
    try {
      // Prepare config for edge function - use consistent format with UserStories
      const configForEdgeFunction = isAzure
        ? {
            apiKey: openAIConfig.apiKey,
            endpoint: openAIConfig.endpoint,
            deploymentId: openAIConfig.deploymentId,
            apiVersion: openAIConfig.apiVersion || "2024-02-15-preview",
            model: openAIConfig.deploymentId, // Edge function checks this as fallback
          }
        : {
            apiKey: openAIConfig.apiKey,
            model: openAIConfig.model || "gpt-4o-mini",
          };

      const reportData: any = {
        testCases,
        projectName,
        reportType,
        projectId,
        openAIConfig: configForEdgeFunction,
        testExecutionData: {
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          endDate: new Date().toISOString().split("T")[0],
        },
      };

      // Include defect data if available and enabled
      if (includeDefects) {
        if (azureDevOpsData) {
          reportData.azureDevOpsData = azureDevOpsData;
        }
        if (jiraData) {
          reportData.jiraData = jiraData;
        }
      }

      const { data, error } = await supabase.functions.invoke("generate-test-report", {
        body: reportData,
      });

      if (error) throw error;

      setTestReport(data.testReport);
      setStatistics(data.statistics);
      setCurrentReportId(null); // Reset current report ID when generating new report
      toast({
        title: "Success",
        description: "Test report generated successfully!",
      });
    } catch (error: any) {
      console.error("Error generating test report:", error);

      // Show more specific error message if available
      let errorMessage = error?.message || "Failed to generate test report. Please try again.";

      // Provide helpful context for common errors
      if (errorMessage.includes("Azure OpenAI authentication failed")) {
        errorMessage =
          "Azure OpenAI authentication failed. Your API key may be expired or invalid. Please update your credentials in the Integrations tab.";
      } else if (errorMessage.includes("Access denied")) {
        errorMessage =
          "API authentication failed. Please verify your OpenAI/Azure OpenAI credentials in the Integrations tab are correct and not expired.";
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
        duration: 7000,
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadTestReport = async () => {
    if (!testReport) return;

    let toastId: any;
    try {
      toastId = toast({
        title: "Generating Document",
        description: "Creating Word document...",
      });

      // Helper function to capture chart as image
      const captureChart = async (element: HTMLElement | null): Promise<Buffer | null> => {
        if (!element) {
          console.log("Element not found for chart capture");
          return null;
        }

        try {
          console.log("Capturing chart element:", element);
          const canvas = await html2canvas(element, {
            backgroundColor: "#ffffff",
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: true,
            height: element.offsetHeight,
            width: element.offsetWidth,
          });

          return new Promise((resolve, reject) => {
            try {
              canvas.toBlob((blob) => {
                if (blob) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const arrayBuffer = reader.result as ArrayBuffer;
                    resolve(Buffer.from(arrayBuffer));
                  };
                  reader.onerror = () => reject(new Error("FileReader error"));
                  reader.readAsArrayBuffer(blob);
                } else {
                  console.warn("Canvas toBlob returned null");
                  resolve(null);
                }
              }, "image/png");
            } catch (error) {
              console.error("Error in canvas.toBlob:", error);
              reject(error);
            }
          });
        } catch (error) {
          console.error("Error capturing chart:", error);
          return null;
        }
      };

      console.log("Skipping chart capture for Word document");
      // Skip chart capture - charts will not be included in Word document
      const statusChartImage = null;
      const priorityChartImage = null;
      const defectChartImage = null;
      const automationChartImage = null;

      console.log("Chart capture skipped - Word document will not include charts");

      // Create Word document
      const docChildren: any[] = [
        new Paragraph({
          children: [
            new TextRun({
              text: `${projectName || "Project"} - Test Execution Report`,
              bold: true,
              size: 32,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Generated on: ${new Date().toLocaleDateString()}`,
              size: 24,
            }),
          ],
        }),
        new Paragraph({ text: "" }),

        // Test Statistics Section
        new Paragraph({
          children: [
            new TextRun({
              text: "Test Execution Summary",
              bold: true,
              size: 28,
            }),
          ],
        }),
        new Paragraph({ text: "" }),

        // Statistics Table
        new Table({
          width: {
            size: 100,
            type: WidthType.PERCENTAGE,
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph("Metric")],
                }),
                new TableCell({
                  children: [new Paragraph("Value")],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph("Total Test Cases")],
                }),
                new TableCell({
                  children: [new Paragraph(testCases.length.toString())],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph("Passed")],
                }),
                new TableCell({
                  children: [new Paragraph(testCases.filter((tc) => tc.status === "passed").length.toString())],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph("Failed")],
                }),
                new TableCell({
                  children: [new Paragraph(testCases.filter((tc) => tc.status === "failed").length.toString())],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph("Blocked")],
                }),
                new TableCell({
                  children: [new Paragraph(testCases.filter((tc) => tc.status === "blocked").length.toString())],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph("Pending")],
                }),
                new TableCell({
                  children: [new Paragraph(testCases.filter((tc) => tc.status === "pending").length.toString())],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph("Pass Rate")],
                }),
                new TableCell({
                  children: [
                    new Paragraph(
                      `${testCases.length > 0 ? Math.round((testCases.filter((tc) => tc.status === "passed").length / testCases.length) * 100) : 0}%`,
                    ),
                  ],
                }),
              ],
            }),
          ],
        }),

        new Paragraph({ text: "" }),
        new Paragraph({ text: "" }),
      ];

      // Add Test Status Distribution Chart
      if (statusChartImage) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Test Status Distribution",
                bold: true,
                size: 28,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new ImageRun({
                data: statusChartImage,
                transformation: {
                  width: 400,
                  height: 300,
                },
                type: "png",
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
        );
      }

      // Add Automation Distribution Chart
      if (automationChartImage) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Test Automation Distribution",
                bold: true,
                size: 28,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new ImageRun({
                data: automationChartImage,
                transformation: {
                  width: 400,
                  height: 300,
                },
                type: "png",
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
        );
      }

      // Add Jira Defect Analysis if available
      if (jiraData) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Jira Defect Analysis",
                bold: true,
                size: 28,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Table({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph("Defect Metric")],
                  }),
                  new TableCell({
                    children: [new Paragraph("Value")],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph("Total Defects")],
                  }),
                  new TableCell({
                    children: [new Paragraph(jiraData.metrics.totalDefects.toString())],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph("Open Defects")],
                  }),
                  new TableCell({
                    children: [new Paragraph(jiraData.metrics.openDefects.toString())],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph("Critical Defects")],
                  }),
                  new TableCell({
                    children: [new Paragraph(jiraData.metrics.criticalDefects.toString())],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph("Closure Rate")],
                  }),
                  new TableCell({
                    children: [new Paragraph(`${jiraData.metrics.defectClosureRate}%`)],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
        );
      }

      // Add Test Priority Distribution Chart
      if (priorityChartImage) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Test Priority Distribution",
                bold: true,
                size: 28,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new ImageRun({
                data: priorityChartImage,
                transformation: {
                  width: 400,
                  height: 300,
                },
                type: "png",
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
        );
      }

      // Add Azure DevOps Defect Analysis if available
      if (azureDevOpsData) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Azure DevOps Defect Analysis",
                bold: true,
                size: 28,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Table({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph("Defect Metric")],
                  }),
                  new TableCell({
                    children: [new Paragraph("Value")],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph("Total Defects")],
                  }),
                  new TableCell({
                    children: [new Paragraph(azureDevOpsData.metrics.totalDefects.toString())],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph("Open Defects")],
                  }),
                  new TableCell({
                    children: [new Paragraph(azureDevOpsData.metrics.openDefects.toString())],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph("Critical Defects")],
                  }),
                  new TableCell({
                    children: [new Paragraph(azureDevOpsData.metrics.criticalDefects.toString())],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph("Closure Rate")],
                  }),
                  new TableCell({
                    children: [new Paragraph(`${azureDevOpsData.metrics.defectClosureRate}%`)],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
        );

        // Add Defect Status Chart if available
        if (defectChartImage) {
          docChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: "Defect Status Distribution",
                  bold: true,
                  size: 28,
                }),
              ],
            }),
            new Paragraph({ text: "" }),
            new Paragraph({
              children: [
                new ImageRun({
                  data: defectChartImage,
                  transformation: {
                    width: 400,
                    height: 300,
                  },
                  type: "png",
                }),
              ],
            }),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "" }),
          );
        }
      }

      // Add AI Generated Report Content
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Detailed Analysis",
              bold: true,
              size: 28,
            }),
          ],
        }),
        new Paragraph({ text: "" }),
        ...testReport.split("\n").map(
          (line) =>
            new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  size: 24,
                }),
              ],
            }),
        ),
      );

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: docChildren,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName || "project"}-test-report.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Test report downloaded as Word document",
      });
    } catch (error) {
      console.error("Error creating Word document:", error);
      toast({
        title: "Error",
        description: "Failed to create Word document. Downloading as text instead.",
        variant: "destructive",
      });

      // Fallback to text download
      const blob = new Blob([testReport], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName || "project"}-test-report.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "passed":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "blocked":
        return <AlertCircle className="h-4 w-4 text-warning" />;
      case "pending":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "passed":
        return "text-success";
      case "failed":
        return "text-destructive";
      case "blocked":
        return "text-warning";
      case "pending":
        return "text-muted-foreground";
      default:
        return "text-muted-foreground";
    }
  };

  // Chart data preparation
  const testStatusData = [
    { name: "Passed", value: testCases.filter((tc) => tc.status === "passed").length, color: "hsl(var(--success))" },
    {
      name: "Failed",
      value: testCases.filter((tc) => tc.status === "failed").length,
      color: "hsl(var(--destructive))",
    },
    { name: "Blocked", value: testCases.filter((tc) => tc.status === "blocked").length, color: "hsl(var(--warning))" },
    {
      name: "Pending",
      value: testCases.filter((tc) => tc.status === "pending").length,
      color: "hsl(var(--muted-foreground))",
    },
  ].filter((item) => item.value > 0);

  const priorityData = [
    { name: "High", value: testCases.filter((tc) => tc.priority === "high").length },
    { name: "Medium", value: testCases.filter((tc) => tc.priority === "medium").length },
    { name: "Low", value: testCases.filter((tc) => tc.priority === "low").length },
  ].filter((item) => item.value > 0);

  // Automation distribution data
  const automatedCount = testCases.filter((tc) => tc.automated).length;
  const manualCount = testCases.length - automatedCount;
  const automationData = [
    { name: "Automated", value: automatedCount, color: "hsl(var(--primary))" },
    { name: "Manual", value: manualCount, color: "hsl(var(--secondary))" },
  ].filter((item) => item.value > 0);

  const azureDefectData = azureDevOpsData
    ? [
        { name: "Open", value: azureDevOpsData.metrics.openDefects },
        { name: "Closed", value: azureDevOpsData.metrics.totalDefects - azureDevOpsData.metrics.openDefects },
      ]
    : [];

  const jiraDefectData = jiraData
    ? [
        { name: "Open", value: jiraData.metrics.openDefects },
        { name: "Closed", value: jiraData.metrics.closedDefects },
      ]
    : [];

  const chartConfig = {
    passed: { label: "Passed", color: "hsl(var(--success))" },
    failed: { label: "Failed", color: "hsl(var(--destructive))" },
    blocked: { label: "Blocked", color: "hsl(var(--warning))" },
    pending: { label: "Pending", color: "hsl(var(--muted-foreground))" },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Test Report Generator</h2>
          <p className="text-muted-foreground">Generate comprehensive test execution reports</p>
        </div>
      </div>

      {/* Test Statistics Overview */}
      {testCases.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">Total Tests</p>
                  <p className="text-2xl font-bold">{testCases.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                <div>
                  <p className="text-sm font-medium">Passed</p>
                  <p className="text-2xl font-bold">{testCases.filter((tc) => tc.status === "passed").length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                <div>
                  <p className="text-sm font-medium">Failed</p>
                  <p className="text-2xl font-bold">{testCases.filter((tc) => tc.status === "failed").length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Not Run</p>
                  <p className="text-2xl font-bold">
                    {testCases.filter((tc) => tc.status === "not-run" || tc.status === "pending").length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-sm font-medium">Pass Rate</p>
                  <p className="text-2xl font-bold">
                    {testCases.length > 0
                      ? Math.round((testCases.filter((tc) => tc.status === "passed").length / testCases.length) * 100)
                      : 0}
                    %
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Azure DevOps Defect Metrics */}
      {azureDevOpsData && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="text-sm">Azure DevOps</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Bug className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-sm font-medium">Total Defects</p>
                    <p className="text-2xl font-bold">{azureDevOpsData.metrics.totalDefects}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <div>
                    <p className="text-sm font-medium">Open Defects</p>
                    <p className="text-2xl font-bold">{azureDevOpsData.metrics.openDefects}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <div>
                    <p className="text-sm font-medium">Closed Defects</p>
                    <p className="text-2xl font-bold">
                      {azureDevOpsData.metrics.totalDefects - azureDevOpsData.metrics.openDefects}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-sm font-medium">Critical</p>
                    <p className="text-2xl font-bold">{azureDevOpsData.metrics.criticalDefects}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <div>
                    <p className="text-sm font-medium">Closure Rate</p>
                    <p className="text-2xl font-bold">{azureDevOpsData.metrics.defectClosureRate}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Jira Defect Metrics */}
      {jiraData && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="text-sm">Jira</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Bug className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-sm font-medium">Total Defects</p>
                    <p className="text-2xl font-bold">{jiraData.metrics.totalDefects}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <div>
                    <p className="text-sm font-medium">Open Defects</p>
                    <p className="text-2xl font-bold">{jiraData.metrics.openDefects}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <div>
                    <p className="text-sm font-medium">Closed Defects</p>
                    <p className="text-2xl font-bold">{jiraData.metrics.closedDefects}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-sm font-medium">Critical</p>
                    <p className="text-2xl font-bold">{jiraData.metrics.criticalDefects}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <div>
                    <p className="text-sm font-medium">Closure Rate</p>
                    <p className="text-2xl font-bold">{jiraData.metrics.defectClosureRate}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Charts Section */}
      {testCases.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Test Priority Distribution Chart */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Test Priority Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div ref={priorityChartRef} className="w-full h-[250px] sm:h-[300px]">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={priorityData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>

          {/* Automation Distribution Chart */}
          {automationData.length > 0 && (
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Test Automation Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div ref={automationChartRef} className="w-full h-[250px] sm:h-[300px] flex justify-center">
                  <div className="w-full max-w-md">
                    <ChartContainer config={chartConfig} className="h-full w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={automationData}
                            cx="50%"
                            cy="50%"
                            outerRadius="80%"
                            dataKey="value"
                            label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                            labelLine={false}
                          >
                            {automationData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <ChartTooltip content={<ChartTooltipContent />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Azure DevOps Defect Status Chart */}
          {azureDevOpsData && azureDefectData.length > 0 && (
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bug className="h-5 w-5 text-primary" />
                  Azure DevOps Defects
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div ref={defectChartRef} className="w-full h-[250px] sm:h-[300px] flex justify-center">
                  <div className="w-full max-w-md">
                    <ChartContainer config={chartConfig} className="h-full w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={azureDefectData}
                            cx="50%"
                            cy="50%"
                            outerRadius="80%"
                            dataKey="value"
                            label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                            labelLine={false}
                          >
                            {automationData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <ChartTooltip content={<ChartTooltipContent />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Jira Defect Status Chart */}
          {jiraData && jiraDefectData.length > 0 && (
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bug className="h-5 w-5 text-primary" />
                  Jira Defects
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="w-full h-[250px] sm:h-[300px] flex justify-center">
                  <div className="w-full max-w-md">
                    <ChartContainer config={chartConfig} className="h-full w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={jiraDefectData}
                            cx="50%"
                            cy="50%"
                            outerRadius="80%"
                            dataKey="value"
                            label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                            labelLine={false}
                          >
                            {automationData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <ChartTooltip content={<ChartTooltipContent />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Saved Reports */}
      {savedReports.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              Saved Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {loadingSavedReports ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                savedReports.map((report) => (
                  <div
                    key={report.id}
                    className={`flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors ${
                      currentReportId === report.id ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex-1">
                      <h4 className="font-medium">{report.report_name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {new Date(report.created_at).toLocaleDateString()} • {report.report_type}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => loadReport(report.id)}>
                        <FolderOpen className="h-4 w-4 mr-1" />
                        Load
                      </Button>
                      <AlertDialog open={deleteReportId === report.id} onOpenChange={(open) => setDeleteReportId(open ? report.id : null)}>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Report</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this report? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteReport(report.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Report Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                placeholder="Enter project name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reportType">Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="executive">Executive Summary</SelectItem>
                  <SelectItem value="detailed">Detailed Analysis</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={generateTestReport} disabled={loading} className="w-full md:w-auto">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Report...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Generate Test Report
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Test Report */}
      {testReport && (
        <Card className="shadow-card">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-success" />
                Generated Test Report
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={openSaveDialog}>
                  <Save className="mr-2 h-4 w-4" />
                  {currentReportId ? "Update Report" : "Save Report"}
                </Button>
                <Button variant="outline" onClick={downloadTestReport}>
                  <Download className="mr-2 h-4 w-4" />
                  Download as Word
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {statistics && (
              <div className="mb-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-semibold mb-2">Quick Statistics</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>
                    Total: <span className="font-bold">{statistics.totalTests}</span>
                  </div>
                  <div>
                    Passed: <span className="font-bold text-success">{statistics.passedTests}</span>
                  </div>
                  <div>
                    Failed: <span className="font-bold text-destructive">{statistics.failedTests}</span>
                  </div>
                  <div>
                    Blocked: <span className="font-bold text-warning">{statistics.blockedTests}</span>
                  </div>
                  <div>
                    Pass Rate: <span className="font-bold">{statistics.passRate}%</span>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-muted/50 p-4 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm font-mono overflow-auto max-h-96">{testReport}</pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Report Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentReportId ? "Update Test Report" : "Save Test Report"}</DialogTitle>
            <DialogDescription>
              {currentReportId
                ? "Update the name for this test report."
                : "Enter a name for this test report to save it for later access."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reportName">Report Name</Label>
              <Input
                id="reportName"
                placeholder="e.g., Sprint 1 Test Report"
                value={saveReportName}
                onChange={(e) => setSaveReportName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveTestReport();
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveTestReport}>
              <Save className="mr-2 h-4 w-4" />
              {currentReportId ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
