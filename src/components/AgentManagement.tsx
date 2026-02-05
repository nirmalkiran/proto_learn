import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import JSZip from "jszip";
import { useNavigate } from "react-router-dom";

interface AgentManagementProps {
  projectId: string;
}

interface Agent {
  id: string;
  agent_id?: string;
  agent_name?: string;
  name?: string;
  agent_type?: string;
  status: string | null;
  last_heartbeat: string | null;
  capacity?: number;
  running_jobs?: number;
  browsers?: string[] | null;
  config?: any;
  capabilities?: any;
  created_at: string;
  endpoint_url?: string | null;
  api_key?: string | null;
  project_id?: string | null;
  user_id?: string;
  updated_at?: string;
}

interface JobQueueItem {
  id: string;
  job_type: string;
  job_data: any;
  status: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  agent_id: string | null;
  error_message: string | null;
  result: any;
  user_id: string;
}

interface ExecutionResult {
  id: string;
  status: string;
  duration_ms: number | null;
  logs: string | null;
  result: any;
  test_case_id: string | null;
  created_at: string;
  user_id: string;
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

  const lastStatusCheckFail = useRef<number | null>(null);

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

  // Mobile Agent States (for background heartbeating to Supabase)
  const [mobileAgentId] = useState(() => `mobile-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    let isMounted = true;
    const mobileHeartbeat = async () => {
      if (!isMounted || !mobileAgentStatus.running) return;
      try {
        await supabase.functions.invoke("agent-api", {
          body: {
            action: "heartbeat",
            agentId: mobileAgentId,
            projectId: projectId,
            status: "online",
            capacity: mobileDetails.devices.length || 1,
            browsers: ["Android (ADB)"],
            system_info: {
              platform: navigator.platform,
              devices: mobileDetails.devices.length,
              port: 3001
            }
          },
        });
      } catch (err) {
        console.error("Mobile Agent heartbeat failed:", err);
      }
    };

    if (mobileAgentStatus.running) {
      const hbInterval = setInterval(mobileHeartbeat, 30000);
      mobileHeartbeat();
      return () => { isMounted = false; clearInterval(hbInterval); };
    }
  }, [mobileAgentStatus.running, mobileAgentId, projectId, mobileDetails.devices.length]);

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
            projectId: projectId, // FIX: Pass projectId for auto-registration
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
    const { data: dbAgents, error } = await supabase
      .from("self_hosted_agents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const localAgents: Agent[] = (dbAgents || []).map(agent => ({
      ...agent,
      agent_name: agent.name || "Unnamed Agent",
      browsers: (agent.capabilities as any)?.browsers || [],
      capacity: (agent.capabilities as any)?.capacity || 1
    }));

    // Deduplicate ephemeral agents (don't push virtual ones if they are already in the DB)
    const dbAgentIds = new Set(localAgents.map(a => a.agent_id));

    // Add Mobile Agent if running and not in DB
    if (mobileAgentStatus.running && !dbAgentIds.has(mobileAgentId)) {
      localAgents.push({
        id: mobileAgentId,
        agent_id: mobileAgentId,
        agent_name: "Mobile Automation Helper",
        status: "online",
        last_heartbeat: new Date().toISOString(),
        capacity: mobileDetails.devices.length || 1,
        running_jobs: 0,
        browsers: ["Android (ADB)"],
        config: { port: 3001 },
        created_at: new Date().toISOString()
      });
    }

    // Add Browser Agent if active and not in DB
    if (isBrowserAgentActive && !dbAgentIds.has(browserAgentId)) {
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
    try {
      const { data, error } = await supabase
        .from("agent_job_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.warn("Could not load jobs:", error.message);
        setJobs([]);
        return;
      }
      setJobs((data || []) as unknown as JobQueueItem[]);
    } catch (err) {
      console.warn("Error loading jobs:", err);
      setJobs([]);
    }
  };

  const loadExecutionResults = async () => {
    // Note: agent_execution_results table doesn't exist in the current schema
    // Using automation_results as a fallback
    const { data, error } = await supabase
      .from("automation_results")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.warn("Could not load execution results:", error.message);
      setExecutionResults([]);
      return;
    }

    // Map to expected format
    const mapped = (data || []).map(r => ({
      id: r.id,
      status: r.status,
      duration_ms: r.duration_ms,
      logs: r.logs,
      result: r.result,
      test_case_id: r.test_case_id,
      created_at: r.created_at,
      user_id: r.user_id
    }));
    setExecutionResults(mapped as ExecutionResult[]);
  };

  const checkMobileAgentStatus = async () => {
    // If it recently failed, skip the check to avoid console spam (1 minute cooldown)
    if (lastStatusCheckFail.current && (Date.now() - lastStatusCheckFail.current < 60000)) {
      return;
    }

    try {
      const res = await fetch('http://localhost:3001/setup/status', {
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        lastStatusCheckFail.current = null; // Clear failure on success
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
    } catch (err) {
      lastStatusCheckFail.current = Date.now();
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

      // Attempt to extract meaningful error message from Edge Function
      let errorMessage = "Failed to register agent";
      if (error.context?.json?.error) {
        errorMessage = error.context.json.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Registration Failed",
        description: errorMessage,
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
        description: `Job "${job.id}" has been removed`,
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
        description: `Job "${job.id}" status changed to ${newStatus}`,
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

	      // Stamp build so downloaded agent clearly reflects current package
	      agentJs = agentJs.replace(
	        /const AGENT_BUILD\s*=\s*['"][^'"]*['"]\s*;/,
	        `const AGENT_BUILD = "${new Date().toISOString()}";`
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
	        "services/inspector-service.js",
	        "services/smart-xpath-builder.js",
	        "services/locator-healing-engine.js",
	        "services/hierarchy-snapshot-store.js",
	        "services/hierarchy-diff.js",
	        "services/locator-history-store.js",
	        "utils/adb-utils.js",
	        "utils/process-manager.js",
	        "utils/ui-hierarchy-fast.js",
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
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Wifi className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Online</p>
                <p className="text-2xl font-bold text-green-500">{agents.filter(a => (a.status === 'online' || a.status === 'busy') && !isHeartbeatStale(a.last_heartbeat)).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Jobs</p>
                <p className="text-2xl font-bold text-yellow-500">{jobs.filter(j => j.status === 'pending').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Activity className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Running</p>
                <p className="text-2xl font-bold text-blue-500">{jobs.filter(j => j.status === 'running').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Self-Hosted Agents
              </CardTitle>
              <CardDescription>Manage your self-hosted test execution agents</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadAgentPackage()}>
                <Download className="h-4 w-4 mr-2" />
                Download Agent
              </Button>
              <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setShowRegisterDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Register Agent
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="mb-4">
              <TabsTrigger value="agents" className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                Agents ({agents.length})
              </TabsTrigger>
              <TabsTrigger value="jobs" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Job Queue ({jobs.filter((j) => j.status === "pending" || j.status === "running").length})
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Execution History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="agents">
              {agents.length === 0 && !isLoading ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/20">
                  <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No Agents Registered</h3>
                  <p className="mb-4">Register a self-hosted agent to start running tests.</p>
                  <Button onClick={() => setShowRegisterDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Register Agent
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Capacity</TableHead>
                        <TableHead>Browsers</TableHead>
                        <TableHead>Last Heartbeat</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agents.map((agent) => (
                        <TableRow key={agent.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{agent.agent_name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{agent.agent_id}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(agent.status, agent.last_heartbeat)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Cpu className="h-4 w-4 text-muted-foreground" />
                              {agent.agent_id?.startsWith('mobile') ? (
                                <Smartphone className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Monitor className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span>{agent.running_jobs}/{agent.capacity} {agent.agent_id?.startsWith('mobile') ? 'Devices' : 'Slots'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {(agent.browsers || []).map((browser) => (
                                <Badge key={browser} variant="outline" className="text-[10px]">
                                  {browser}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {agent.last_heartbeat
                                ? formatDistanceToNow(new Date(agent.last_heartbeat), { addSuffix: true })
                                : "Never"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  setSelectedAgent(agent);
                                  setShowAgentDetails(true);
                                }}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                {agent.agent_id?.startsWith('mobile') && (
                                  <DropdownMenuItem onClick={() => {
                                    setMobileWizardStep(1);
                                    setShowMobileWizard(true);
                                  }}>
                                    <Settings className="h-4 w-4 mr-2" />
                                    Mobile Setup
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:bg-destructive focus:text-destructive-foreground font-medium"
                                  onClick={() => setAgentToDelete(agent)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Agent
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </TabsContent>

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
                          <TableCell className="font-mono text-sm">{job.job_type || job.id.slice(0, 8)}</TableCell>
                          <TableCell>{getJobStatusBadge(job.status || "unknown")}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{(job as any).priority ?? "-"}</Badge>
                          </TableCell>
                          <TableCell>
                            {(job as any).retries ?? 0}/{(job as any).max_retries ?? 3}
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
                              <span className="text-muted-foreground">
                                {result.result ? "Result available" : "No result data"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{formatDuration(result.duration_ms)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {result.logs && (
                                <Badge variant="outline" className="text-xs">
                                  Logs available
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
        </CardContent>
      </Card>

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
              Are you sure you want to delete job "{jobToDelete?.id}"? This action cannot be undone.
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
