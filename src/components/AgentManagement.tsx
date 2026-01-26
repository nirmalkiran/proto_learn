import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Server,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  Copy,
  Settings,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  History,
  Download,
  MoreHorizontal,
  Ban,
  Play,
  RotateCcw,
  Smartphone,
  HelpCircle,
  PlayCircle,
  Monitor,
  Terminal,
  Zap,
  ShieldCheck,
  TrendingUp,
  LayoutGrid,
  Info,
  AlertCircle,
  PlusCircle,
  ChevronRight,
  ArrowRight,
  CheckCircle,
  ZapOff
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import JSZip from "jszip";

interface AgentManagementProps {
  projectId: string;
}

interface Agent {
  id: string;
  agent_id: string;
  agent_name: string;
  status: string;
  last_heartbeat: string | null;
  capacity: number;
  running_jobs: number;
  browsers: string[] | null;
  config: any;
  created_at: string;
}

interface JobQueueItem {
  id: string;
  run_id: string;
  test_id: string;
  status: string;
  priority: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  agent_id: string | null;
  retries: number;
  max_retries: number;
}

interface ExecutionResult {
  id: string;
  job_id: string;
  status: string;
  passed_steps: number;
  failed_steps: number;
  total_steps: number;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  screenshots: any;
  video_url: string | null;
  trace_url: string | null;
}

export const AgentManagement = ({ projectId }: AgentManagementProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"agents" | "jobs" | "history">("agents");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [jobs, setJobs] = useState<JobQueueItem[]>([]);
  const [executionResults, setExecutionResults] = useState<ExecutionResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showAgentDetails, setShowAgentDetails] = useState(false);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [newAgentToken, setNewAgentToken] = useState<string | null>(null);
  const [jobToDelete, setJobToDelete] = useState<JobQueueItem | null>(null);

  // Register form states
  const [registerAgentName, setRegisterAgentName] = useState("");
  const [registerAgentId, setRegisterAgentId] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  // Mobile agent status
  const [mobileAgentStatus, setMobileAgentStatus] = useState<{
    running: boolean;
    uptime: number;
    port: number;
    lastChecked: Date | null;
  }>({
    running: false,
    uptime: 0,
    port: 3001,
    lastChecked: null
  });

  const [mobileDetails, setMobileDetails] = useState<{
    devices: any[];
    physicalDevice: boolean;
    appium: boolean;
    emulator: boolean;
  }>({
    devices: [],
    physicalDevice: false,
    appium: false,
    emulator: false
  });

  const [showMobileWizard, setShowMobileWizard] = useState(false);
  const [mobileWizardStep, setMobileWizardStep] = useState(1);

  // Browser Agent States
  const [isBrowserAgentActive, setIsBrowserAgentActive] = useState(false);
  const [browserAgentId] = useState(() => `browser-${Math.random().toString(36).substr(2, 9)}`);
  const [browserAgentStatus, setBrowserAgentStatus] = useState<string>("idle");

  useEffect(() => {
    if (!isBrowserAgentActive) return;
    let isMounted = true;
    const heartbeat = async () => {
      if (!isMounted) return;
      try {
        await supabase.functions.invoke("agent-api", {
          body: {
            action: "heartbeat",
            agentId: browserAgentId,
            status: browserAgentStatus === "busy" ? "busy" : "online",
            capacity: 1,
            browsers: ["chrome"],
            system_info: { browser: navigator.userAgent, platform: navigator.platform }
          },
        });
      } catch (err) {
        console.error("Browser Agent heartbeat failed:", err);
      }
    };

    const poll = async () => {
      if (!isMounted || browserAgentStatus === "busy") return;
      try {
        const { data, error } = await supabase.functions.invoke("agent-api", {
          body: { action: "poll", agentId: browserAgentId },
        });

        if (error || !data?.jobs?.length) return;

        const job = data.jobs[0];
        setBrowserAgentStatus("busy");

        // Mark job as started
        await supabase.functions.invoke("agent-api", {
          body: { action: "start", jobId: job.id, agentId: browserAgentId },
        });

        // Simulate execution (In a real scenario, this would execute script/commands in the current tab)
        setTimeout(async () => {
          if (!isMounted) return;
          await supabase.functions.invoke("agent-api", {
            body: {
              action: "result",
              jobId: job.id,
              status: "completed",
              result_data: { message: "Successfully executed in Browser Agent (Simulated)" }
            },
          });
          setBrowserAgentStatus("idle");
        }, 3000);
      } catch (err) {
        console.error("Browser Agent poll failed:", err);
      }
    };

    const hbInterval = setInterval(heartbeat, 30000);
    const pInterval = setInterval(poll, 5000);
    heartbeat();

    return () => {
      isMounted = false;
      clearInterval(hbInterval);
      clearInterval(pInterval);
    };
  }, [isBrowserAgentActive, browserAgentId, browserAgentStatus]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [projectId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load mobile agent status first to ensure it's fresh
      await checkMobileAgentStatus();
      // Then load other data
      await Promise.all([loadAgents(), loadJobs(), loadExecutionResults()]);
    } catch (error) {
      console.error("Error loading agent data:", error);
      toast({
        title: "Error",
        description: "Failed to load agent data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadAgents = async () => {
    const localAgents: Agent[] = [];

    if (isBrowserAgentActive) {
      localAgents.push({
        id: browserAgentId,
        agent_id: browserAgentId,
        agent_name: "Local Browser Agent",
        status: browserAgentStatus === "busy" ? "busy" : "online",
        last_heartbeat: new Date().toISOString(),
        capacity: 1,
        running_jobs: browserAgentStatus === "busy" ? 1 : 0,
        browsers: ["chrome"],
        config: {},
        created_at: new Date().toISOString()
      });
    }

    setAgents(localAgents);
  };

  const loadJobs = async () => {
    // TODO: agent_job_queue table does not exist yet - using empty array
    setJobs([]);
  };

  const loadExecutionResults = async () => {
    // TODO: agent_execution_results table does not exist yet - using empty array
    setExecutionResults([]);
  };

  const checkMobileAgentStatus = async () => {
    try {
      const res = await fetch('http://localhost:3001/setup/status', {
        signal: AbortSignal.timeout(5000) // Increased timeout to 5 seconds
      });
      if (res.ok) {
        const data = await res.json();
        setMobileAgentStatus({
          running: true,
          uptime: data.uptime || 0,
          port: data.port || 3001,
          lastChecked: new Date()
        });
        setMobileDetails({
          devices: data.devices || [],
          physicalDevice: data.physicalDevice || false,
          appium: data.appium || false,
          emulator: data.emulator || false
        });
      } else {
        throw new Error('Not running');
      }
    } catch {
      setMobileAgentStatus(prev => ({
        ...prev,
        running: false,
        lastChecked: new Date()
      }));
      setMobileDetails({
        devices: [],
        physicalDevice: false,
        appium: false,
        emulator: false
      });
    }
  };

  const handleRegisterAgent = async () => {
    if (!registerAgentName.trim() || !registerAgentId.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide both agent name and ID",
        variant: "destructive",
      });
      return;
    }

    setIsRegistering(true);
    try {
      const response = await supabase.functions.invoke("agent-api", {
        body: {
          action: "register",
          projectId,
          agentId: registerAgentId,
          agentName: registerAgentName,
          browsers: ["chromium"],
          capacity: 3,
        },
      });

      if (response.error) throw response.error;

      const data = response.data;
      const token = data.apiToken || data.api_key;

      if (token) {
        setNewAgentToken(token);
        toast({
          title: "Agent Registered",
          description: "Save the API token - it won't be shown again!",
        });
        await loadAgents();
      } else if (data.error) {
        throw new Error(data.error);
      } else {
        throw new Error("No API token returned from server");
      }
    } catch (error: any) {
      console.error("Registration error:", error);
      toast({
        title: "Registration Failed",
        description: error.message || "Failed to register agent",
        variant: "destructive",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDeleteAgent = async (agent: Agent) => {
    try {
      const { error } = await supabase.from("self_hosted_agents").delete().eq("id", agent.id);

      if (error) throw error;

      toast({
        title: "Agent Deleted",
        description: `Agent "${agent.agent_name}" has been removed`,
      });
      await loadAgents();
      setAgentToDelete(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete agent",
        variant: "destructive",
      });
    }
  };

  const handleDeleteJob = async (job: JobQueueItem) => {
    try {
      const { error } = await supabase.from("agent_job_queue").delete().eq("id", job.id);

      if (error) throw error;

      toast({
        title: "Job Deleted",
        description: `Job "${job.run_id}" has been removed`,
      });
      await loadJobs();
      setJobToDelete(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete job",
        variant: "destructive",
      });
    }
  };

  const handleChangeJobStatus = async (job: JobQueueItem, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };

      if (newStatus === "cancelled") {
        updateData.completed_at = new Date().toISOString();
      } else if (newStatus === "pending") {
        updateData.started_at = null;
        updateData.completed_at = null;
        updateData.agent_id = null;
      }

      const { error } = await supabase.from("agent_job_queue").update(updateData).eq("id", job.id);

      if (error) throw error;

      toast({
        title: "Status Updated",
        description: `Job "${job.run_id}" status changed to ${newStatus}`,
      });
      await loadJobs();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update job status",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Token copied to clipboard",
    });
  };

  const downloadAgentPackage = async (agentToken?: string) => {
    const zip = new JSZip();
    const token = agentToken || newAgentToken || "YOUR_API_TOKEN_HERE";

    try {
      // Fetch the latest files from the public folder
      const [agentJsResponse, packageJsonResponse, readmeResponse, dockerfileResponse] = await Promise.all([
        fetch('/agent-package/agent.js'),
        fetch('/agent-package/package.json'),
        fetch('/agent-package/README.md'),
        fetch('/agent-package/Dockerfile'),
      ]);

      if (!agentJsResponse.ok || !packageJsonResponse.ok || !readmeResponse.ok || !dockerfileResponse.ok) {
        throw new Error('Failed to fetch agent package files');
      }

      let agentJs = await agentJsResponse.text();
      const packageJson = await packageJsonResponse.text();
      const readme = await readmeResponse.text();
      const dockerfile = await dockerfileResponse.text();

      // Replace the placeholder token and base URL in agent.js
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://vqoxcgbilzqxmxuxwicr.supabase.co";
      const apiBaseUrl = `${supabaseUrl}/functions/v1/agent-api`;

      agentJs = agentJs.replace(
        /API_TOKEN:\s*process\.env\.WISPR_API_TOKEN\s*\|\|\s*['"][^'"]*['"]/,
        `API_TOKEN: process.env.WISPR_API_TOKEN || '${token}'`
      );

      agentJs = agentJs.replace(
        /API_BASE_URL:\s*['"][^'"]*['"]/,
        `API_BASE_URL: "${apiBaseUrl}"`
      );

      zip.file("package.json", packageJson);
      zip.file("agent.js", agentJs);
      zip.file("README.md", readme);
      zip.file("Dockerfile", dockerfile);

      // Add Mobile Automation components directly into the package structure
      const mobileFiles = [
        "config.js",
        "controllers/appium-controller.js",
        "controllers/device-controller.js",
        "controllers/emulator-controller.js",
        "services/recording-service.js",
        "services/replay-engine.js",
        "services/screenshot-service.js",
        "utils/adb-utils.js",
        "utils/process-manager.js",
      ];

      const mobileResponses = await Promise.all(
        mobileFiles.map(file => fetch(`/agent-package/${file}`))
      );

      for (let i = 0; i < mobileFiles.length; i++) {
        if (mobileResponses[i].ok) {
          const content = await mobileResponses[i].text();
          // We place these directly in the zip root (so they end up in controllers/, services/, etc.)
          zip.file(mobileFiles[i], content);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wispr-agent.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download Started",
        description: "Agent package downloaded. Follow the README to set up.",
      });
    } catch (error) {
      console.error('Error downloading agent package:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download agent package. Please try again.",
        variant: "destructive",
      });
    }
  };

  const isHeartbeatStale = (lastHeartbeat: string | null): boolean => {
    if (!lastHeartbeat) return true;
    const heartbeatTime = new Date(lastHeartbeat).getTime();
    const now = Date.now();
    const twoMinutesMs = 2 * 60 * 1000; // 2 minutes threshold
    return now - heartbeatTime > twoMinutesMs;
  };

  const getStatusBadge = (status: string, lastHeartbeat?: string | null) => {
    // If heartbeat is stale, show as offline regardless of stored status
    const effectiveStatus = lastHeartbeat !== undefined && isHeartbeatStale(lastHeartbeat) && status !== "offline"
      ? "offline"
      : status;

    switch (effectiveStatus) {
      case "online":
        return (
          <Badge className="bg-green-500/20 text-green-500 border-green-500/50">
            <Wifi className="h-3 w-3 mr-1" />
            Online
          </Badge>
        );
      case "busy":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Busy
          </Badge>
        );
      case "offline":
        return (
          <Badge className="bg-muted text-muted-foreground">
            <WifiOff className="h-3 w-3 mr-1" />
            Offline
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-500/20 text-green-500 border-green-500/50">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "running":
        return (
          <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/50">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Running
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-500/20 text-red-500 border-red-500/50">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline">
            <XCircle className="h-3 w-3 mr-1" />
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const onlineAgents = agents.filter((a) => (a.status === "online" || a.status === "busy") && !isHeartbeatStale(a.last_heartbeat));
  const pendingJobs = jobs.filter((j) => j.status === "pending");
  const runningJobs = jobs.filter((j) => j.status === "running");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Agents</p>
                <p className="text-2xl font-bold">{agents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-none shadow-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
          <div className="absolute top-0 right-0 p-4 opacity-20">
            <Cpu className="h-16 w-16" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-100">
              <Zap className="h-4 w-4" />
              Operational Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tracking-tight">{onlineAgents.length}</div>
            <p className="text-xs mt-1 text-blue-100/80 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {agents.length} agents total in cluster
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-none shadow-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
          <div className="absolute top-0 right-0 p-4 opacity-20">
            <ShieldCheck className="h-16 w-16" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-emerald-100">
              <Activity className="h-4 w-4" />
              System Workload
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tracking-tight">{runningJobs.length}</div>
            <p className="text-xs mt-1 text-emerald-100/80">
              {pendingJobs.length} jobs in queue waiting
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-none shadow-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">
          <div className="absolute top-0 right-0 p-4 opacity-20">
            <Activity className="h-16 w-16" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-100">
              <History className="h-4 w-4" />
              Execution Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tracking-tight">
              {executionResults.length > 0
                ? `${Math.round((executionResults.filter(r => r.status === 'passed').length / executionResults.length) * 100)}%`
                : '100%'}
            </div>
            <p className="text-xs mt-1 text-amber-100/80">
              Success rate across recent runs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Connectivity Hub & Onboarding Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2 overflow-hidden border-primary/10 shadow-md">
          <CardHeader className="bg-muted/30 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PlayCircle className="h-5 w-5 text-primary" />
                  Quick Start Guide
                </CardTitle>
                <CardDescription>Get your first agent up and running in minutes</CardDescription>
              </div>
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                Hybrid Mode
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">1</div>
                <div>
                  <h4 className="font-semibold text-sm mb-1 text-foreground">Register your Agent</h4>
                  <p className="text-xs text-muted-foreground mb-3">Create a unique identifier and security token for your instance.</p>
                  <Button size="sm" onClick={() => setShowRegisterDialog(true)} className="h-8 gap-2">
                    <PlusCircle className="h-3.5 w-3.5" />
                    New Agent identity
                  </Button>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">2</div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1 text-foreground">Deploy locally</h4>
                  <p className="text-xs text-muted-foreground mb-3">Use our frictionless one-liner to download and start the agent.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-primary/20 hover:bg-primary/5 text-primary"
                      onClick={() => {
                        const origin = window.location.origin;
                        const token = newAgentToken || 'YOUR_TOKEN';
                        const cmd = `powershell -ExecutionPolicy ByPass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; iwr ${origin}/setup.ps1 -OutFile setup.ps1; .\\setup.ps1 -Token ${token} -Url ${origin}"`;
                        copyToClipboard(cmd);
                        toast({ title: "Windows Command Copied", description: "Paste into PowerShell to start." });
                      }}>
                      <Terminal className="h-3.5 w-3.5 mr-2" />
                      Windows Shell
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-primary/20 hover:bg-primary/5 text-primary"
                      onClick={() => {
                        const origin = window.location.origin;
                        const token = newAgentToken || 'YOUR_TOKEN';
                        const cmd = `curl -sSL ${origin}/setup.sh | bash -s -- ${token} ${origin}`;
                        copyToClipboard(cmd);
                        toast({ title: "Linux/macOS Command Copied", description: "Paste into Terminal to start." });
                      }}
                    >
                      <LayoutGrid className="h-3.5 w-3.5 mr-2" />
                      Linux/macOS
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">3</div>
                <div>
                  <h4 className="font-semibold text-sm mb-1 text-foreground">Verify Connectivity</h4>
                  <p className="text-xs text-muted-foreground">The agent will heartbeat to this dashboard. Status will turn green below.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/10 shadow-md">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              Runtime Config
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Token</Label>
              <div className="flex items-center justify-between p-2 rounded bg-muted/50 border">
                <code className="text-[11px] truncate max-w-[150px]">{newAgentToken || '••••••••••••••••'}</code>
                {newAgentToken && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(newAgentToken)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Server Protocol</Label>
              <p className="text-xs font-medium flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                Supabase Edge API (v1)
              </p>
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <Smartphone className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <p className="text-[11px] font-semibold leading-none mb-1">Mobile Native Support</p>
                <p className="text-[10px] text-muted-foreground">ADB/Appium capability enabled.</p>
              </div>
            </div>

            <div className="pt-2">
              <Button variant="ghost" size="sm" className="w-full justify-start text-[11px] h-8 text-muted-foreground hover:text-primary" onClick={() => downloadAgentPackage()}>
                <Download className="h-3 w-3 mr-2" />
                Download Source Code (.zip)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      <Tabs defaultValue={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="agents" className="gap-2">
              <Server className="h-4 w-4" />
              Infrastructure
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-2">
              <Activity className="h-4 w-4" />
              Active Queue
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              Execution History
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center space-x-2 mr-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10">
              <span className="text-[11px] font-medium text-primary">Local Browser Agent</span>
              <Button
                variant={isBrowserAgentActive ? "default" : "outline"}
                size="sm"
                className={`h-6 px-3 text-[10px] ${isBrowserAgentActive ? 'bg-green-600 hover:bg-green-700' : ''}`}
                onClick={() => setIsBrowserAgentActive(!isBrowserAgentActive)}
              >
                {isBrowserAgentActive ? "Active" : "Activate"}
              </Button>
            </div>
            <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => loadData()} disabled={isLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          </div>
        </div>

        {/* Agents Tab */}
        <TabsContent value="agents">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Capabilities</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Mobile Automation Helper (Built-in) */}
                <TableRow className="bg-primary/5 hover:bg-primary/10 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-md">
                        <Smartphone className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-primary">Mobile Automation Helper</p>
                        <p className="text-[10px] text-muted-foreground font-mono">localhost:3001</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Built-in</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {mobileAgentStatus.running ? (
                        <Badge className="bg-green-500/20 text-green-600 border-green-500/30 font-medium h-5">
                          <Wifi className="h-3 w-3 mr-1" />
                          Online
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground font-medium grayscale h-5">
                          <WifiOff className="h-3 w-3 mr-1" />
                          Offline
                        </Badge>
                      )}
                      {mobileAgentStatus.running && (
                        <div className="flex gap-1 mt-1">
                          <Badge variant="outline" className={`text-[8px] h-3 px-1 ${mobileDetails.appium ? 'text-green-600 border-green-200' : 'text-red-400 border-red-100 opacity-50'}`}>
                            APPIUM
                          </Badge>
                          <Badge variant="outline" className={`text-[8px] h-3 px-1 ${mobileDetails.devices.length > 0 ? 'text-green-600 border-green-200' : 'text-red-400 border-red-100 opacity-50'}`}>
                            ADB
                          </Badge>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-[10px]">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Smartphone className="h-3 w-3 text-muted-foreground" />
                        <span>{mobileDetails.devices.length} Devices</span>
                      </div>
                      {mobileDetails.physicalDevice && (
                        <span className="text-green-500 flex items-center gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Physical Connected
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 py-0">Android</Badge>
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 py-0">ADB</Badge>
                      {mobileDetails.emulator && <Badge variant="outline" className="text-[9px] h-4 px-1.5 py-0 bg-blue-50/50">Emulator</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground font-medium">
                      {mobileAgentStatus.lastChecked ? formatDistanceToNow(mobileAgentStatus.lastChecked, { addSuffix: true }) : "Never"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs gap-1"
                        onClick={() => {
                          setMobileWizardStep(1);
                          setShowMobileWizard(true);
                        }}
                      >
                        <Settings className="h-3.5 w-3.5" />
                        Configure
                      </Button>
                      {mobileAgentStatus.running && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs gap-1 text-primary"
                          onClick={() => {
                            navigate(`/project/${projectId}/mobile-no-code-automation`);
                            toast({
                              title: "Mobile Dashboard",
                              description: "Opening real-time mobile automation dashboard...",
                            });
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>

                {/* Self-hosted Agents */}
                {agents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-md">
                          <Server className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{agent.agent_name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{agent.agent_id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">Self-Hosted</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(agent.status, agent.last_heartbeat)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-xs">
                        <Cpu className="h-3 w-3 text-muted-foreground" />
                        <span>
                          {agent.running_jobs}/{agent.capacity}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {(agent.browsers || []).map((browser) => (
                          <Badge key={browser} variant="outline" className="text-[9px] h-4 px-1.5 py-0">
                            {browser}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {agent.last_heartbeat ? (
                        <span className="text-xs text-muted-foreground font-medium">
                          {formatDistanceToNow(new Date(agent.last_heartbeat), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedAgent(agent);
                            setShowAgentDetails(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setAgentToDelete(agent)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {agents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-6">
                  <Monitor className="h-10 w-10 text-primary/40" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No Active Cluster Instances</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-8">
                  You haven't connected any self-hosted worker nodes yet.
                  Follow the <span className="text-primary font-medium">Quick Start Guide</span> above to link your local infrastructure.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowRegisterDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Register New Identity
                  </Button>
                </div>

                <div className="mt-12 p-4 rounded-xl border border-dashed bg-muted/30 max-w-lg w-full flex items-start gap-4 text-left">
                  <Zap className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Architecture Tip</p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Each worker node operates in an isolated environment. You can scale horizontally by adding more
                      instances on different machines or containers.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs">
          <ScrollArea className="h-[400px]">
            {jobs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No Jobs in Queue</h3>
                <p>Jobs will appear here when tests are scheduled for execution.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-sm">{job.run_id}</TableCell>
                      <TableCell>{getJobStatusBadge(job.status)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{job.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        {job.retries}/{job.max_retries}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {job.started_at ? formatDistanceToNow(new Date(job.started_at), { addSuffix: true }) : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {job.agent_id ? job.agent_id.slice(0, 8) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {job.status === "pending" && (
                              <DropdownMenuItem onClick={() => handleChangeJobStatus(job, "cancelled")}>
                                <Ban className="h-4 w-4 mr-2" />
                                Cancel Job
                              </DropdownMenuItem>
                            )}
                            {job.status === "running" && (
                              <DropdownMenuItem onClick={() => handleChangeJobStatus(job, "cancelled")}>
                                <Ban className="h-4 w-4 mr-2" />
                                Cancel Job
                              </DropdownMenuItem>
                            )}
                            {(job.status === "failed" || job.status === "cancelled") && (
                              <DropdownMenuItem onClick={() => handleChangeJobStatus(job, "pending")}>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Retry Job
                              </DropdownMenuItem>
                            )}
                            {job.status === "completed" && (
                              <DropdownMenuItem onClick={() => handleChangeJobStatus(job, "pending")}>
                                <Play className="h-4 w-4 mr-2" />
                                Re-run Job
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setJobToDelete(job)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Job
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <ScrollArea className="h-[400px]">
            {executionResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No Execution History</h3>
                <p>Test execution results will appear here.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Steps</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Artifacts</TableHead>
                    <TableHead>Executed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executionResults.map((result) => (
                    <TableRow key={result.id}>
                      <TableCell>{getJobStatusBadge(result.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-green-500">{result.passed_steps} passed</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-red-500">{result.failed_steps} failed</span>
                          <span className="text-muted-foreground">/</span>
                          <span>{result.total_steps} total</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatDuration(result.duration_ms)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {result.screenshots && result.screenshots.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {result.screenshots.length} screenshots
                            </Badge>
                          )}
                          {result.video_url && (
                            <Badge variant="outline" className="text-xs">
                              Video
                            </Badge>
                          )}
                          {result.trace_url && (
                            <Badge variant="outline" className="text-xs">
                              Trace
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(result.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
      {/* Register Agent Dialog */}
      <Dialog
        open={showRegisterDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowRegisterDialog(false);
            setRegisterAgentName("");
            setRegisterAgentId("");
            setNewAgentToken(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register New Agent</DialogTitle>
            <DialogDescription>Register a self-hosted agent to execute tests on your infrastructure</DialogDescription>
          </DialogHeader>

          {newAgentToken ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <h4 className="font-medium text-green-500 mb-2">Agent Registered Successfully!</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Save this API token securely. It will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <Input value={newAgentToken} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(newAgentToken)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setShowRegisterDialog(false);
                    setNewAgentToken(null);
                    setRegisterAgentName("");
                    setRegisterAgentId("");
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agentName">Agent Name</Label>
                  <Input
                    id="agentName"
                    placeholder="e.g., Production Runner 1"
                    value={registerAgentName}
                    onChange={(e) => setRegisterAgentName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agentId">Agent ID</Label>
                  <Input
                    id="agentId"
                    placeholder="e.g., agent-prod-01"
                    value={registerAgentId}
                    onChange={(e) => setRegisterAgentId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">A unique identifier for this agent</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRegisterDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleRegisterAgent} disabled={isRegistering}>
                  {isRegistering && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Register Agent
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {/* Agent Details Dialog */}
      <Dialog open={showAgentDetails} onOpenChange={setShowAgentDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agent Details</DialogTitle>
          </DialogHeader>
          {selectedAgent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="font-medium">{selectedAgent.agent_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">ID</Label>
                  <p className="font-mono text-sm">{selectedAgent.agent_id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedAgent.status, selectedAgent.last_heartbeat)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Capacity</Label>
                  <p>
                    {selectedAgent.running_jobs}/{selectedAgent.capacity} jobs
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Browsers</Label>
                  <div className="flex gap-1 mt-1">
                    {(selectedAgent.browsers || []).map((browser) => (
                      <Badge key={browser} variant="outline">
                        {browser}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Last Heartbeat</Label>
                  <p className="text-sm">
                    {selectedAgent.last_heartbeat
                      ? formatDistanceToNow(new Date(selectedAgent.last_heartbeat), { addSuffix: true })
                      : "Never"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Registered</Label>
                  <p className="text-sm">
                    {formatDistanceToNow(new Date(selectedAgent.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
              {selectedAgent.config && (
                <div>
                  <Label className="text-muted-foreground">Configuration</Label>
                  <pre className="mt-1 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedAgent.config, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAgentDetails(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Mobile Setup Wizard */}
      <Dialog open={showMobileWizard} onOpenChange={setShowMobileWizard}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Mobile Automation Setup Wizard
            </DialogTitle>
            <DialogDescription>
              Step-by-step guide to prepare your environment for mobile testing.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6">
            <div className="flex justify-between mb-8 relative">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-muted -translate-y-1/2 z-0" />
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${mobileWizardStep >= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                >
                  {step}
                </div>
              ))}
            </div>

            {mobileWizardStep === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <h3 className="text-lg font-semibold">Step 1: System Requirements</h3>
                <p className="text-sm text-muted-foreground">Ensure your machine has the necessary tools installed.</p>
                <div className="grid grid-cols-2 gap-3">
                  <Card className={`p-3 border-l-4 ${mobileAgentStatus.running ? 'border-l-green-500' : 'border-l-yellow-500'}`}>
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      <span className="text-sm font-medium">Node.js / NPM</span>
                    </div>
                    <Badge variant="outline" className="mt-2 text-[10px]">Required</Badge>
                  </Card>
                  <Card className={`p-3 border-l-4 ${mobileDetails.devices.length > 0 ? 'border-l-green-500' : 'border-l-muted'}`}>
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span className="text-sm font-medium">Android ADB</span>
                    </div>
                    <Badge variant="outline" className="mt-2 text-[10px]">In PATH</Badge>
                  </Card>
                </div>
                {!mobileAgentStatus.running && (
                  <div className="p-3 bg-yellow-500/10 rounded-md border border-yellow-500/20 text-xs text-yellow-700 flex gap-2">
                    <HelpCircle className="h-4 w-4 shrink-0" />
                    <span>Self-Hosted Agent is not detected. Please start the agent first to perform system verification.</span>
                  </div>
                )}
              </div>
            )}

            {mobileWizardStep === 2 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <h3 className="text-lg font-semibold">Step 2: Connect Devices</h3>
                <p className="text-sm text-muted-foreground">Attach a physical device via USB or start an Android Emulator.</p>

                <div className="space-y-3">
                  {mobileDetails.devices.length > 0 ? (
                    mobileDetails.devices.map((d: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Smartphone className="h-5 w-5 text-green-600" />
                          <div>
                            <p className="text-sm font-medium">{d.model || d.id}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{d.id}</p>
                          </div>
                        </div>
                        <Badge className="bg-green-500">{d.status}</Badge>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center border-2 border-dashed rounded-lg bg-muted/20">
                      <Smartphone className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-30" />
                      <p className="text-sm text-muted-foreground">Waiting for device connection...</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {mobileWizardStep === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <h3 className="text-lg font-semibold">Step 3: Appium Initialization</h3>
                <p className="text-sm text-muted-foreground">Start the Appium server to enable UI automation and recording.</p>

                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Activity className={`h-6 w-6 ${mobileDetails.appium ? 'text-green-500' : 'text-muted-foreground'}`} />
                    <div>
                      <p className="text-sm font-medium">Appium Service</p>
                      <p className="text-xs text-muted-foreground">
                        {mobileDetails.appium ? 'Service is running correctly.' : 'Waiting for service to start...'}
                      </p>
                    </div>
                  </div>
                  {!mobileDetails.appium && (
                    <Button
                      size="sm"
                      onClick={() => {
                        fetch('http://localhost:3001/terminal', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ command: 'appium:start' })
                        });
                        toast({ title: "Appium Command Sent", description: "Requested agent to start Appium server." });
                      }}
                    >
                      Start Appium
                    </Button>
                  )}
                </div>
              </div>
            )}

            {mobileWizardStep === 4 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 text-center py-6">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </div>
                <h3 className="text-2xl font-bold">You're All Set!</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Mobile Automation is configured and ready. You can now use the Mobile Recorder to create test cases.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="ghost" onClick={() => setShowMobileWizard(false)}>Cancel</Button>
            <div className="flex gap-2">
              {mobileWizardStep > 1 && (
                <Button variant="outline" onClick={() => setMobileWizardStep(s => s - 1)}>Back</Button>
              )}
              {mobileWizardStep < 4 ? (
                <Button onClick={() => setMobileWizardStep(s => s + 1)}>Next</Button>
              ) : (
                <Button onClick={() => setShowMobileWizard(false)}>Finish</Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!agentToDelete} onOpenChange={() => setAgentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete agent "{agentToDelete?.agent_name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => agentToDelete && handleDeleteAgent(agentToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Job Confirmation */}
      <AlertDialog open={!!jobToDelete} onOpenChange={() => setJobToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete job "{jobToDelete?.run_id}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => jobToDelete && handleDeleteJob(jobToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
