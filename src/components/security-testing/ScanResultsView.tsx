import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Shield, AlertTriangle, ChevronDown, ChevronRight, Download, 
  Eye, EyeOff, CheckCircle, XCircle, Clock, FileJson, FileText, Flag
} from "lucide-react";
import { SecurityScan, SecurityFinding, OWASP_CATEGORIES, SEVERITY_COLORS, SEVERITY_ORDER, OWASPCategoryKey } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ScanResultsViewProps {
  scan: SecurityScan;
  onRefresh: () => void;
}

export const ScanResultsView = ({ scan, onRefresh }: ScanResultsViewProps) => {
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [suppressDialogOpen, setSuppressDialogOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null);
  const [suppressionReason, setSuppressionReason] = useState('');

  const findings = scan.security_findings || [];
  const summary = scan.summary || { total_findings: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, endpoints_scanned: 0, categories_tested: 0 };

  const toggleExpand = (id: string) => {
    setExpandedFindings(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSuppress = async () => {
    if (!selectedFinding || !suppressionReason) return;

    const { error } = await (supabase as any)
      .from('security_findings')
      .update({
        is_suppressed: true,
        suppression_reason: suppressionReason,
      })
      .eq('id', selectedFinding.id);

    if (error) {
      toast.error('Failed to suppress finding');
    } else {
      toast.success('Finding suppressed');
      onRefresh();
    }

    setSuppressDialogOpen(false);
    setSelectedFinding(null);
    setSuppressionReason('');
  };

  const handleMarkFalsePositive = async (finding: SecurityFinding) => {
    const { error } = await (supabase as any)
      .from('security_findings')
      .update({ is_false_positive: !finding.is_false_positive })
      .eq('id', finding.id);

    if (error) {
      toast.error('Failed to update finding');
    } else {
      toast.success(finding.is_false_positive ? 'Unmarked as false positive' : 'Marked as false positive');
      onRefresh();
    }
  };

  const exportReport = async (format: 'json' | 'sarif' | 'html') => {
    if (format === 'html') {
      // Generate HTML report
      const html = generateHTMLReport(scan, findings);
      const blob = new Blob([html], { type: 'text/html' });
      downloadBlob(blob, `security-report-${scan.id}.html`);
      return;
    }

    try {
      const { data } = await supabase.functions.invoke('security-scan', {
        body: { action: 'export', scanId: scan.id, format },
      });

      if (data) {
        const blob = new Blob([JSON.stringify(data.report || data, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `security-report-${scan.id}.${format}`);
      }
    } catch (error) {
      toast.error('Failed to export report');
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateHTMLReport = (scan: SecurityScan, findings: SecurityFinding[]) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Security Scan Report - ${new Date(scan.created_at).toLocaleDateString()}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 30px; }
    .summary-card { padding: 15px; border-radius: 8px; text-align: center; }
    .critical { background: #dc2626; color: white; }
    .high { background: #f97316; color: white; }
    .medium { background: #eab308; color: black; }
    .low { background: #3b82f6; color: white; }
    .info { background: #6b7280; color: white; }
    .finding { border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 15px; padding: 15px; }
    .finding-header { display: flex; justify-content: space-between; align-items: center; }
    .badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .evidence { background: #f3f4f6; padding: 10px; border-radius: 4px; margin-top: 10px; font-family: monospace; font-size: 12px; }
    .remediation { background: #ecfdf5; border-left: 4px solid #10b981; padding: 10px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛡️ Security Scan Report</h1>
    <p>Scan ID: ${scan.id}</p>
    <p>Date: ${new Date(scan.created_at).toLocaleString()}</p>
    <p>Status: ${scan.status}</p>
  </div>
  
  <div class="summary">
    <div class="summary-card critical"><strong>${summary.critical}</strong><br>Critical</div>
    <div class="summary-card high"><strong>${summary.high}</strong><br>High</div>
    <div class="summary-card medium"><strong>${summary.medium}</strong><br>Medium</div>
    <div class="summary-card low"><strong>${summary.low}</strong><br>Low</div>
    <div class="summary-card info"><strong>${summary.info}</strong><br>Info</div>
  </div>
  
  <h2>Findings (${findings.length})</h2>
  ${findings.map(f => `
    <div class="finding">
      <div class="finding-header">
        <div>
          <span class="badge ${f.severity}">${f.severity.toUpperCase()}</span>
          <strong>${f.vulnerability_name}</strong>
          <span style="color: #6b7280;">- ${OWASP_CATEGORIES[f.owasp_category as OWASPCategoryKey]?.name || f.owasp_category}</span>
        </div>
        <span>Confidence: ${f.confidence}%</span>
      </div>
      <p><strong>Endpoint:</strong> ${f.http_method || 'GET'} ${f.affected_endpoint}</p>
      ${f.payload_used ? `<p><strong>Payload:</strong> <code>${f.payload_used}</code></p>` : ''}
      <div class="evidence"><strong>Evidence:</strong><br>${JSON.stringify(f.evidence, null, 2)}</div>
      <div class="remediation"><strong>Remediation:</strong> ${f.remediation}</div>
    </div>
  `).join('')}
</body>
</html>`;
  };

  const groupedFindings = SEVERITY_ORDER.reduce((acc, severity) => {
    acc[severity] = findings.filter(f => f.severity === severity && !f.is_suppressed);
    return acc;
  }, {} as Record<string, SecurityFinding[]>);

  const getStatusIcon = () => {
    switch (scan.status) {
      case 'completed': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'running': return <Clock className="h-5 w-5 text-blue-500 animate-spin" />;
      default: return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Status & Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {getStatusIcon()}
              Scan Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{scan.status}</div>
            {scan.started_at && (
              <p className="text-xs text-muted-foreground">
                Started: {new Date(scan.started_at).toLocaleString()}
              </p>
            )}
            {scan.completed_at && (
              <p className="text-xs text-muted-foreground">
                Completed: {new Date(scan.completed_at).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Findings Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {summary.critical > 0 && <Badge className="bg-red-600">{summary.critical} Critical</Badge>}
              {summary.high > 0 && <Badge className="bg-orange-500">{summary.high} High</Badge>}
              {summary.medium > 0 && <Badge className="bg-yellow-500 text-black">{summary.medium} Medium</Badge>}
              {summary.low > 0 && <Badge className="bg-blue-500">{summary.low} Low</Badge>}
              {summary.info > 0 && <Badge variant="secondary">{summary.info} Info</Badge>}
              {summary.total_findings === 0 && <Badge variant="outline">No findings</Badge>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Endpoints scanned</span>
                <span className="font-medium">{summary.endpoints_scanned}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Categories tested</span>
                <span className="font-medium">{summary.categories_tested}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export Options */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => exportReport('html')}>
          <FileText className="h-4 w-4 mr-2" />
          Export HTML
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportReport('json')}>
          <FileJson className="h-4 w-4 mr-2" />
          Export JSON
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportReport('sarif')}>
          <Download className="h-4 w-4 mr-2" />
          Export SARIF
        </Button>
      </div>

      {/* Findings by Severity */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({findings.filter(f => !f.is_suppressed).length})</TabsTrigger>
          {SEVERITY_ORDER.map(severity => (
            groupedFindings[severity].length > 0 && (
              <TabsTrigger key={severity} value={severity} className="capitalize">
                {severity} ({groupedFindings[severity].length})
              </TabsTrigger>
            )
          ))}
          {findings.filter(f => f.is_suppressed).length > 0 && (
            <TabsTrigger value="suppressed">
              Suppressed ({findings.filter(f => f.is_suppressed).length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="all">
          <FindingsList 
            findings={findings.filter(f => !f.is_suppressed)} 
            expandedFindings={expandedFindings}
            onToggleExpand={toggleExpand}
            onMarkFalsePositive={handleMarkFalsePositive}
            onSuppress={(f) => { setSelectedFinding(f); setSuppressDialogOpen(true); }}
          />
        </TabsContent>

        {SEVERITY_ORDER.map(severity => (
          <TabsContent key={severity} value={severity}>
            <FindingsList 
              findings={groupedFindings[severity]} 
              expandedFindings={expandedFindings}
              onToggleExpand={toggleExpand}
              onMarkFalsePositive={handleMarkFalsePositive}
              onSuppress={(f) => { setSelectedFinding(f); setSuppressDialogOpen(true); }}
            />
          </TabsContent>
        ))}

        <TabsContent value="suppressed">
          <FindingsList 
            findings={findings.filter(f => f.is_suppressed)} 
            expandedFindings={expandedFindings}
            onToggleExpand={toggleExpand}
            onMarkFalsePositive={handleMarkFalsePositive}
            showSuppressionReason
          />
        </TabsContent>
      </Tabs>

      {/* Suppress Dialog */}
      <Dialog open={suppressDialogOpen} onOpenChange={setSuppressDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suppress Finding</DialogTitle>
            <DialogDescription>
              Suppressed findings will be hidden from reports. Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for suppression</Label>
              <Textarea
                value={suppressionReason}
                onChange={(e) => setSuppressionReason(e.target.value)}
                placeholder="e.g., False positive - this endpoint is protected by WAF"
              />
            </div>
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

interface FindingsListProps {
  findings: SecurityFinding[];
  expandedFindings: Set<string>;
  onToggleExpand: (id: string) => void;
  onMarkFalsePositive?: (finding: SecurityFinding) => void;
  onSuppress?: (finding: SecurityFinding) => void;
  showSuppressionReason?: boolean;
}

const FindingsList = ({ 
  findings, 
  expandedFindings, 
  onToggleExpand, 
  onMarkFalsePositive, 
  onSuppress,
  showSuppressionReason 
}: FindingsListProps) => {
  if (findings.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No findings in this category</p>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[600px]">
      <div className="space-y-3">
        {findings.map((finding) => (
          <Collapsible 
            key={finding.id} 
            open={expandedFindings.has(finding.id)}
            onOpenChange={() => onToggleExpand(finding.id)}
          >
            <Card className={finding.is_false_positive ? 'opacity-60' : ''}>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedFindings.has(finding.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <Badge className={SEVERITY_COLORS[finding.severity]}>
                        {finding.severity.toUpperCase()}
                      </Badge>
                      <span className="font-medium">{finding.vulnerability_name}</span>
                      <Badge variant="outline">{finding.owasp_category}</Badge>
                      {finding.is_false_positive && <Badge variant="secondary">False Positive</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Confidence: {finding.confidence}%
                      </span>
                      <Progress value={finding.confidence} className="w-20 h-2" />
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Endpoint:</span>
                      <code className="ml-2 px-2 py-1 bg-muted rounded">
                        {finding.http_method || 'GET'} {finding.affected_endpoint}
                      </code>
                    </div>
                    <div>
                      <span className="text-muted-foreground">OWASP Category:</span>
                      <span className="ml-2">
                        {OWASP_CATEGORIES[finding.owasp_category as OWASPCategoryKey]?.name || finding.owasp_category}
                      </span>
                    </div>
                  </div>

                  {finding.payload_used && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Payload:</span>
                      <code className="ml-2 px-2 py-1 bg-muted rounded text-xs">
                        {finding.payload_used}
                      </code>
                    </div>
                  )}

                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium mb-1">Evidence</p>
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(finding.evidence, null, 2)}
                    </pre>
                  </div>

                  <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm font-medium mb-1 text-green-800 dark:text-green-200">Remediation</p>
                    <p className="text-sm text-green-700 dark:text-green-300">{finding.remediation}</p>
                  </div>

                  {showSuppressionReason && finding.suppression_reason && (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <p className="text-sm font-medium mb-1 text-yellow-800 dark:text-yellow-200">Suppression Reason</p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">{finding.suppression_reason}</p>
                    </div>
                  )}

                  {!showSuppressionReason && (
                    <div className="flex gap-2">
                      {onMarkFalsePositive && (
                        <Button variant="outline" size="sm" onClick={() => onMarkFalsePositive(finding)}>
                          {finding.is_false_positive ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
                          {finding.is_false_positive ? 'Unmark False Positive' : 'Mark as False Positive'}
                        </Button>
                      )}
                      {onSuppress && !finding.is_suppressed && (
                        <Button variant="outline" size="sm" onClick={() => onSuppress(finding)}>
                          <Flag className="h-4 w-4 mr-2" />
                          Suppress
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
