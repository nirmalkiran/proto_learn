import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Play, Pause, Square, RefreshCw, Clock, CheckCircle, XCircle, 
  AlertTriangle, Eye, Loader2, Target, Plus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { ZapScan, ZapScanProfile, ZapAgent } from "./types";

interface ZapScanOrchestratorProps {
  projectId: string;
  onViewResults?: (scan: ZapScan) => void;
}

export const ZapScanOrchestrator = ({ projectId, onViewResults }: ZapScanOrchestratorProps) => {
  const { user } = useAuth();
  const [scans, setScans] = useState<ZapScan[]>([]);
  const [profiles, setProfiles] = useState<ZapScanProfile[]>([]);
  const [agents, setAgents] = useState<ZapAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewScanDialog, setShowNewScanDialog] = useState(false);
  const [newScan, setNewScan] = useState({
    name: '',
    target_urls: [''],
    profile_id: '',
    agent_id: '',
    environment: 'dev',
  });

  useEffect(() => {
    loadData();
    const interval = setInterval(loadScans, 10000);
    return () => clearInterval(interval);
  }, [projectId]);

  const loadData = async () => {
    setIsLoading(true);
    await Promise.all([loadScans(), loadProfiles(), loadAgents()]);
    setIsLoading(false);
  };

  const loadScans = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('zap_scans')
        .select('*, profile:zap_scan_profiles(name), agent:zap_agents(name)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setScans(data || []);
    } catch (error) {
      console.error('Error loading scans:', error);
    }
  };

  const loadProfiles = async () => {
    try {
      const { data } = await (supabase as any)
        .from('zap_scan_profiles')
        .select('id, name')
        .eq('project_id', projectId);
      setProfiles(data || []);
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  };

  const loadAgents = async () => {
    try {
      const { data } = await (supabase as any)
        .from('zap_agents')
        .select('id, name, status')
        .eq('project_id', projectId);
      setAgents(data || []);
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  const generateRunId = () => {
    const num = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `ZAP-${num}`;
  };

  const handleStartScan = async () => {
    if (!newScan.name || newScan.target_urls.filter(u => u.trim()).length === 0) {
      toast.error('Please provide scan name and at least one target URL');
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from('zap_scans')
        .insert({
          project_id: projectId,
          name: newScan.name,
          run_id: generateRunId(),
          target_urls: newScan.target_urls.filter(u => u.trim()),
          profile_id: newScan.profile_id || null,
          agent_id: newScan.agent_id || null,
          environment: newScan.environment,
          status: 'pending',
          scan_mode: 'active',
          progress_percentage: 0,
          urls_discovered: 0,
          requests_made: 0,
          alerts_found: 0,
          high_count: 0,
          medium_count: 0,
          low_count: 0,
          info_count: 0,
          new_alerts_count: 0,
          resolved_alerts_count: 0,
          triggered_by: 'manual',
          created_by: user?.id,
          scope_includes: [],
          scope_excludes: [],
        });

      if (error) throw error;

      toast.success('Scan queued successfully');
      setShowNewScanDialog(false);
      setNewScan({ name: '', target_urls: [''], profile_id: '', agent_id: '', environment: 'dev' });
      loadScans();
    } catch (error) {
      console.error('Error starting scan:', error);
      toast.error('Failed to start scan');
    }
  };

  const handleCancelScan = async (scanId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('zap_scans')
        .update({ status: 'cancelled' })
        .eq('id', scanId);

      if (error) throw error;
      toast.success('Scan cancelled');
      loadScans();
    } catch (error) {
      console.error('Error cancelling scan:', error);
      toast.error('Failed to cancel scan');
    }
  };

  const addTargetUrl = () => {
    setNewScan(prev => ({ ...prev, target_urls: [...prev.target_urls, ''] }));
  };

  const updateTargetUrl = (index: number, value: string) => {
    setNewScan(prev => ({
      ...prev,
      target_urls: prev.target_urls.map((url, i) => i === index ? value : url),
    }));
  };

  const removeTargetUrl = (index: number) => {
    setNewScan(prev => ({
      ...prev,
      target_urls: prev.target_urls.filter((_, i) => i !== index),
    }));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'spidering':
      case 'scanning': return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'cancelled': return <Square className="h-4 w-4 text-muted-foreground" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge className="bg-green-500">Completed</Badge>;
      case 'failed': return <Badge variant="destructive">Failed</Badge>;
      case 'spidering': return <Badge className="bg-blue-500">Spidering</Badge>;
      case 'scanning': return <Badge className="bg-purple-500">Scanning</Badge>;
      case 'cancelled': return <Badge variant="secondary">Cancelled</Badge>;
      case 'paused': return <Badge className="bg-yellow-500 text-black">Paused</Badge>;
      default: return <Badge variant="outline">Pending</Badge>;
    }
  };

  const getSeveritySummary = (scan: ZapScan) => {
    const parts = [];
    if (scan.high_count && scan.high_count > 0) 
      parts.push(<Badge key="h" className="bg-red-600">{scan.high_count}H</Badge>);
    if (scan.medium_count && scan.medium_count > 0) 
      parts.push(<Badge key="m" className="bg-orange-500">{scan.medium_count}M</Badge>);
    if (scan.low_count && scan.low_count > 0) 
      parts.push(<Badge key="l" className="bg-yellow-500 text-black">{scan.low_count}L</Badge>);
    if (scan.info_count && scan.info_count > 0) 
      parts.push(<Badge key="i" className="bg-blue-500">{scan.info_count}I</Badge>);
    return parts.length > 0 ? <div className="flex gap-1">{parts}</div> : <span className="text-muted-foreground">—</span>;
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader><div className="h-6 bg-muted rounded w-1/3" /></CardHeader>
        <CardContent><div className="h-48 bg-muted rounded" /></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">OWASP ZAP Scans</h3>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadScans}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowNewScanDialog(true)}>
            <Play className="h-4 w-4 mr-2" />
            New Scan
          </Button>
        </div>
      </div>

      {scans.length === 0 ? (
        <Card className="p-8 text-center">
          <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h4 className="text-lg font-medium mb-2">No Scans Yet</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Start a new scan to find vulnerabilities in your application
          </p>
          <Button onClick={() => setShowNewScanDialog(true)}>
            <Play className="h-4 w-4 mr-2" />
            Start First Scan
          </Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Alerts</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scans.map((scan) => (
                <TableRow key={scan.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(scan.status)}
                      {getStatusBadge(scan.status)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{scan.name}</div>
                      <div className="text-xs text-muted-foreground">{scan.run_id}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(scan as any).profile?.name || <span className="text-muted-foreground">Default</span>}
                  </TableCell>
                  <TableCell>
                    {(scan.status === 'spidering' || scan.status === 'scanning') && scan.progress_percentage !== undefined ? (
                      <div className="w-24">
                        <Progress value={scan.progress_percentage} className="h-2" />
                        <span className="text-xs text-muted-foreground">{scan.progress_percentage}%</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{getSeveritySummary(scan)}</TableCell>
                  <TableCell>
                    {scan.started_at ? (
                      <span className="text-sm">{new Date(scan.started_at).toLocaleString()}</span>
                    ) : (
                      <span className="text-muted-foreground">Queued</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(scan.status === 'spidering' || scan.status === 'scanning') && (
                        <Button variant="ghost" size="icon" onClick={() => handleCancelScan(scan.id)}>
                          <Square className="h-4 w-4" />
                        </Button>
                      )}
                      {(scan.status === 'completed' || scan.status === 'failed') && (
                        <Button variant="ghost" size="icon" onClick={() => onViewResults?.(scan)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* New Scan Dialog */}
      <Dialog open={showNewScanDialog} onOpenChange={setShowNewScanDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New OWASP ZAP Scan</DialogTitle>
            <DialogDescription>
              Configure and start a new security scan
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Scan Name *</Label>
              <Input
                value={newScan.name}
                onChange={(e) => setNewScan(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., API Security Audit v1"
              />
            </div>

            <div className="space-y-2">
              <Label>Target URLs *</Label>
              {newScan.target_urls.map((url, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={url}
                    onChange={(e) => updateTargetUrl(index, e.target.value)}
                    placeholder="https://example.com"
                    className="flex-1"
                  />
                  {newScan.target_urls.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeTargetUrl(index)}>
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addTargetUrl}>
                <Plus className="h-4 w-4 mr-2" />
                Add URL
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Scan Profile</Label>
                <Select 
                  value={newScan.profile_id} 
                  onValueChange={(v) => setNewScan(prev => ({ ...prev, profile_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Default profile" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Agent</Label>
                <Select 
                  value={newScan.agent_id} 
                  onValueChange={(v) => setNewScan(prev => ({ ...prev, agent_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Any available" /></SelectTrigger>
                  <SelectContent>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} {a.status === 'online' ? '🟢' : '⚪'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Environment</Label>
              <Select 
                value={newScan.environment} 
                onValueChange={(v) => setNewScan(prev => ({ ...prev, environment: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dev">Development</SelectItem>
                  <SelectItem value="qa">QA / Staging</SelectItem>
                  <SelectItem value="prod">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newScan.environment === 'prod' && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Production scans may affect live services. Use with caution.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewScanDialog(false)}>Cancel</Button>
            <Button onClick={handleStartScan}>
              <Play className="h-4 w-4 mr-2" />
              Start Scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
