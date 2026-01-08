import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Trash2,
  FileJson,
  Timer,
  Save,
  Loader2
} from "lucide-react";
import { GeneratedTestCase, TestExecutionResult } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ExecutionRecord {
  testCaseId: string;
  testCaseName: string;
  testCaseType: string;
  execution: TestExecutionResult;
  executionIndex: number;
}

interface ExecutionResultsPanelProps {
  testCases: GeneratedTestCase[];
  endpointMethod: string;
  endpointPath: string;
  projectId?: string;
  onClearHistory: () => void;
}

export const ExecutionResultsPanel = ({
  testCases,
  endpointMethod,
  endpointPath,
  projectId,
  onClearHistory
}: ExecutionResultsPanelProps) => {
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [responseTab, setResponseTab] = useState<Record<string, 'formatted' | 'raw'>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [reportName, setReportName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Get ALL execution records from test cases - both lastExecution and executionHistory
  const executionRecords: ExecutionRecord[] = testCases
    .flatMap(tc => {
      const records: ExecutionRecord[] = [];
      
      // Add all from execution history
      if (tc.executionHistory && tc.executionHistory.length > 0) {
        tc.executionHistory.forEach((exec, idx) => {
          records.push({
            testCaseId: tc.id,
            testCaseName: tc.name,
            testCaseType: tc.type,
            execution: exec,
            executionIndex: idx
          });
        });
      } else if (tc.lastExecution) {
        // Fallback to lastExecution if no history exists
        records.push({
          testCaseId: tc.id,
          testCaseName: tc.name,
          testCaseType: tc.type,
          execution: tc.lastExecution,
          executionIndex: 0
        });
      }
      
      return records;
    })
    .sort((a, b) => new Date(b.execution.timestamp).getTime() - new Date(a.execution.timestamp).getTime());

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedResults(newExpanded);
  };

  const getStatusIcon = (status: TestExecutionResult['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
    }
  };

  const getStatusColor = (status: TestExecutionResult['status']) => {
    switch (status) {
      case 'passed': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'failed': return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'error': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'positive': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'negative': return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'edge': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'security': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      default: return 'bg-muted';
    }
  };

  const getHttpStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-emerald-600';
    if (status >= 400 && status < 500) return 'text-amber-600';
    if (status >= 500) return 'text-red-600';
    return 'text-muted-foreground';
  };

  const passedCount = executionRecords.filter(r => r.execution.status === 'passed').length;
  const failedCount = executionRecords.filter(r => r.execution.status === 'failed').length;
  const errorCount = executionRecords.filter(r => r.execution.status === 'error').length;

  const formatResponseData = (data: any): string => {
    try {
      if (typeof data === 'object') {
        return JSON.stringify(data, null, 2);
      }
      return String(data);
    } catch {
      return String(data);
    }
  };

  const handleSaveResults = async () => {
    if (!projectId) {
      toast({
        title: "Project Required",
        description: "Please save your project first to save execution results",
        variant: "destructive"
      });
      return;
    }

    if (!reportName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for the execution report",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const reportContent = {
        endpoint: {
          method: endpointMethod,
          path: endpointPath
        },
        executedAt: new Date().toISOString(),
        summary: {
          total: executionRecords.length,
          passed: passedCount,
          failed: failedCount,
          errors: errorCount
        },
        results: executionRecords.map(record => ({
          testCaseId: record.testCaseId,
          testCaseName: record.testCaseName,
          testCaseType: record.testCaseType,
          status: record.execution.status,
          responseStatus: record.execution.responseStatus,
          responseTime: record.execution.responseTime,
          timestamp: record.execution.timestamp,
          assertionResults: record.execution.assertionResults,
          responseData: record.execution.responseData,
          responseHeaders: record.execution.responseHeaders,
          error: record.execution.error
        }))
      };

      const { error } = await supabase
        .from('saved_test_reports')
        .insert({
          project_id: projectId,
          user_id: user.id,
          report_name: reportName.trim(),
          report_type: 'api_execution',
          report_content: JSON.stringify(reportContent, null, 2),
          statistics: {
            total: executionRecords.length,
            passed: passedCount,
            failed: failedCount,
            errors: errorCount,
            endpoint: `${endpointMethod} ${endpointPath}`
          }
        });

      if (error) throw error;

      toast({
        title: "Results Saved",
        description: `Execution results saved as "${reportName}"`
      });
      setShowSaveDialog(false);
      setReportName("");
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save results",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (executionRecords.length === 0) {
    return (
      <Card className="h-[400px] flex items-center justify-center">
        <div className="text-center">
          <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-2">No execution results yet</p>
          <p className="text-sm text-muted-foreground">
            Run test cases to see their execution results here
          </p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              Execution Results ({executionRecords.length})
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle className="h-4 w-4" /> {passedCount}
                </span>
                <span className="flex items-center gap-1 text-red-600">
                  <XCircle className="h-4 w-4" /> {failedCount}
                </span>
                {errorCount > 0 && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertCircle className="h-4 w-4" /> {errorCount}
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(true)}>
                <Save className="h-4 w-4 mr-1" />
                Save Results
              </Button>
              <Button variant="outline" size="sm" onClick={onClearHistory}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear History
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="font-mono text-xs">
              {endpointMethod}
            </Badge>
            <span className="text-sm text-muted-foreground font-mono">{endpointPath}</span>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {executionRecords.map((record, index) => {
                const uniqueKey = `${record.testCaseId}-${record.executionIndex}-${index}`;
                const currentResponseTab = responseTab[uniqueKey] || 'formatted';
                
                return (
                  <Collapsible
                    key={uniqueKey}
                    open={expandedResults.has(uniqueKey)}
                    onOpenChange={() => toggleExpand(uniqueKey)}
                  >
                    <div className={`border rounded-lg transition-all ${
                      expandedResults.has(uniqueKey) ? 'border-primary' : ''
                    }`}>
                      <CollapsibleTrigger className="w-full">
                        <div className="p-3 flex items-center gap-3">
                          {expandedResults.has(uniqueKey) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          {getStatusIcon(record.execution.status)}
                          <span className="font-medium text-sm flex-1 text-left">
                            {record.testCaseName}
                          </span>
                          <Badge variant="outline" className={getTypeColor(record.testCaseType)}>
                            {record.testCaseType}
                          </Badge>
                          <Badge variant="outline" className={getStatusColor(record.execution.status)}>
                            {record.execution.status.toUpperCase()}
                          </Badge>
                          <Badge variant="secondary" className={`font-mono text-xs ${getHttpStatusColor(record.execution.responseStatus)}`}>
                            {record.execution.responseStatus}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Timer className="h-3 w-3" />
                            {record.execution.responseTime}ms
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(record.execution.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-0 space-y-4">
                          {/* Execution Summary */}
                          <div className="grid grid-cols-4 gap-4 p-3 bg-muted/30 rounded-lg">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Status</p>
                              <Badge variant="outline" className={getStatusColor(record.execution.status)}>
                                {record.execution.status.toUpperCase()}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">HTTP Status</p>
                              <span className={`font-mono font-medium ${getHttpStatusColor(record.execution.responseStatus)}`}>
                                {record.execution.responseStatus}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Response Time</p>
                              <span className="font-mono text-sm">{record.execution.responseTime}ms</span>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Executed At</p>
                              <span className="text-sm">
                                {new Date(record.execution.timestamp).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Error Message */}
                          {record.execution.error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                              <p className="text-xs font-medium text-red-600 mb-1">Error</p>
                              <p className="text-sm text-red-600">{record.execution.error}</p>
                            </div>
                          )}

                          {/* Assertions Results */}
                          {record.execution.assertionResults && record.execution.assertionResults.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-2 font-medium">Assertion Results</p>
                              <div className="space-y-1">
                                {record.execution.assertionResults.map((result, idx) => (
                                  <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded text-sm">
                                    {result.passed ? (
                                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span className="flex-1">
                                      {result.assertion.description || `${result.assertion.type}: ${result.assertion.condition} ${result.assertion.value}`}
                                    </span>
                                    {result.actualValue !== undefined && (
                                      <span className="text-xs text-muted-foreground">
                                        Actual: <code className="bg-muted px-1 rounded">{String(result.actualValue)}</code>
                                      </span>
                                    )}
                                    {result.message && (
                                      <span className="text-xs text-muted-foreground">{result.message}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Response Headers */}
                          {record.execution.responseHeaders && Object.keys(record.execution.responseHeaders).length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-2 font-medium">Response Headers</p>
                              <div className="bg-muted/30 rounded-lg p-2 max-h-32 overflow-auto">
                                <table className="w-full text-xs">
                                  <tbody>
                                    {Object.entries(record.execution.responseHeaders).map(([key, value]) => (
                                      <tr key={key} className="border-b border-muted last:border-0">
                                        <td className="py-1 pr-4 font-mono font-medium">{key}</td>
                                        <td className="py-1 text-muted-foreground font-mono">{value}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Response Data */}
                          {record.execution.responseData !== undefined && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-muted-foreground font-medium">Response Body</p>
                                <Tabs 
                                  value={currentResponseTab} 
                                  onValueChange={(v) => setResponseTab(prev => ({ ...prev, [uniqueKey]: v as 'formatted' | 'raw' }))}
                                  className="h-7"
                                >
                                  <TabsList className="h-7">
                                    <TabsTrigger value="formatted" className="text-xs h-6 px-2">
                                      <FileJson className="h-3 w-3 mr-1" />
                                      Formatted
                                    </TabsTrigger>
                                    <TabsTrigger value="raw" className="text-xs h-6 px-2">
                                      Raw
                                    </TabsTrigger>
                                  </TabsList>
                                </Tabs>
                              </div>
                              <div className="bg-muted/50 rounded-lg p-3 max-h-64 overflow-auto">
                                {currentResponseTab === 'formatted' ? (
                                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                                    {formatResponseData(record.execution.responseData)}
                                  </pre>
                                ) : (
                                  <pre className="text-xs font-mono whitespace-pre break-all">
                                    {typeof record.execution.responseData === 'object' 
                                      ? JSON.stringify(record.execution.responseData)
                                      : String(record.execution.responseData)}
                                  </pre>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Save Results Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Execution Results</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="report-name">Report Name</Label>
              <Input
                id="report-name"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="e.g., API Test Run - Jan 2026"
              />
            </div>
            <div className="p-3 bg-muted/50 rounded-lg space-y-2 text-sm">
              <p className="font-medium">Summary</p>
              <div className="flex items-center gap-4">
                <span>Endpoint: <code className="bg-muted px-1 rounded">{endpointMethod} {endpointPath}</code></span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-emerald-600">Passed: {passedCount}</span>
                <span className="text-red-600">Failed: {failedCount}</span>
                {errorCount > 0 && <span className="text-amber-600">Errors: {errorCount}</span>}
                <span className="text-muted-foreground">Total: {executionRecords.length}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveResults} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Results
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};