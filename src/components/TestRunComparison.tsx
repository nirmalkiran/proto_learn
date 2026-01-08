import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowUp, ArrowDown, Minus, CheckCircle, XCircle, AlertCircle, Clock, SkipForward, TrendingUp, TrendingDown, Equal } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TestRun {
  id: string;
  name: string;
  runType: string;
  status: string;
  createdAt: string;
  testCaseCount: number;
  passedCount: number;
  failedCount: number;
  blockedCount: number;
  skippedCount: number;
}

interface ComparisonCase {
  testCaseId: string;
  testCaseTitle: string;
  testCaseReadableId: string;
  run1Status: string | null;
  run2Status: string | null;
  statusChange: "improved" | "regressed" | "same" | "new" | "removed";
}

interface TestRunComparisonProps {
  projectId: string;
  testRuns: TestRun[];
  onBack: () => void;
}

const STATUS_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  not_run: { icon: Clock, color: "text-muted-foreground", label: "Not Run" },
  passed: { icon: CheckCircle, color: "text-green-600", label: "Passed" },
  failed: { icon: XCircle, color: "text-destructive", label: "Failed" },
  blocked: { icon: AlertCircle, color: "text-yellow-600", label: "Blocked" },
  skipped: { icon: SkipForward, color: "text-gray-500", label: "Skipped" },
};

const STATUS_PRIORITY: Record<string, number> = {
  passed: 4,
  skipped: 3,
  not_run: 2,
  blocked: 1,
  failed: 0,
};

export const TestRunComparison = ({ projectId, testRuns, onBack }: TestRunComparisonProps) => {
  const { toast } = useToast();
  const [run1Id, setRun1Id] = useState<string>("");
  const [run2Id, setRun2Id] = useState<string>("");
  const [comparisonData, setComparisonData] = useState<ComparisonCase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [run1Data, setRun1Data] = useState<TestRun | null>(null);
  const [run2Data, setRun2Data] = useState<TestRun | null>(null);

  const loadComparisonData = async () => {
    if (!run1Id || !run2Id) return;

    setIsLoading(true);
    try {
      // Load cases for both runs
      const [run1Cases, run2Cases] = await Promise.all([
        supabase
          .from("test_run_cases")
          .select(`
            test_case_id,
            status,
            test_cases(title, readable_id)
          `)
          .eq("test_run_id", run1Id),
        supabase
          .from("test_run_cases")
          .select(`
            test_case_id,
            status,
            test_cases(title, readable_id)
          `)
          .eq("test_run_id", run2Id),
      ]);

      if (run1Cases.error) throw run1Cases.error;
      if (run2Cases.error) throw run2Cases.error;

      const run1Map = new Map(
        (run1Cases.data || []).map((c: any) => [c.test_case_id, { status: c.status, title: c.test_cases?.title, readableId: c.test_cases?.readable_id }])
      );
      const run2Map = new Map(
        (run2Cases.data || []).map((c: any) => [c.test_case_id, { status: c.status, title: c.test_cases?.title, readableId: c.test_cases?.readable_id }])
      );

      // Combine all unique test case IDs
      const allTestCaseIds = new Set([...run1Map.keys(), ...run2Map.keys()]);

      const comparison: ComparisonCase[] = Array.from(allTestCaseIds).map(tcId => {
        const run1Case = run1Map.get(tcId);
        const run2Case = run2Map.get(tcId);

        let statusChange: ComparisonCase["statusChange"] = "same";
        
        if (!run1Case && run2Case) {
          statusChange = "new";
        } else if (run1Case && !run2Case) {
          statusChange = "removed";
        } else if (run1Case && run2Case) {
          const run1Priority = STATUS_PRIORITY[run1Case.status] ?? 2;
          const run2Priority = STATUS_PRIORITY[run2Case.status] ?? 2;
          
          if (run2Priority > run1Priority) {
            statusChange = "improved";
          } else if (run2Priority < run1Priority) {
            statusChange = "regressed";
          }
        }

        return {
          testCaseId: tcId,
          testCaseTitle: run2Case?.title || run1Case?.title || "Unknown",
          testCaseReadableId: run2Case?.readableId || run1Case?.readableId || "",
          run1Status: run1Case?.status || null,
          run2Status: run2Case?.status || null,
          statusChange,
        };
      });

      // Sort: regressed first, then improved, then same
      comparison.sort((a, b) => {
        const order = { regressed: 0, improved: 1, new: 2, removed: 3, same: 4 };
        return order[a.statusChange] - order[b.statusChange];
      });

      setComparisonData(comparison);
      setRun1Data(testRuns.find(r => r.id === run1Id) || null);
      setRun2Data(testRuns.find(r => r.id === run2Id) || null);
    } catch (error) {
      console.error("Error loading comparison data:", error);
      toast({
        title: "Error",
        description: "Failed to load comparison data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (run1Id && run2Id) {
      loadComparisonData();
    }
  }, [run1Id, run2Id]);

  const getStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline" className="text-muted-foreground">N/A</Badge>;
    
    const config = STATUS_CONFIG[status];
    if (!config) return <Badge variant="secondary">{status}</Badge>;
    
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={`gap-1 ${config.color}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getChangeIcon = (change: ComparisonCase["statusChange"]) => {
    switch (change) {
      case "improved":
        return <ArrowUp className="h-4 w-4 text-green-600" />;
      case "regressed":
        return <ArrowDown className="h-4 w-4 text-destructive" />;
      case "new":
        return <Badge variant="outline" className="text-blue-600 text-xs">New</Badge>;
      case "removed":
        return <Badge variant="outline" className="text-muted-foreground text-xs">Removed</Badge>;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStats = () => {
    const improved = comparisonData.filter(c => c.statusChange === "improved").length;
    const regressed = comparisonData.filter(c => c.statusChange === "regressed").length;
    const same = comparisonData.filter(c => c.statusChange === "same").length;
    const newCases = comparisonData.filter(c => c.statusChange === "new").length;
    const removed = comparisonData.filter(c => c.statusChange === "removed").length;

    return { improved, regressed, same, newCases, removed, total: comparisonData.length };
  };

  const stats = getStats();

  const getPassRateDiff = () => {
    if (!run1Data || !run2Data) return null;
    
    const run1Rate = run1Data.testCaseCount > 0 ? (run1Data.passedCount / run1Data.testCaseCount) * 100 : 0;
    const run2Rate = run2Data.testCaseCount > 0 ? (run2Data.passedCount / run2Data.testCaseCount) * 100 : 0;
    const diff = run2Rate - run1Rate;
    
    return { run1Rate, run2Rate, diff };
  };

  const passRateDiff = getPassRateDiff();

  return (
    <div className="h-full flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h2 className="text-lg font-semibold">Compare Test Runs</h2>
        </div>

        {/* Run Selectors */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-sm text-muted-foreground mb-1 block">Baseline Run</label>
            <Select value={run1Id} onValueChange={setRun1Id}>
              <SelectTrigger>
                <SelectValue placeholder="Select baseline run..." />
              </SelectTrigger>
              <SelectContent>
                {testRuns.filter(r => r.id !== run2Id).map(run => (
                  <SelectItem key={run.id} value={run.id}>
                    {run.name} ({new Date(run.createdAt).toLocaleDateString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="pt-6">
            <span className="text-muted-foreground">vs</span>
          </div>
          <div className="flex-1">
            <label className="text-sm text-muted-foreground mb-1 block">Compare Run</label>
            <Select value={run2Id} onValueChange={setRun2Id}>
              <SelectTrigger>
                <SelectValue placeholder="Select run to compare..." />
              </SelectTrigger>
              <SelectContent>
                {testRuns.filter(r => r.id !== run1Id).map(run => (
                  <SelectItem key={run.id} value={run.id}>
                    {run.name} ({new Date(run.createdAt).toLocaleDateString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Comparison Content */}
      {run1Id && run2Id && !isLoading && comparisonData.length > 0 && (
        <>
          {/* Summary Stats */}
          <div className="p-4 border-b border-border">
            <div className="grid grid-cols-6 gap-3">
              {passRateDiff && (
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className={`text-2xl font-bold ${passRateDiff.diff > 0 ? 'text-green-600' : passRateDiff.diff < 0 ? 'text-destructive' : ''}`}>
                        {passRateDiff.diff > 0 ? '+' : ''}{passRateDiff.diff.toFixed(1)}%
                      </div>
                      {passRateDiff.diff > 0 ? (
                        <TrendingUp className="h-5 w-5 text-green-600" />
                      ) : passRateDiff.diff < 0 ? (
                        <TrendingDown className="h-5 w-5 text-destructive" />
                      ) : (
                        <Equal className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">Pass Rate Change</div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="p-3">
                  <div className="text-2xl font-bold text-green-600">{stats.improved}</div>
                  <div className="text-xs text-muted-foreground">Improved</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-2xl font-bold text-destructive">{stats.regressed}</div>
                  <div className="text-xs text-muted-foreground">Regressed</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-2xl font-bold">{stats.same}</div>
                  <div className="text-xs text-muted-foreground">Unchanged</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-2xl font-bold text-blue-600">{stats.newCases}</div>
                  <div className="text-xs text-muted-foreground">New Cases</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-2xl font-bold text-muted-foreground">{stats.removed}</div>
                  <div className="text-xs text-muted-foreground">Removed</div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Comparison Table */}
          <ScrollArea className="flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Test Case</TableHead>
                  <TableHead className="w-[140px] text-center">{run1Data?.name || "Baseline"}</TableHead>
                  <TableHead className="w-[60px] text-center">Change</TableHead>
                  <TableHead className="w-[140px] text-center">{run2Data?.name || "Compare"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonData.map((item) => (
                  <TableRow 
                    key={item.testCaseId}
                    className={
                      item.statusChange === "regressed" ? "bg-red-50 dark:bg-red-900/10" :
                      item.statusChange === "improved" ? "bg-green-50 dark:bg-green-900/10" :
                      ""
                    }
                  >
                    <TableCell className="font-mono text-xs">{item.testCaseReadableId}</TableCell>
                    <TableCell className="font-medium">{item.testCaseTitle}</TableCell>
                    <TableCell className="text-center">{getStatusBadge(item.run1Status)}</TableCell>
                    <TableCell className="text-center">{getChangeIcon(item.statusChange)}</TableCell>
                    <TableCell className="text-center">{getStatusBadge(item.run2Status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </>
      )}

      {/* Empty State */}
      {(!run1Id || !run2Id) && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Select two test runs to compare their results
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Loading comparison data...
        </div>
      )}

      {/* No Data State */}
      {run1Id && run2Id && !isLoading && comparisonData.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          No test cases found in the selected runs
        </div>
      )}
    </div>
  );
};
