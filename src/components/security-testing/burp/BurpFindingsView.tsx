import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Shield, ChevronDown, ChevronRight, Download, Eye, EyeOff, 
  CheckCircle, XCircle, Clock, FileJson, FileText, Flag,
  ExternalLink, Code, AlertTriangle, ArrowLeft
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { BurpScan, BurpFinding } from "./types";
import { OWASP_CATEGORIES, SEVERITY_COLORS, SEVERITY_ORDER } from "../types";

interface BurpFindingsViewProps {
  scan: BurpScan;
  onBack: () => void;
  onRefresh: () => void;
}

export const BurpFindingsView = ({ scan, onBack, onRefresh }: BurpFindingsViewProps) => {
  const [findings, setFindings] = useState<BurpFinding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [suppressDialogOpen, setSuppressDialogOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<BurpFinding | null>(null);
  const [suppressionReason, setSuppressionReason] = useState('');

  useEffect(() => {
    loadFindings();
  }, [scan.id]);

  const loadFindings = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('burp_findings')
        .select('*')
        .eq('scan_id', scan.id)
        .order('severity', { ascending: true });

      if (error) throw error;
      
      // Sort by severity order
      const sortedData = (data || []).sort((a: BurpFinding, b: BurpFinding) => {
        return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
      });
      
      setFindings(sortedData);
    } catch (error) {
      console.error('Error loading findings:', error);
      toast.error('Failed to load findings');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedFindings(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSuppress = async () => {
    if (!selectedFinding || !suppressionReason) return;

    try {
      const { error } = await (supabase as any)
        .from('burp_findings')
        .update({
          is_suppressed: true,
          suppression_reason: suppressionReason,
        })
        .eq('id', selectedFinding.id);

      if (error) throw error;
      toast.success('Finding suppressed');
      setSuppressDialogOpen(false);
      setSelectedFinding(null);
      setSuppressionReason('');
      loadFindings();
    } catch (error) {
      toast.error('Failed to suppress finding');
    }
  };

  const handleMarkFalsePositive = async (finding: BurpFinding) => {
    try {
      const { error } = await (supabase as any)
        .from('burp_findings')
        .update({ is_false_positive: !finding.is_false_positive })
        .eq('id', finding.id);

      if (error) throw error;
      toast.success(finding.is_false_positive ? 'Unmarked as false positive' : 'Marked as false positive');
      loadFindings();
    } catch (error) {
      toast.error('Failed to update finding');
    }
  };

  const exportReport = async (format: 'json' | 'sarif' | 'html') => {
    try {
      const { data, error } = await supabase.functions.invoke('burp-agent-api', {
        body: { action: 'generate_report', scanId: scan.id, format },
      });

      if (error) throw error;

      const blob = new Blob(
        [format === 'html' ? data.report : JSON.stringify(data.report || data, null, 2)],
        { type: format === 'html' ? 'text/html' : 'application/json' }
      );
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `burp-report-${scan.run_id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to export report');
    }
  };

  const groupedFindings = SEVERITY_ORDER.reduce((acc, severity) => {
    acc[severity] = findings.filter(f => f.severity === severity && !f.is_suppressed);
    return acc;
  }, {} as Record<string, BurpFinding[]>);

  const summary = {
    critical: scan.critical_count || 0,
    high: scan.high_count || 0,
    medium: scan.medium_count || 0,
    low: scan.low_count || 0,
    info: scan.info_count || 0,
    total: (scan.critical_count || 0) + (scan.high_count || 0) + (scan.medium_count || 0) + (scan.low_count || 0) + (scan.info_count || 0),
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Scans
        </Button>
        <Card className="animate-pulse">
          <CardContent className="h-64" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{scan.name}</h2>
            <p className="text-sm text-muted-foreground">{scan.run_id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportReport('html')}>
            <FileText className="h-4 w-4 mr-2" />
            HTML
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport('sarif')}>
            <FileJson className="h-4 w-4 mr-2" />
            SARIF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-red-600">{summary.critical}</div>
            <div className="text-sm text-muted-foreground">Critical</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-orange-500">{summary.high}</div>
            <div className="text-sm text-muted-foreground">High</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-yellow-500">{summary.medium}</div>
            <div className="text-sm text-muted-foreground">Medium</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-blue-500">{summary.low}</div>
            <div className="text-sm text-muted-foreground">Low</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-muted-foreground">{summary.info}</div>
            <div className="text-sm text-muted-foreground">Info</div>
          </CardContent>
        </Card>
      </div>

      {/* Findings Tabs */}
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
                placeholder="e.g., False positive - protected by WAF"
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
  findings: BurpFinding[];
  expandedFindings: Set<string>;
  onToggleExpand: (id: string) => void;
  onMarkFalsePositive?: (finding: BurpFinding) => void;
  onSuppress?: (finding: BurpFinding) => void;
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
      <div className="space-y-3 pr-4">
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
                      <span className="font-medium text-left">{finding.issue_name}</span>
                      {finding.owasp_category && (
                        <Badge variant="outline">{finding.owasp_category}</Badge>
                      )}
                      {finding.is_false_positive && (
                        <Badge variant="secondary">False Positive</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {finding.confidence}
                      </Badge>
                      {finding.occurrence_count && finding.occurrence_count > 1 && (
                        <Badge variant="secondary">×{finding.occurrence_count}</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 space-y-4">
                  {/* Location */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">URL:</span>
                      <code className="ml-2 px-2 py-1 bg-muted rounded text-xs break-all">
                        {finding.http_method || 'GET'} {finding.url}
                      </code>
                    </div>
                    {finding.cwe_id && (
                      <div>
                        <span className="text-muted-foreground">CWE:</span>
                        <a 
                          href={`https://cwe.mitre.org/data/definitions/${finding.cwe_id}.html`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-primary hover:underline"
                        >
                          CWE-{finding.cwe_id}
                          <ExternalLink className="h-3 w-3 inline ml-1" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Issue Details */}
                  {finding.issue_detail && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-1">Details</p>
                      <p className="text-sm whitespace-pre-wrap">{finding.issue_detail}</p>
                    </div>
                  )}

                  {/* Payload */}
                  {finding.payload_used && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Payload:</span>
                      <code className="ml-2 px-2 py-1 bg-muted rounded text-xs">
                        {finding.payload_used}
                      </code>
                    </div>
                  )}

                  {/* Remediation */}
                  {finding.remediation_detail && (
                    <div className="p-3 bg-green-500/10 border-l-4 border-green-500 rounded">
                      <p className="text-sm font-medium mb-1 text-green-700 dark:text-green-400">Remediation</p>
                      <p className="text-sm">{finding.remediation_detail}</p>
                    </div>
                  )}

                  {/* Suppression Reason */}
                  {showSuppressionReason && finding.suppression_reason && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-1">Suppression Reason</p>
                      <p className="text-sm">{finding.suppression_reason}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {!showSuppressionReason && (
                    <div className="flex gap-2 pt-2">
                      {onMarkFalsePositive && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); onMarkFalsePositive(finding); }}
                        >
                          <Flag className="h-4 w-4 mr-2" />
                          {finding.is_false_positive ? 'Unmark False Positive' : 'Mark as False Positive'}
                        </Button>
                      )}
                      {onSuppress && !finding.is_suppressed && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); onSuppress(finding); }}
                        >
                          <EyeOff className="h-4 w-4 mr-2" />
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
