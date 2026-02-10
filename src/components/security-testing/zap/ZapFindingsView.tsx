import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Shield, ChevronDown, ChevronRight, FileJson, FileText,
  ExternalLink, EyeOff, Flag, ArrowLeft, RefreshCw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ZapScan, ZapAlert, ZapSeverity, ZAP_SEVERITY_COLORS, ZAP_CONFIDENCE_COLORS } from "./types";

const SEVERITY_ORDER: ZapSeverity[] = ['high', 'medium', 'low', 'info'];

const SEVERITY_COLORS: Record<ZapSeverity, string> = {
  high: 'bg-red-600 text-white',
  medium: 'bg-orange-500 text-white',
  low: 'bg-yellow-500 text-black',
  info: 'bg-blue-500 text-white',
};

interface ZapFindingsViewProps {
  scan: ZapScan;
  onBack: () => void;
}

export const ZapFindingsView = ({ scan, onBack }: ZapFindingsViewProps) => {
  const [alerts, setAlerts] = useState<ZapAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());
  const [suppressDialogOpen, setSuppressDialogOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<ZapAlert | null>(null);
  const [suppressionReason, setSuppressionReason] = useState('');

  useEffect(() => {
    loadAlerts();
  }, [scan.id]);

  const loadAlerts = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('zap_alerts')
        .select('*')
        .eq('scan_id', scan.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const sorted = (data || []).sort((a: ZapAlert, b: ZapAlert) =>
        SEVERITY_ORDER.indexOf(a.risk) - SEVERITY_ORDER.indexOf(b.risk)
      );
      setAlerts(sorted);
    } catch (error) {
      console.error('Error loading ZAP alerts:', error);
      toast.error('Failed to load alerts');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedAlerts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSuppress = async () => {
    if (!selectedAlert || !suppressionReason) return;
    try {
      const { error } = await (supabase as any)
        .from('zap_alerts')
        .update({ is_suppressed: true, suppression_reason: suppressionReason })
        .eq('id', selectedAlert.id);
      if (error) throw error;
      toast.success('Alert suppressed');
      setSuppressDialogOpen(false);
      setSelectedAlert(null);
      setSuppressionReason('');
      loadAlerts();
    } catch (error) {
      toast.error('Failed to suppress alert');
    }
  };

  const handleMarkFalsePositive = async (alert: ZapAlert) => {
    try {
      const { error } = await (supabase as any)
        .from('zap_alerts')
        .update({ is_false_positive: !alert.is_false_positive })
        .eq('id', alert.id);
      if (error) throw error;
      toast.success(alert.is_false_positive ? 'Unmarked as false positive' : 'Marked as false positive');
      loadAlerts();
    } catch (error) {
      toast.error('Failed to update alert');
    }
  };

  const exportAlerts = (format: 'json' | 'csv') => {
    try {
      const exportData = alerts.filter(a => !a.is_suppressed).map(a => ({
        risk: a.risk,
        confidence: a.confidence,
        name: a.alert_name,
        url: a.url,
        method: a.method,
        param: a.param,
        cwe_id: a.cwe_id,
        description: a.description,
        solution: a.solution,
      }));

      let content: string;
      let mimeType: string;
      let ext: string;

      if (format === 'json') {
        content = JSON.stringify(exportData, null, 2);
        mimeType = 'application/json';
        ext = 'json';
      } else {
        const headers = Object.keys(exportData[0] || {}).join(',');
        const rows = exportData.map(r => Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
        content = [headers, ...rows].join('\n');
        mimeType = 'text/csv';
        ext = 'csv';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zap-alerts-${scan.run_id}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export');
    }
  };

  const grouped = SEVERITY_ORDER.reduce((acc, sev) => {
    acc[sev] = alerts.filter(a => a.risk === sev && !a.is_suppressed);
    return acc;
  }, {} as Record<string, ZapAlert[]>);

  const summary = {
    high: scan.high_count || 0,
    medium: scan.medium_count || 0,
    low: scan.low_count || 0,
    info: scan.info_count || 0,
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Scans
        </Button>
        <Card className="animate-pulse"><CardContent className="h-64" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{scan.name}</h2>
            <p className="text-sm text-muted-foreground">{scan.run_id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAlerts}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportAlerts('json')}>
            <FileJson className="h-4 w-4 mr-2" /> JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportAlerts('csv')}>
            <FileText className="h-4 w-4 mr-2" /> CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {([['high', 'text-red-500'], ['medium', 'text-orange-500'], ['low', 'text-yellow-500'], ['info', 'text-blue-500']] as const).map(([sev, color]) => (
          <Card key={sev}>
            <CardContent className="pt-4 text-center">
              <div className={`text-3xl font-bold ${color}`}>{summary[sev]}</div>
              <div className="text-sm text-muted-foreground capitalize">{sev}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Scan Info */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className="ml-1 capitalize">{scan.status}</Badge></div>
            <div><span className="text-muted-foreground">URLs Discovered:</span> <span className="ml-1 font-medium">{scan.urls_discovered}</span></div>
            <div><span className="text-muted-foreground">Requests Made:</span> <span className="ml-1 font-medium">{scan.requests_made}</span></div>
            <div><span className="text-muted-foreground">Duration:</span> <span className="ml-1 font-medium">{scan.duration_ms ? `${(scan.duration_ms / 1000).toFixed(1)}s` : 'N/A'}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({alerts.filter(a => !a.is_suppressed).length})</TabsTrigger>
          {SEVERITY_ORDER.map(sev =>
            grouped[sev].length > 0 && (
              <TabsTrigger key={sev} value={sev} className="capitalize">
                {sev} ({grouped[sev].length})
              </TabsTrigger>
            )
          )}
          {alerts.filter(a => a.is_suppressed).length > 0 && (
            <TabsTrigger value="suppressed">Suppressed ({alerts.filter(a => a.is_suppressed).length})</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="all">
          <AlertsList alerts={alerts.filter(a => !a.is_suppressed)} expandedAlerts={expandedAlerts} onToggleExpand={toggleExpand} onMarkFalsePositive={handleMarkFalsePositive} onSuppress={(a) => { setSelectedAlert(a); setSuppressDialogOpen(true); }} />
        </TabsContent>
        {SEVERITY_ORDER.map(sev => (
          <TabsContent key={sev} value={sev}>
            <AlertsList alerts={grouped[sev]} expandedAlerts={expandedAlerts} onToggleExpand={toggleExpand} onMarkFalsePositive={handleMarkFalsePositive} onSuppress={(a) => { setSelectedAlert(a); setSuppressDialogOpen(true); }} />
          </TabsContent>
        ))}
        <TabsContent value="suppressed">
          <AlertsList alerts={alerts.filter(a => a.is_suppressed)} expandedAlerts={expandedAlerts} onToggleExpand={toggleExpand} onMarkFalsePositive={handleMarkFalsePositive} showSuppressionReason />
        </TabsContent>
      </Tabs>

      {/* Suppress Dialog */}
      <Dialog open={suppressDialogOpen} onOpenChange={setSuppressDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suppress Alert</DialogTitle>
            <DialogDescription>Suppressed alerts will be hidden from reports. Provide a reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea value={suppressionReason} onChange={(e) => setSuppressionReason(e.target.value)} placeholder="e.g., False positive - handled by WAF" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuppressDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSuppress} disabled={!suppressionReason}>Suppress</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Sub-component for rendering alert lists
interface AlertsListProps {
  alerts: ZapAlert[];
  expandedAlerts: Set<string>;
  onToggleExpand: (id: string) => void;
  onMarkFalsePositive?: (alert: ZapAlert) => void;
  onSuppress?: (alert: ZapAlert) => void;
  showSuppressionReason?: boolean;
}

const AlertsList = ({ alerts, expandedAlerts, onToggleExpand, onMarkFalsePositive, onSuppress, showSuppressionReason }: AlertsListProps) => {
  if (alerts.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No alerts in this category</p>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[600px]">
      <div className="space-y-3 pr-4">
        {alerts.map((alert) => (
          <Collapsible key={alert.id} open={expandedAlerts.has(alert.id)} onOpenChange={() => onToggleExpand(alert.id)}>
            <Card className={alert.is_false_positive ? 'opacity-60' : ''}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    {expandedAlerts.has(alert.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <Badge className={SEVERITY_COLORS[alert.risk]}>{alert.risk.toUpperCase()}</Badge>
                    <span className="font-medium text-left">{alert.alert_name}</span>
                    {alert.is_false_positive && <Badge variant="secondary">False Positive</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{alert.confidence}</Badge>
                    {alert.occurrence_count > 1 && <Badge variant="secondary">×{alert.occurrence_count}</Badge>}
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">URL:</span>
                      <code className="ml-2 px-2 py-1 bg-muted rounded text-xs break-all">
                        {alert.method || 'GET'} {alert.url}
                      </code>
                    </div>
                    {alert.cwe_id && (
                      <div>
                        <span className="text-muted-foreground">CWE:</span>
                        <a href={`https://cwe.mitre.org/data/definitions/${alert.cwe_id}.html`} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline">
                          CWE-{alert.cwe_id} <ExternalLink className="h-3 w-3 inline ml-1" />
                        </a>
                      </div>
                    )}
                    {alert.wasc_id && (
                      <div>
                        <span className="text-muted-foreground">WASC ID:</span>
                        <span className="ml-2">{alert.wasc_id}</span>
                      </div>
                    )}
                    {alert.param && (
                      <div>
                        <span className="text-muted-foreground">Parameter:</span>
                        <code className="ml-2 px-2 py-1 bg-muted rounded text-xs">{alert.param}</code>
                      </div>
                    )}
                  </div>

                  {alert.attack && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Attack:</span>
                      <code className="ml-2 px-2 py-1 bg-muted rounded text-xs break-all">{alert.attack}</code>
                    </div>
                  )}

                  {alert.evidence && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Evidence:</span>
                      <code className="ml-2 px-2 py-1 bg-muted rounded text-xs break-all">{alert.evidence}</code>
                    </div>
                  )}

                  {alert.description && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-1">Description</p>
                      <p className="text-sm whitespace-pre-wrap">{alert.description}</p>
                    </div>
                  )}

                  {alert.solution && (
                    <div className="p-3 bg-green-500/10 border-l-4 border-green-500 rounded">
                      <p className="text-sm font-medium mb-1 text-green-700 dark:text-green-400">Solution</p>
                      <p className="text-sm whitespace-pre-wrap">{alert.solution}</p>
                    </div>
                  )}

                  {alert.reference && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">References:</span>
                      <p className="mt-1 text-xs whitespace-pre-wrap">{alert.reference}</p>
                    </div>
                  )}

                  {showSuppressionReason && alert.suppression_reason && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-1">Suppression Reason</p>
                      <p className="text-sm">{alert.suppression_reason}</p>
                    </div>
                  )}

                  {!showSuppressionReason && (
                    <div className="flex gap-2 pt-2">
                      {onMarkFalsePositive && (
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onMarkFalsePositive(alert); }}>
                          <Flag className="h-4 w-4 mr-2" />
                          {alert.is_false_positive ? 'Unmark False Positive' : 'Mark as False Positive'}
                        </Button>
                      )}
                      {onSuppress && !alert.is_suppressed && (
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onSuppress(alert); }}>
                          <EyeOff className="h-4 w-4 mr-2" /> Suppress
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    </ScrollArea>
  );
};
