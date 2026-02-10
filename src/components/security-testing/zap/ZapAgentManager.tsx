import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Server, Plus, Trash2, RefreshCw, Download, Copy, 
  Clock, Activity, Wifi, WifiOff, Terminal, FileCode, Check
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import JSZip from "jszip";
import type { ZapAgent } from "./types";

interface ZapAgentManagerProps {
  projectId: string;
}

export const ZapAgentManager = ({ projectId }: ZapAgentManagerProps) => {
  const { user } = useAuth();
  const [agents, setAgents] = useState<ZapAgent[]>([]);
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
        .from('zap_agents')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAgents(data || []);
      if (showRefreshIndicator) toast.success('Agents refreshed');
    } catch (error) {
      console.error('Error loading ZAP agents:', error);
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
      const agentId = crypto.randomUUID();
      
      const token = `zap_${Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')}`;

      const { error } = await (supabase as any)
        .from('zap_agents')
        .insert({
          id: agentId,
          project_id: projectId,
          name: newAgent.name,
          description: newAgent.description || null,
          zap_api_url: 'http://127.0.0.1:8080',
          created_by: user?.id,
          status: 'offline',
          is_daemon_mode: true,
          capabilities: {
            spider: true,
            ajax_spider: true,
            active_scan: true,
            passive_scan: true,
            fuzzer: false,
            websocket: false,
            openapi: true,
            graphql: false,
            soap: false,
          },
        });

      if (error) throw error;

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
        .from('zap_agents')
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
      const agentJs = `// OWASP ZAP Agent for Security Testing Platform
// This agent polls for scan jobs and executes them via ZAP API
// Uses the zap-agent-api edge function for all platform communication

require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const AGENT_ID = process.env.AGENT_ID;
const PROJECT_ID = process.env.PROJECT_ID;
const ZAP_API_URL = process.env.ZAP_API_URL || 'http://127.0.0.1:8080';
const ZAP_API_KEY = process.env.ZAP_API_KEY || '';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5') * 1000;
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL || '30') * 1000;

const API_BASE = \`\${SUPABASE_URL}/functions/v1/zap-agent-api\`;

async function apiCall(action, method = 'POST', body = null) {
  const url = method === 'GET' 
    ? \`\${API_BASE}/\${action}\`
    : \`\${API_BASE}/\${action}\`;
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
  };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(url, options);
  return response.json();
}

async function zapRequest(component, type, action, params = {}) {
  const url = new URL(\`\${ZAP_API_URL}/JSON/\${component}/\${type}/\${action}/\`);
  url.searchParams.append('apikey', ZAP_API_KEY);
  Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
  
  const response = await fetch(url.toString());
  return response.json();
}

async function sendHeartbeat() {
  try {
    let version = 'unknown';
    try {
      const zapVersion = await zapRequest('core', 'view', 'version');
      version = zapVersion.version || 'unknown';
    } catch (e) {
      console.warn('[Heartbeat] Could not reach ZAP API:', e.message);
    }
    
    const result = await apiCall('heartbeat', 'POST', {
      agent_id: AGENT_ID,
      version,
    });
    
    if (result.success) {
      console.log('[Heartbeat] Sent successfully');
    } else {
      console.error('[Heartbeat] Failed:', result.error);
    }
  } catch (error) {
    console.error('[Heartbeat] Failed:', error.message);
  }
}

async function pollForJobs() {
  try {
    const result = await apiCall(\`poll?agent_id=\${AGENT_ID}\`, 'GET');
    const scans = result.scans || [];
    
    if (scans.length === 0) return;

    console.log('[Job] Found', scans.length, 'pending scan(s)');
    await executeScan(scans[0]);
  } catch (error) {
    console.error('[Poll] Error:', error.message);
  }
}

async function executeScan(scan) {
  try {
    await apiCall('status', 'POST', { scan_id: scan.id, status: 'spidering', metrics: { current_phase: 'Spider' } });
    
    for (const targetUrl of scan.target_urls) {
      // Spider the target
      await zapRequest('spider', 'action', 'scan', { url: targetUrl, maxChildren: '100' });
      
      // Wait for spider to complete
      let spiderProgress = 0;
      while (spiderProgress < 100) {
        const status = await zapRequest('spider', 'view', 'status', { scanId: '0' });
        spiderProgress = parseInt(status.status || '100');
        await apiCall('status', 'POST', { scan_id: scan.id, progress: Math.floor(spiderProgress / 2), metrics: { spider_progress: spiderProgress } });
        await new Promise(r => setTimeout(r, 2000));
      }
      
      // Start active scan
      await apiCall('status', 'POST', { scan_id: scan.id, status: 'scanning', metrics: { current_phase: 'Active Scan' } });
      await zapRequest('ascan', 'action', 'scan', { url: targetUrl, recurse: 'true' });
      
      // Wait for active scan
      let scanProgress = 0;
      while (scanProgress < 100) {
        const status = await zapRequest('ascan', 'view', 'status', { scanId: '0' });
        scanProgress = parseInt(status.status || '100');
        await apiCall('status', 'POST', { scan_id: scan.id, progress: 50 + Math.floor(scanProgress / 2), metrics: { active_scan_progress: scanProgress } });
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    
    // Get alerts
    const alertsResult = await zapRequest('core', 'view', 'alerts', { baseurl: scan.target_urls[0] });
    const alerts = alertsResult.alerts || [];
    
    // Submit results via edge function
    await apiCall('results', 'POST', {
      scan_id: scan.id,
      alerts,
      summary: {
        urls_discovered: alerts.length,
        requests_made: 0,
      },
    });
    
    console.log('[Scan] Completed:', scan.id, 'Alerts:', alerts.length);
  } catch (error) {
    console.error('[Scan] Failed:', error.message);
    await apiCall('status', 'POST', { scan_id: scan.id, status: 'failed', error_message: error.message });
  }
}

console.log('OWASP ZAP Agent Starting...');
console.log('Agent ID:', AGENT_ID);
console.log('ZAP API:', ZAP_API_URL);
console.log('Platform API:', API_BASE);

sendHeartbeat();
setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
setInterval(pollForJobs, POLL_INTERVAL);
console.log('Agent running. Polling for jobs...');
`;

      const packageJson = JSON.stringify({
        name: "wispr-zap-agent",
        version: "1.0.0",
        description: "OWASP ZAP Agent for Security Testing Platform",
        main: "agent.js",
        scripts: {
          start: "node agent.js"
        },
        dependencies: {
          "dotenv": "^16.3.1"
        }
      }, null, 2);

      const readme = `# OWASP ZAP Agent

Self-hosted agent for connecting OWASP ZAP to the security testing platform.

## Prerequisites

1. OWASP ZAP installed and running in daemon mode
2. Node.js 18+
3. ZAP API enabled

## Quick Start

1. Start ZAP in daemon mode:
   \`\`\`bash
   zap.sh -daemon -port 8080 -config api.key=your_api_key
   \`\`\`

2. Copy \`.env.example\` to \`.env\` and fill in your values

3. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

4. Start the agent:
   \`\`\`bash
   npm start
   \`\`\`

## Docker

\`\`\`bash
docker build -t wispr-zap-agent .
docker run --env-file .env --network host wispr-zap-agent
\`\`\`
`;

      const envTemplate = `# Platform Connection
SUPABASE_URL=https://lghzmijzfpvrcvogxpew.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnaHptaWp6ZnB2cmN2b2d4cGV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwODYzNDQsImV4cCI6MjA3MDY2MjM0NH0.ySHdnHqIsq3ot0Cg7gyQvES6qZrN1TZSyZg4XoKaneE

# Agent Configuration
AGENT_ID=${agentId}
PROJECT_ID=${projectId}
AGENT_TOKEN=${token}

# ZAP Connection
ZAP_API_URL=http://127.0.0.1:8080
ZAP_API_KEY=your_zap_api_key_here

# Optional: Polling intervals (seconds)
POLL_INTERVAL=5
HEARTBEAT_INTERVAL=30
`;

      const dockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
CMD ["npm", "start"]
`;

      zip.file("agent.js", agentJs);
      zip.file("package.json", packageJson);
      zip.file("README.md", readme);
      zip.file(".env.example", envTemplate);
      zip.file("Dockerfile", dockerfile);

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wispr-zap-agent.zip";
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
          <h3 className="text-lg font-semibold">OWASP ZAP Agents</h3>
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
            Register a ZAP agent, download the agent package, and run it on a machine with OWASP ZAP installed.
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
            <DialogTitle>Register OWASP ZAP Agent</DialogTitle>
            <DialogDescription>
              Register a new agent to connect your OWASP ZAP instance
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
                  placeholder="e.g., Dev Environment Scanner"
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
            <DialogTitle>Download OWASP ZAP Agent</DialogTitle>
            <DialogDescription>
              Download and set up the self-hosted agent to connect OWASP ZAP
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="quick-start" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="quick-start">Quick Start</TabsTrigger>
              <TabsTrigger value="docker">Docker</TabsTrigger>
            </TabsList>
            
            <TabsContent value="quick-start" className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium">1. Prerequisites</h4>
                <ul className="text-sm text-muted-foreground list-disc ml-4">
                  <li>OWASP ZAP installed (or Docker image)</li>
                  <li>Node.js 18 or later</li>
                  <li>ZAP running in daemon mode with API enabled</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">2. Start ZAP in Daemon Mode</h4>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                  <code>zap.sh -daemon -port 8080 -config api.key=your_api_key</code>
                </pre>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">3. Download & Configure</h4>
                <p className="text-sm text-muted-foreground">
                  Download the agent package, extract it, and configure .env with your credentials.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">4. Run the Agent</h4>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                  <code>{`npm install
npm start`}</code>
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="docker" className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium">Using Docker</h4>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                  <code>{`# Build the agent
docker build -t wispr-zap-agent .

# Run with ZAP
docker run -d --name zap owasp/zap2docker-stable zap.sh -daemon -port 8080

# Run the agent
docker run --env-file .env --network host wispr-zap-agent`}</code>
                </pre>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDownloadDialog(false)}>
              Cancel
            </Button>
            <Button onClick={downloadAgentPackage}>
              <Download className="h-4 w-4 mr-2" />
              Download Agent Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
