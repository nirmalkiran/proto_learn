import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Shield, Plus, Play, Trash2, Edit, Eye, Clock, CheckCircle, XCircle, 
  AlertTriangle, RefreshCw, Settings, History, Flame, Bug
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { SecurityScanConfig, SecurityScan, OWASP_CATEGORIES } from "./types";
import { ScanConfigForm } from "./ScanConfigForm";
import { ScanResultsView } from "./ScanResultsView";
import { BurpSuiteTab } from "./BurpSuiteTab";
import { ZapTab } from "./ZapTab";

interface SecurityTestingProps {
  projectId: string;
}

export const SecurityTesting = ({ projectId }: SecurityTestingProps) => {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<SecurityScanConfig[]>([]);
  const [scans, setScans] = useState<SecurityScan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('configs');
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SecurityScanConfig | null>(null);
  const [selectedScan, setSelectedScan] = useState<SecurityScan | null>(null);
  const [runningScans, setRunningScans] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load configs
      const { data: configData, error: configError } = await (supabase as any)
        .from('security_scan_configs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (configError) throw configError;
      setConfigs((configData || []) as SecurityScanConfig[]);

      // Load scans with findings
      const { data: scanData, error: scanError } = await (supabase as any)
        .from('security_scans')
        .select('*, security_findings(*)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (scanError) throw scanError;
      setScans((scanData || []) as SecurityScan[]);
    } catch (error) {
      console.error('Error loading security data:', error);
      toast.error('Failed to load security data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async (configData: Partial<SecurityScanConfig>) => {
    try {
      if (editingConfig?.id) {
        const { error } = await (supabase as any)
          .from('security_scan_configs')
          .update({
            ...configData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingConfig.id);

        if (error) throw error;
        toast.success('Configuration updated');
      } else {
        const { error } = await (supabase as any)
          .from('security_scan_configs')
          .insert({
            ...configData,
            project_id: projectId,
            created_by: user?.id,
          });

        if (error) throw error;
        toast.success('Configuration created');
      }

      setShowConfigForm(false);
      setEditingConfig(null);
      loadData();
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Failed to save configuration');
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!confirm('Delete this configuration? This will also delete all associated scans.')) return;

    try {
      const { error } = await (supabase as any)
        .from('security_scan_configs')
        .delete()
        .eq('id', configId);

      if (error) throw error;
      toast.success('Configuration deleted');
      loadData();
    } catch (error) {
      console.error('Error deleting config:', error);
      toast.error('Failed to delete configuration');
    }
  };

  const handleStartScan = async (configId: string) => {
    setRunningScans(prev => new Set(prev).add(configId));

    try {
      const { data, error } = await supabase.functions.invoke('security-scan', {
        body: { action: 'start', configId, projectId },
      });

      if (error) throw error;

      toast.success('Security scan started');
      setActiveTab('history');
      loadData();

      // Poll for updates
      const pollInterval = setInterval(async () => {
        const { data: scanData } = await (supabase as any)
          .from('security_scans')
          .select('*, security_findings(*)')
          .eq('id', data.scanId)
          .single();

        if (scanData) {
          setScans(prev => prev.map(s => s.id === data.scanId ? scanData as SecurityScan : s));
          
          if (scanData.status === 'completed' || scanData.status === 'failed') {
            clearInterval(pollInterval);
            setRunningScans(prev => {
              const next = new Set(prev);
              next.delete(configId);
              return next;
            });
            loadData();
            toast.success(`Scan ${scanData.status}`);
          }
        }
      }, 3000);

      // Clear interval after 10 minutes
      setTimeout(() => clearInterval(pollInterval), 600000);
    } catch (error) {
      console.error('Error starting scan:', error);
      toast.error('Failed to start scan');
      setRunningScans(prev => {
        const next = new Set(prev);
        next.delete(configId);
        return next;
      });
    }
  };

  const getStatusIcon = (status: SecurityScan['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running': return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'cancelled': return <XCircle className="h-4 w-4 text-gray-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getSeveritySummary = (scan: SecurityScan) => {
    const summary = scan.summary || { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const parts = [];
    if (summary.critical > 0) parts.push(<Badge key="c" className="bg-red-600">{summary.critical}C</Badge>);
    if (summary.high > 0) parts.push(<Badge key="h" className="bg-orange-500">{summary.high}H</Badge>);
    if (summary.medium > 0) parts.push(<Badge key="m" className="bg-yellow-500 text-black">{summary.medium}M</Badge>);
    if (summary.low > 0) parts.push(<Badge key="l" className="bg-blue-500">{summary.low}L</Badge>);
    return parts.length > 0 ? <div className="flex gap-1">{parts}</div> : <span className="text-muted-foreground">—</span>;
  };

  if (selectedScan) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setSelectedScan(null)}>
            ← Back to Scans
          </Button>
          <h2 className="text-xl font-semibold">Scan Results</h2>
        </div>
        <ScanResultsView scan={selectedScan} onRefresh={() => {
          loadData().then(() => {
            const updated = scans.find(s => s.id === selectedScan.id);
            if (updated) setSelectedScan(updated);
          });
        }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Security Testing</h1>
            <p className="text-muted-foreground">OWASP Top 10 vulnerability scanning</p>
          </div>
        </div>
        <Button onClick={() => { setEditingConfig(null); setShowConfigForm(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Scan Configuration
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="configs" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurations
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Scan History
          </TabsTrigger>
          <TabsTrigger value="burp" className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            Burp Suite
          </TabsTrigger>
          <TabsTrigger value="zap" className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-blue-500" />
            OWASP ZAP
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configs" className="space-y-4">
          {showConfigForm ? (
            <Card>
              <CardHeader>
                <CardTitle>{editingConfig ? 'Edit Configuration' : 'New Scan Configuration'}</CardTitle>
                <CardDescription>Configure security scan parameters</CardDescription>
              </CardHeader>
              <CardContent>
                <ScanConfigForm
                  config={editingConfig || undefined}
                  onSave={handleSaveConfig}
                  onCancel={() => { setShowConfigForm(false); setEditingConfig(null); }}
                />
              </CardContent>
            </Card>
          ) : (
            <>
              {configs.length === 0 ? (
                <Card className="p-12 text-center">
                  <Shield className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No Scan Configurations</h3>
                  <p className="text-muted-foreground mb-4">
                    Create a scan configuration to start security testing
                  </p>
                  <Button onClick={() => setShowConfigForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Configuration
                  </Button>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {configs.map((config) => (
                    <Card key={config.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <CardTitle className="text-lg">{config.name}</CardTitle>
                            <Badge variant="outline">{config.target_type.toUpperCase()}</Badge>
                            <Badge variant={config.environment === 'prod' ? 'destructive' : 'secondary'}>
                              {config.environment.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => handleStartScan(config.id)}
                              disabled={runningScans.has(config.id)}
                            >
                              {runningScans.has(config.id) ? (
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4 mr-2" />
                              )}
                              {runningScans.has(config.id) ? 'Running...' : 'Run Scan'}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="icon"
                              onClick={() => { setEditingConfig(config); setShowConfigForm(true); }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="icon"
                              onClick={() => handleDeleteConfig(config.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <CardDescription>{config.target_url}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <span>Auth:</span>
                            <Badge variant="outline">{config.auth_type}</Badge>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <span>Depth:</span>
                            <Badge variant="outline">{config.scan_depth}</Badge>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <span>Categories:</span>
                            <Badge variant="outline">{config.enabled_categories?.length || 0}/10</Badge>
                          </div>
                          {config.aggressive_mode && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Aggressive
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Scan History</CardTitle>
              <CardDescription>View past security scan results</CardDescription>
            </CardHeader>
            <CardContent>
              {scans.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No scans have been run yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Configuration</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Findings</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scans.map((scan) => {
                      const config = configs.find(c => c.id === scan.config_id);
                      const duration = scan.started_at && scan.completed_at
                        ? Math.round((new Date(scan.completed_at).getTime() - new Date(scan.started_at).getTime()) / 1000)
                        : null;

                      return (
                        <TableRow key={scan.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(scan.status)}
                              <span className="capitalize">{scan.status}</span>
                            </div>
                          </TableCell>
                          <TableCell>{config?.name || 'Unknown'}</TableCell>
                          <TableCell>
                            {scan.started_at ? new Date(scan.started_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell>
                            {duration !== null ? `${duration}s` : '—'}
                          </TableCell>
                          <TableCell>{getSeveritySummary(scan)}</TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedScan(scan)}
                              disabled={scan.status === 'pending' || scan.status === 'running'}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="burp">
          <BurpSuiteTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="zap">
          <ZapTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
