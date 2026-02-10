import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Server, Plus, Trash2, RefreshCw, Download, Copy, 
  Clock, Activity, Wifi, WifiOff, Terminal, FileCode, Check
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import JSZip from "jszip";
import type { BurpAgent } from "./types";

interface BurpAgentManagerProps {
  projectId: string;
}

export const BurpAgentManager = ({ projectId }: BurpAgentManagerProps) => {
  const { user } = useAuth();
  const [agents, setAgents] = useState<BurpAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [newAgentToken, setNewAgentToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: '',
    description: '',
  });
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 30000);
    return () => clearInterval(interval);
  }, [projectId]);

  const loadAgents = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    try {
      const { data, error } = await (supabase as any)
        .from('burp_agents')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAgents(data || []);
      if (showRefreshIndicator) toast.success('Agents refreshed');
    } catch (error) {
      console.error('Error loading agents:', error);
      if (showRefreshIndicator) toast.error('Failed to refresh agents');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRegisterAgent = async () => {
    if (!newAgent.name.trim()) {
      toast.error('Please provide an agent name');
      return;
    }

    setIsRegistering(true);
    try {
      // Generate a proper UUID for the agent
      const agentId = crypto.randomUUID();
      
      // Generate an API token for the agent
      const token = `burp_${Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')}`;

      // Insert the agent record
      const { error } = await (supabase as any)
        .from('burp_agents')
        .insert({
          id: agentId,
          project_id: projectId,
          name: newAgent.name,
          description: newAgent.description || null,
          burp_api_url: 'http://127.0.0.1:1337', // Default Burp REST API URL
          created_by: user?.id,
          status: 'offline',
        });

      if (error) throw error;

      // Store the token for display (in a real system, this would be hashed and stored securely)
      setNewAgentToken(token);
      toast.success('Agent registered! Save the token below.');
      loadAgents();
    } catch (error: any) {
      console.error('Error registering agent:', error);
      toast.error(error.message || 'Failed to register agent');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm('Delete this agent? This cannot be undone.')) return;

    try {
      const { error } = await (supabase as any)
        .from('burp_agents')
        .delete()
        .eq('id', agentId);

      if (error) throw error;
      toast.success('Agent deleted');
      loadAgents();
    } catch (error) {
      console.error('Error deleting agent:', error);
      toast.error('Failed to delete agent');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const downloadAgentPackage = async () => {
    const zip = new JSZip();
    const token = newAgentToken || 'YOUR_API_TOKEN_HERE';
    const agentId = agents.length > 0 ? agents[0].id : 'YOUR_AGENT_ID';

    try {
      // Fetch the agent files
      const [agentJsResponse, packageJsonResponse, readmeResponse] = await Promise.all([
        fetch('/burp-agent/agent.js'),
        fetch('/burp-agent/package.json'),
        fetch('/burp-agent/README.md'),
      ]);

      if (!agentJsResponse.ok || !packageJsonResponse.ok || !readmeResponse.ok) {
        throw new Error('Failed to fetch agent package files');
      }

      const agentJs = await agentJsResponse.text();
      const packageJson = await packageJsonResponse.text();
      const readme = await readmeResponse.text();

      // Create .env template with actual values
      const envTemplate = `# Platform Connection
SUPABASE_URL=https://lghzmijzfpvrcvogxpew.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnaHptaWp6ZnB2cmN2b2d4cGV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwODYzNDQsImV4cCI6MjA3MDY2MjM0NH0.ySHdnHqIsq3ot0Cg7gyQvES6qZrN1TZSyZg4XoKaneE

# Agent Configuration
AGENT_ID=${agentId}
PROJECT_ID=${projectId}
AGENT_TOKEN=${token}

# Burp Suite Connection
BURP_API_URL=http://127.0.0.1:1337
BURP_API_KEY=your_burp_api_key_here

# Optional: Polling intervals (seconds)
POLL_INTERVAL=5
HEARTBEAT_INTERVAL=30
`;

      zip.file("agent.js", agentJs);
      zip.file("package.json", packageJson);
      zip.file("README.md", readme);
      zip.file(".env.example", envTemplate);

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wispr-burp-agent.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Agent package downloaded!');
      setShowDownloadDialog(false);
    } catch (error) {
      console.error('Error downloading agent package:', error);
      toast.error('Failed to download agent package');
    }
  };

  const getStatusIcon = (status: string, lastHeartbeat?: string) => {
    const isRecent = lastHeartbeat && 
      (new Date().getTime() - new Date(lastHeartbeat).getTime()) < 120000;

    if (status === 'online' && isRecent) {
      return <Wifi className="h-4 w-4 text-green-500" />;
    } else if (status === 'busy') {
      return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
    } else {
      return <WifiOff className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string, lastHeartbeat?: string) => {
    const isRecent = lastHeartbeat && 
      (new Date().getTime() - new Date(lastHeartbeat).getTime()) < 120000;

    if (status === 'online' && isRecent) {
      return <Badge className="bg-green-500">Online</Badge>;
    } else if (status === 'busy') {
      return <Badge className="bg-blue-500">Busy</Badge>;
    } else {
      return <Badge variant="secondary">Offline</Badge>;
    }
  };

  const resetAndCloseRegister = () => {
    setShowRegisterDialog(false);
    setNewAgentToken(null);
    setNewAgent({ name: '', description: '' });
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 bg-muted rounded w-1/3" />
        </CardHeader>
        <CardContent>
          <div className="h-32 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Burp Suite Agents</h3>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadAgents(true)} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDownloadDialog(true)}>
            <Download className="h-4 w-4 mr-2" />
            Download Agent
          </Button>
          <Button size="sm" onClick={() => setShowRegisterDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Register Agent
          </Button>
        </div>
      </div>

      {agents.length === 0 ? (
        <Card className="p-8 text-center">
          <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h4 className="text-lg font-medium mb-2">No Agents Registered</h4>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Register a Burp Suite agent, download the agent package, and run it on a machine with Burp Suite Professional installed.
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => setShowDownloadDialog(true)}>
              <Download className="h-4 w-4 mr-2" />
              Download Agent
            </Button>
            <Button onClick={() => setShowRegisterDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Register Agent
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Agent ID</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Last Heartbeat</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(agent.status, agent.last_heartbeat)}
                      {getStatusBadge(agent.status, agent.last_heartbeat)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{agent.name}</div>
                      {agent.description && (
                        <div className="text-xs text-muted-foreground">{agent.description}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {agent.id.substring(0, 20)}...
                    </code>
                  </TableCell>
                  <TableCell>
                    {agent.version ? (
                      <Badge variant="outline">{agent.version}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {agent.last_heartbeat ? (
                      <span className="text-sm">
                        {new Date(agent.last_heartbeat).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteAgent(agent.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Register Agent Dialog */}
      <Dialog open={showRegisterDialog} onOpenChange={resetAndCloseRegister}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Register Burp Suite Agent</DialogTitle>
            <DialogDescription>
              Register a new agent to connect your Burp Suite Professional instance
            </DialogDescription>
          </DialogHeader>

          {!newAgentToken ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Agent Name *</Label>
                <Input
                  id="agent-name"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Production Scanner"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-desc">Description</Label>
                <Textarea
                  id="agent-desc"
                  value={newAgent.description}
                  onChange={(e) => setNewAgent(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                  rows={2}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetAndCloseRegister}>
                  Cancel
                </Button>
                <Button onClick={handleRegisterAgent} disabled={isRegistering}>
                  {isRegistering ? 'Registering...' : 'Register Agent'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-700 dark:text-green-400">Agent Registered Successfully!</span>
                </div>
                <p className="text-sm text-green-600 dark:text-green-400">
                  Save the token below - it won't be shown again.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Agent Token</Label>
                <div className="flex gap-2">
                  <Input
                    value={newAgentToken}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(newAgentToken)}
                  >
                    {copiedToken ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Agent ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={agents.length > 0 ? agents[0].id : ''}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(agents.length > 0 ? agents[0].id : '')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Project ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={projectId}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(projectId)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={resetAndCloseRegister}>
                  Close
                </Button>
                <Button onClick={downloadAgentPackage}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Agent Package
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Download Agent Dialog */}
      <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Download Burp Suite Agent</DialogTitle>
            <DialogDescription>
              Download and set up the self-hosted agent to connect Burp Suite Professional
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="quick-start" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="quick-start">Quick Start</TabsTrigger>
              <TabsTrigger value="manual">Manual Setup</TabsTrigger>
            </TabsList>

            <TabsContent value="quick-start" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">1</div>
                  <div>
                    <p className="font-medium">Download the agent package</p>
                    <p className="text-sm text-muted-foreground">Contains all necessary files to run the agent</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">2</div>
                  <div>
                    <p className="font-medium">Configure the .env file</p>
                    <p className="text-sm text-muted-foreground">Add your Agent ID, Project ID, and Burp API key</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">3</div>
                  <div>
                    <p className="font-medium">Enable Burp REST API</p>
                    <p className="text-sm text-muted-foreground">In Burp Suite: Settings → Suite → REST API</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">4</div>
                  <div>
                    <p className="font-medium">Start the agent</p>
                    <p className="text-sm text-muted-foreground">Run <code className="bg-background px-1 py-0.5 rounded">npm start</code> or <code className="bg-background px-1 py-0.5 rounded">node agent.js</code></p>
                  </div>
                </div>
              </div>

              <Button className="w-full" onClick={downloadAgentPackage}>
                <Download className="h-4 w-4 mr-2" />
                Download Agent Package
              </Button>
            </TabsContent>

            <TabsContent value="manual" className="space-y-4 mt-4">
              <div className="space-y-3">
                <Label>Prerequisites</Label>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>Burp Suite Professional (v2024.1 or later)</li>
                  <li>Node.js 18+ or Bun runtime</li>
                  <li>Burp Suite REST API enabled</li>
                </ul>
              </div>

              <div className="space-y-2">
                <Label>Install & Run Commands</Label>
                <ScrollArea className="h-40 w-full rounded-md border">
                  <pre className="p-4 text-sm font-mono">
{`# Clone or download the agent package
cd burp-agent

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# Start the agent
npm start`}
                  </pre>
                </ScrollArea>
              </div>

              <div className="space-y-2">
                <Label>Environment Variables</Label>
                <ScrollArea className="h-32 w-full rounded-md border">
                  <pre className="p-4 text-sm font-mono">
{`SUPABASE_ANON_KEY=your_anon_key
AGENT_ID=${agents.length > 0 ? agents[0].id : 'your_agent_id'}
PROJECT_ID=${projectId}
BURP_API_URL=http://127.0.0.1:1337
BURP_API_KEY=your_burp_api_key`}
                  </pre>
                </ScrollArea>
              </div>

              <Button className="w-full" onClick={downloadAgentPackage}>
                <Download className="h-4 w-4 mr-2" />
                Download Agent Package
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};
