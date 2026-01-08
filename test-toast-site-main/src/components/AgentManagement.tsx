import { useState, useEffect } from "react";
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

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [projectId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
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
    const { data, error } = await supabase
      .from("self_hosted_agents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    setAgents(data || []);
  };

  const loadJobs = async () => {
    const { data, error } = await supabase
      .from("agent_job_queue")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    setJobs(data || []);
  };

  const loadExecutionResults = async () => {
    const { data, error } = await supabase
      .from("agent_execution_results")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    setExecutionResults(data || []);
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

      // Replace the placeholder token in agent.js with the actual token
      agentJs = agentJs.replace(
        /API_TOKEN:\s*process\.env\.WISPR_API_TOKEN\s*\|\|\s*['"][^'"]*['"]/,
        `API_TOKEN: process.env.WISPR_API_TOKEN || '${token}'`
      );

      zip.file("package.json", packageJson);
      zip.file("agent.js", agentJs);
      zip.file("README.md", readme);
      zip.file("Dockerfile", dockerfile);

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
                <p className="text-2xl font-bold text-green-500">{onlineAgents.length}</p>
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
                <p className="text-2xl font-bold text-yellow-500">{pendingJobs.length}</p>
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
                <p className="text-2xl font-bold text-blue-500">{runningJobs.length}</p>
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

            {/* Agents Tab */}
            <TabsContent value="agents">
              {agents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
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
                          <TableCell>{getStatusBadge(agent.status, agent.last_heartbeat)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Cpu className="h-4 w-4 text-muted-foreground" />
                              <span>
                                {agent.running_jobs}/{agent.capacity}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {(agent.browsers || []).map((browser) => (
                                <Badge key={browser} variant="outline" className="text-xs">
                                  {browser}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {agent.last_heartbeat ? (
                              <span className="text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(agent.last_heartbeat), { addSuffix: true })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Never</span>
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
                </ScrollArea>
              )}
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
