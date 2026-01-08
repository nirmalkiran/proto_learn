import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, PlayCircle, AlertCircle, CheckCircle, XCircle, Info, Wrench, Loader2, History } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAISafetyControls } from "@/hooks/useAISafetyControls";

interface FixHistory {
  testName: string;
  errorMessage: string;
  fixedAt: string;
  filesModified: string[];
}

interface PendingFix {
  errorKey: string;
  test: any;
  testIndex: number;
  filesModified: string[];
  analysis: string;
  fixes: Array<{
    file_path: string;
    fixed_content: string;
  }>;
}

interface ExecutionResultProps {
  projectId: string;
}

interface AutomationResult {
  id: string;
  run_id: string;
  json_result: any;
  timestamp: string;
  created_at: string;
}

export const ExecutionResult: React.FC<ExecutionResultProps> = ({ projectId }) => {
  const [results, setResults] = useState<AutomationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<AutomationResult | null>(null);
  const [fixingError, setFixingError] = useState<string | null>(null);
  const [errorFixes, setErrorFixes] = useState<Record<string, string>>({});
  const [fixHistory, setFixHistory] = useState<FixHistory[]>([]);
  const [pendingFix, setPendingFix] = useState<PendingFix | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [applyingFix, setApplyingFix] = useState(false);
  const { checkRateLimit } = useAISafetyControls(projectId);

  useEffect(() => {
    // Load fix history from localStorage
    const storedHistory = localStorage.getItem(`fix-history-${projectId}`);
    if (storedHistory) {
      setFixHistory(JSON.parse(storedHistory));
    }
  }, [projectId]);

  useEffect(() => {
    fetchResults();
  }, [projectId]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("automation_results")
        .select("*")
        .eq("project_id", projectId)
        .order("timestamp", { ascending: false });

      if (error) throw error;
      setResults(data || []);
    } catch (error) {
      console.error("Error fetching automation results:", error);
      toast.error("Failed to load execution results");
    } finally {
      setLoading(false);
    }
  };

  const getStatusFromResult = (jsonResult: any) => {
    if (!jsonResult) return "unknown";
    
    // Check test cases if they exist
    if (jsonResult.tests && Array.isArray(jsonResult.tests) && jsonResult.tests.length > 0) {
      const hasFailed = jsonResult.tests.some((test: any) => test.status === 'FAILED');
      const allSkipped = jsonResult.tests.every((test: any) => test.status === 'SKIPPED');
      const allPassed = jsonResult.tests.every((test: any) => test.status === 'PASSED');
      
      if (hasFailed) return "failed";
      if (allSkipped) return "skipped";
      if (allPassed) return "passed";
    }
    
    // Fallback to old logic
    if (jsonResult.status) return jsonResult.status.toLowerCase();
    if (jsonResult.success === true) return "passed";
    if (jsonResult.success === false) return "failed";
    return "unknown";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "passed":
      case "success":
        return <Badge className="bg-green-500">Passed</Badge>;
      case "failed":
      case "error":
        return <Badge className="bg-red-500">Failed</Badge>;
      case "skipped":
        return <Badge className="bg-yellow-500">Skipped</Badge>;
      case "running":
        return <Badge className="bg-blue-500">Running</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const isErrorAlreadyFixed = (test: any) => {
    return fixHistory.some(fix => 
      fix.testName === test.testName && 
      fix.errorMessage === test.error?.message
    );
  };

  const handleFixError = async (test: any, testIndex: number) => {
    const errorKey = `${selectedResult?.id}-${testIndex}`;
    setFixingError(errorKey);

    // Check rate limit before proceeding
    const canProceed = await checkRateLimit(projectId);
    if (!canProceed) {
      toast.error("Daily AI generation limit reached. Try again tomorrow.");
      setFixingError(null);
      return;
    }

    try {
      const errorContext = {
        testName: test.testName,
        description: test.description,
        errorType: test.error?.type,
        errorMessage: test.error?.message,
        logs: test.logs,
        testData: test
      };

      toast.info("Analyzing error and fetching repository code...");

      const { data, error } = await supabase.functions.invoke('fix-test-error', {
        body: { 
          errorContext,
          projectId,
          analyzeOnly: true // First, just analyze without applying fixes
        }
      });

      if (error) throw error;

      if (data?.fixes && data.fixes.length > 0) {
        // Show confirmation dialog with files that will be modified
        const filePaths = data.fixes.map((f: any) => f.file_path);
        setPendingFix({
          errorKey,
          test,
          testIndex,
          filesModified: filePaths,
          analysis: data.analysis || '',
          fixes: data.fixes
        });
        // Select all files by default
        setSelectedFiles(new Set(filePaths));
        toast.info("Review the proposed changes");
      } else if (data?.suggestion) {
        setErrorFixes(prev => ({
          ...prev,
          [errorKey]: data.suggestion
        }));
        toast.warning("Could not auto-fix, but here's a suggestion");
      } else {
        toast.warning("No fixes could be generated for this error");
      }
    } catch (error) {
      console.error('Error fixing test:', error);
      toast.error("Failed to analyze error");
      setErrorFixes(prev => ({
        ...prev,
        [errorKey]: "Failed to analyze error. Please try again."
      }));
    } finally {
      setFixingError(null);
    }
  };

  const applyFix = async () => {
    if (!pendingFix) return;

    const selectedFilesArray = Array.from(selectedFiles);
    if (selectedFilesArray.length === 0) {
      toast.error("Please select at least one file to apply fixes");
      return;
    }

    setApplyingFix(true);
    const { errorKey, test, fixes, analysis } = pendingFix;

    try {
      // Filter fixes to only include selected files
      const filteredFixes = fixes.filter(fix => selectedFiles.has(fix.file_path));
      
      toast.info(`Applying fixes to ${selectedFilesArray.length} file(s)...`);

      const { data, error } = await supabase.functions.invoke('fix-test-error', {
        body: { 
          errorContext: {
            testName: test.testName,
            description: test.description,
            errorType: test.error?.type,
            errorMessage: test.error?.message,
            logs: test.logs,
            testData: test
          },
          projectId,
          analyzeOnly: false,
          proposedFixes: filteredFixes // Send only selected fixes
        }
      });

      if (error) throw error;

      const filesList = selectedFilesArray.map((f: string) => `• ${f}`).join('\n');
      setErrorFixes(prev => ({
        ...prev,
        [errorKey]: `✅ Auto-fixed successfully!\n\nFiles modified:\n${filesList}\n\n${analysis}`
      }));
      
      // Add to fix history
      const newFix: FixHistory = {
        testName: test.testName,
        errorMessage: test.error?.message || '',
        fixedAt: new Date().toISOString(),
        filesModified: selectedFilesArray
      };
      const updatedHistory = [newFix, ...fixHistory];
      setFixHistory(updatedHistory);
      localStorage.setItem(`fix-history-${projectId}`, JSON.stringify(updatedHistory));
      
      toast.success(`Auto-fixed successfully! Modified ${selectedFilesArray.length} file(s)`);
      setPendingFix(null);
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('Error applying fix:', error);
      toast.error("Failed to apply fixes");
    } finally {
      setApplyingFix(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading execution results...</div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8">
          <PlayCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No execution results yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Run automation tests to see results here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => {
                const status = getStatusFromResult(result.json_result);
                const isExpanded = selectedResult?.id === result.id;
                return (
                  <React.Fragment key={result.id}>
                    <TableRow 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedResult(isExpanded ? null : result)}
                    >
                      <TableCell className="font-mono text-sm">{result.run_id}</TableCell>
                      <TableCell>{getStatusBadge(status)}</TableCell>
                      <TableCell className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {format(new Date(result.timestamp), "PPpp")}
                      </TableCell>
                      <TableCell>
                        <button 
                          className="text-primary hover:underline text-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedResult(isExpanded ? null : result);
                          }}
                        >
                          {isExpanded ? 'Close Details' : 'View Details'}
                        </button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={4} className="p-0">
                          <div className="p-6 bg-muted/30">
                            <div className="flex items-center gap-2 mb-4">
                              <AlertCircle className="h-5 w-5" />
                              <h3 className="font-semibold">Execution Details - {result.run_id}</h3>
                            </div>
                            <Tabs defaultValue="summary" className="w-full">
                              <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="summary">Summary</TabsTrigger>
                                <TabsTrigger value="tests">Test Results</TabsTrigger>
                                <TabsTrigger value="environment">Environment</TabsTrigger>
                                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                              </TabsList>
                              
                              <TabsContent value="summary" className="mt-4">
                                {result.json_result?.summary && (
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <Card>
                                      <CardContent className="p-4 text-center">
                                        <div className="text-2xl font-bold text-blue-600">
                                          {result.json_result.summary.totalTests}
                                        </div>
                                        <div className="text-sm text-muted-foreground">Total Tests</div>
                                      </CardContent>
                                    </Card>
                                    <Card>
                                      <CardContent className="p-4 text-center">
                                        <div className="text-2xl font-bold text-green-600 flex items-center justify-center gap-1">
                                          <CheckCircle className="h-5 w-5" />
                                          {result.json_result.summary.passed}
                                        </div>
                                        <div className="text-sm text-muted-foreground">Passed</div>
                                      </CardContent>
                                    </Card>
                                    <Card>
                                      <CardContent className="p-4 text-center">
                                        <div className="text-2xl font-bold text-red-600 flex items-center justify-center gap-1">
                                          <XCircle className="h-5 w-5" />
                                          {result.json_result.summary.failed}
                                        </div>
                                        <div className="text-sm text-muted-foreground">Failed</div>
                                      </CardContent>
                                    </Card>
                                    <Card>
                                      <CardContent className="p-4 text-center">
                                        <div className="text-2xl font-bold text-yellow-600">
                                          {result.json_result.summary.skipped || 0}
                                        </div>
                                        <div className="text-sm text-muted-foreground">Skipped</div>
                                      </CardContent>
                                    </Card>
                                  </div>
                                )}
                                {result.json_result?.summary?.totalExecutionTimeMs && (
                                  <Card className="mt-4">
                                    <CardContent className="p-4">
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm text-muted-foreground">Total Execution Time:</span>
                                        <span className="font-semibold">
                                          {(result.json_result.summary.totalExecutionTimeMs / 1000).toFixed(2)}s
                                        </span>
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}
                              </TabsContent>

                              <TabsContent value="tests" className="mt-4">
                                {result.json_result?.tests && (
                                  <Card>
                                    <CardContent className="p-0">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Test Name</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Duration</TableHead>
                                            <TableHead>Details</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {result.json_result.tests.map((test: any, index: number) => (
                                            <TableRow key={index}>
                                              <TableCell className="font-mono text-sm">{test.testName}</TableCell>
                                              <TableCell className="max-w-xs truncate" title={test.description}>
                                                {test.description}
                                              </TableCell>
                                              <TableCell>
                                                {test.status === 'PASSED' && (
                                                  <Badge className="bg-green-500">
                                                    <CheckCircle className="h-3 w-3 mr-1" />
                                                    Passed
                                                  </Badge>
                                                )}
                                                {test.status === 'FAILED' && (
                                                  <Badge className="bg-red-500">
                                                    <XCircle className="h-3 w-3 mr-1" />
                                                    Failed
                                                  </Badge>
                                                )}
                                              </TableCell>
                                              <TableCell>
                                                {test.executionTimeMs && `${(test.executionTimeMs / 1000).toFixed(2)}s`}
                                              </TableCell>
                                              <TableCell>
                                                <div className="space-y-2">
                                                  {test.error && (
                                                    <>
                                                      <details className="cursor-pointer">
                                                        <summary className="text-red-600 hover:underline">
                                                          View Error
                                                        </summary>
                                                        <div className="mt-2 p-2 bg-red-50 rounded text-xs">
                                                          <div className="font-semibold">{test.error.type}</div>
                                                          <div className="mt-1">{test.error.message}</div>
                                                        </div>
                                                      </details>
                                                      {isErrorAlreadyFixed(test) && (
                                                        <Badge className="bg-blue-500 mb-2">
                                                          <CheckCircle className="h-3 w-3 mr-1" />
                                                          Already Fixed Previously
                                                        </Badge>
                                                      )}
                                                      <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleFixError(test, index)}
                                                        disabled={fixingError === `${selectedResult?.id}-${index}`}
                                                        className="w-full"
                                                      >
                                                        {fixingError === `${selectedResult?.id}-${index}` ? (
                                                          <>
                                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                            Auto-fixing...
                                                          </>
                                                        ) : (
                                                          <>
                                                            <Wrench className="h-3 w-3 mr-1" />
                                                            {isErrorAlreadyFixed(test) ? 'Fix Again' : 'Auto-Fix Error'}
                                                          </>
                                                        )}
                                                      </Button>
                                                      {errorFixes[`${selectedResult?.id}-${index}`] && (
                                                        <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded text-xs">
                                                          <div className="font-semibold text-green-800 mb-2 flex items-center gap-1">
                                                            <CheckCircle className="h-3 w-3" />
                                                            Fix Applied:
                                                          </div>
                                                          <div className="text-green-700 whitespace-pre-wrap">
                                                            {errorFixes[`${selectedResult?.id}-${index}`]}
                                                          </div>
                                                        </div>
                                                      )}
                                                    </>
                                                  )}
                                                  {test.logs && test.logs.length > 0 && (
                                                    <details className="cursor-pointer">
                                                      <summary className="text-blue-600 hover:underline">
                                                        View Logs ({test.logs.length})
                                                      </summary>
                                                      <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                                                        {test.logs.map((log: string, logIndex: number) => (
                                                          <div key={logIndex} className="mb-1">
                                                            {logIndex + 1}. {log}
                                                          </div>
                                                        ))}
                                                      </div>
                                                    </details>
                                                  )}
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </CardContent>
                                  </Card>
                                )}
                              </TabsContent>

                              <TabsContent value="environment" className="mt-4">
                                <Card>
                                  <CardContent className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {result.json_result?.project && (
                                        <div className="flex items-center gap-2">
                                          <Info className="h-4 w-4 text-muted-foreground" />
                                          <span className="text-sm text-muted-foreground">Project:</span>
                                          <span className="font-semibold">{result.json_result.project}</span>
                                        </div>
                                      )}
                                      {result.json_result?.environment && (
                                        <div className="flex items-center gap-2">
                                          <Info className="h-4 w-4 text-muted-foreground" />
                                          <span className="text-sm text-muted-foreground">Environment:</span>
                                          <span className="font-semibold">{result.json_result.environment}</span>
                                        </div>
                                      )}
                                      {result.json_result?.browser && (
                                        <div className="flex items-center gap-2">
                                          <Info className="h-4 w-4 text-muted-foreground" />
                                          <span className="text-sm text-muted-foreground">Browser:</span>
                                          <span className="font-semibold">{result.json_result.browser}</span>
                                        </div>
                                      )}
                                      {result.json_result?.platform && (
                                        <div className="flex items-center gap-2">
                                          <Info className="h-4 w-4 text-muted-foreground" />
                                          <span className="text-sm text-muted-foreground">Platform:</span>
                                          <span className="font-semibold">{result.json_result.platform}</span>
                                        </div>
                                      )}
                                      {result.json_result?.executionDate && (
                                        <div className="flex items-center gap-2">
                                          <Clock className="h-4 w-4 text-muted-foreground" />
                                          <span className="text-sm text-muted-foreground">Execution Date:</span>
                                          <span className="font-semibold">
                                            {format(new Date(result.json_result.executionDate), "PPpp")}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </CardContent>
                                </Card>
                              </TabsContent>

                              <TabsContent value="raw" className="mt-4">
                                <Card>
                                  <CardContent className="p-4">
                                    <ScrollArea className="h-[400px] w-full rounded border p-4">
                                      <pre className="text-xs whitespace-pre-wrap break-all max-w-full overflow-hidden">
                                        {JSON.stringify(result.json_result, null, 2)}
                                      </pre>
                                    </ScrollArea>
                                  </CardContent>
                                </Card>
                              </TabsContent>

                              <TabsContent value="fixhistory" className="mt-4">
                                <Card>
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                      <History className="h-5 w-5" />
                                      Error Fix History
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    {fixHistory.length === 0 ? (
                                      <div className="text-center py-8 text-muted-foreground">
                                        <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                        <p>No errors have been fixed yet.</p>
                                        <p className="text-sm mt-2">When you fix errors, they will appear here.</p>
                                      </div>
                                    ) : (
                                      <div className="space-y-4">
                                        {fixHistory.map((fix, index) => (
                                          <Card key={index} className="border-l-4 border-l-green-500">
                                            <CardContent className="p-4">
                                              <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1">
                                                  <div className="flex items-center gap-2 mb-1">
                                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                                    <span className="font-semibold">{fix.testName}</span>
                                                  </div>
                                                  <div className="text-sm text-muted-foreground mb-2">
                                                    {fix.errorMessage}
                                                  </div>
                                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    Fixed on {format(new Date(fix.fixedAt), "PPpp")}
                                                  </div>
                                                </div>
                                              </div>
                                              {fix.filesModified && fix.filesModified.length > 0 && (
                                                <div className="mt-3 p-2 bg-muted rounded">
                                                  <div className="text-xs font-semibold mb-1">Files Modified:</div>
                                                  <ul className="text-xs space-y-1">
                                                    {fix.filesModified.map((file, fileIndex) => (
                                                      <li key={fileIndex} className="flex items-center gap-1">
                                                        <CheckCircle className="h-3 w-3 text-green-500" />
                                                        <code className="bg-background px-1 rounded">{file}</code>
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              )}
                                            </CardContent>
                                          </Card>
                                        ))}
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              </TabsContent>
                            </Tabs>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Fix */}
      <AlertDialog open={!!pendingFix} onOpenChange={(open) => {
        if (!open) {
          setPendingFix(null);
          setSelectedFiles(new Set());
        }
      }}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Auto-Fix</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <div>
                Select the files you want to apply fixes to for <strong>{pendingFix?.test?.testName}</strong>:
              </div>
              
              <div className="bg-muted p-3 rounded-md max-h-[300px] overflow-y-auto">
                <div className="font-semibold text-sm mb-3">Files to be modified:</div>
                <div className="space-y-2">
                  {pendingFix?.filesModified.map((file, index) => (
                    <div key={index} className="flex items-center gap-3 p-2 rounded hover:bg-background/50 transition-colors">
                      <Checkbox
                        id={`file-${index}`}
                        checked={selectedFiles.has(file)}
                        onCheckedChange={(checked) => {
                          const newSelected = new Set(selectedFiles);
                          if (checked) {
                            newSelected.add(file);
                          } else {
                            newSelected.delete(file);
                          }
                          setSelectedFiles(newSelected);
                        }}
                      />
                      <label 
                        htmlFor={`file-${index}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        <code className="bg-background px-1.5 py-0.5 rounded text-xs">{file}</code>
                      </label>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground mt-3 pt-2 border-t border-border">
                  {selectedFiles.size} of {pendingFix?.filesModified.length || 0} files selected
                </div>
              </div>

              {pendingFix?.analysis && (
                <div className="text-sm">
                  <div className="font-semibold mb-1">Analysis:</div>
                  <div className="text-muted-foreground whitespace-pre-wrap text-xs">{pendingFix.analysis}</div>
                </div>
              )}

              <div className="text-sm text-amber-600 dark:text-amber-400">
                ⚠️ This will update the selected files in your repository. Make sure to review the changes after applying.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyingFix}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyFix} disabled={applyingFix || selectedFiles.size === 0}>
              {applyingFix ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                `Apply Fix to ${selectedFiles.size} File${selectedFiles.size !== 1 ? 's' : ''}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
