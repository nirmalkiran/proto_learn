import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle, XCircle, Edit3, Shield, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PendingTestCase {
  title: string;
  description?: string;
  steps?: string[] | string;
  expectedResult?: string;
  expected?: string;
  priority?: string;
  name?: string;
}

interface TestCaseApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testCases: PendingTestCase[];
  confidence: number;
  warnings: string[];
  onApprove: (approvedTestCases: PendingTestCase[]) => void;
  onReject: (reason: string) => void;
  isProcessing?: boolean;
}

export const TestCaseApprovalDialog = ({
  open,
  onOpenChange,
  testCases,
  confidence,
  warnings,
  onApprove,
  onReject,
  isProcessing = false,
}: TestCaseApprovalDialogProps) => {
  const [selectedTestCases, setSelectedTestCases] = useState<Set<number>>(new Set(testCases.map((_, index) => index)));
  const [editedTestCases, setEditedTestCases] = useState<Map<number, PendingTestCase>>(new Map());
  const [expandedTestCases, setExpandedTestCases] = useState<Set<number>>(new Set([0]));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.85) return "text-success";
    if (conf >= 0.5) return "text-warning";
    return "text-destructive";
  };

  const getConfidenceBadge = (conf: number) => {
    if (conf >= 0.85) return "bg-success/20 text-success";
    if (conf >= 0.5) return "bg-warning/20 text-warning";
    return "bg-destructive/20 text-destructive";
  };

  const handleToggleSelect = (index: number) => {
    setSelectedTestCases((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedTestCases.size === testCases.length) {
      setSelectedTestCases(new Set());
    } else {
      setSelectedTestCases(new Set(testCases.map((_, index) => index)));
    }
  };

  const handleToggleExpand = (index: number) => {
    setExpandedTestCases((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleEditTestCase = (index: number, field: keyof PendingTestCase, value: string) => {
    const currentTestCase = editedTestCases.get(index) || testCases[index];
    const updated = { ...currentTestCase, [field]: value };
    setEditedTestCases((prev) => new Map(prev).set(index, updated));
  };

  const getTestCase = (index: number): PendingTestCase => {
    return editedTestCases.get(index) || testCases[index];
  };

  const getStepsArray = (tc: PendingTestCase): string[] => {
    if (!tc.steps) return [];
    if (Array.isArray(tc.steps)) return tc.steps;
    return tc.steps.split("\n").filter((s) => s.trim());
  };

  const handleApprove = () => {
    const approvedTestCases = Array.from(selectedTestCases)
      .map((index) => getTestCase(index))
      .filter(Boolean);
    onApprove(approvedTestCases);
  };

  const handleReject = () => {
    onReject(rejectReason);
    setRejectDialogOpen(false);
    setRejectReason("");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Review AI-Generated Test Cases
            </DialogTitle>
            <DialogDescription>These test cases require human approval before being saved.</DialogDescription>
          </DialogHeader>

          {/* Confidence and Warnings */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">AI Confidence:</span>
              <Badge className={getConfidenceBadge(confidence)}>{(confidence * 100).toFixed(0)}%</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedTestCases.size} of {testCases.length} selected
              </span>
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {selectedTestCases.size === testCases.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                <div className="space-y-1">
                  {warnings.map((warning, index) => (
                    <p key={index} className="text-sm text-warning">
                      {warning}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Test Cases List */}
          <ScrollArea className="flex-1 min-h-0 max-h-[400px] overflow-auto">
            <div className="space-y-2 pr-4">
              {testCases.map((tc, index) => {
                const testCase = getTestCase(index);
                const isSelected = selectedTestCases.has(index);
                const isExpanded = expandedTestCases.has(index);
                const isEditing = editingIndex === index;
                const steps = getStepsArray(testCase);

                return (
                  <Collapsible key={index} open={isExpanded}>
                    <div
                      className={`border rounded-lg transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div className="flex items-center gap-3 p-3">
                        <Checkbox checked={isSelected} onCheckedChange={() => handleToggleSelect(index)} />
                        <CollapsibleTrigger
                          className="flex-1 flex items-center justify-between cursor-pointer"
                          onClick={() => handleToggleExpand(index)}
                        >
                          <div className="flex-1 text-left">
                            <p className="font-medium">{testCase.title || testCase.name}</p>
                            {testCase.description && (
                              <p className="text-sm text-muted-foreground line-clamp-1">{testCase.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{testCase.priority || "medium"}</Badge>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </CollapsibleTrigger>
                        <Button variant="ghost" size="sm" onClick={() => setEditingIndex(isEditing ? null : index)}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                      </div>

                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-0 border-t space-y-3">
                          {isEditing ? (
                            <div className="space-y-3 pt-3">
                              <div>
                                <Label>Title</Label>
                                <Input
                                  value={testCase.title || testCase.name || ""}
                                  onChange={(e) => handleEditTestCase(index, "title", e.target.value)}
                                />
                              </div>
                              <div>
                                <Label>Description</Label>
                                <Textarea
                                  value={testCase.description || ""}
                                  onChange={(e) => handleEditTestCase(index, "description", e.target.value)}
                                />
                              </div>
                              <div>
                                <Label>Steps (one per line)</Label>
                                <Textarea
                                  value={steps.join("\n")}
                                  onChange={(e) => handleEditTestCase(index, "steps", e.target.value)}
                                  rows={4}
                                />
                              </div>
                              <div>
                                <Label>Expected Result</Label>
                                <Textarea
                                  value={testCase.expectedResult || testCase.expected || ""}
                                  onChange={(e) => handleEditTestCase(index, "expectedResult", e.target.value)}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2 pt-3">
                              {testCase.description && (
                                <div>
                                  <p className="text-xs text-muted-foreground font-medium">Description</p>
                                  <p className="text-sm">{testCase.description}</p>
                                </div>
                              )}
                              {steps.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground font-medium">Steps</p>
                                  <ol className="text-sm list-decimal list-inside space-y-1">
                                    {steps.map((step, stepIndex) => (
                                      <li key={stepIndex}>{step}</li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                              {(testCase.expectedResult || testCase.expected) && (
                                <div>
                                  <p className="text-xs text-muted-foreground font-medium">Expected Result</p>
                                  <p className="text-sm">{testCase.expectedResult || testCase.expected}</p>
                                </div>
                              )}
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

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRejectDialogOpen(true)} disabled={isProcessing}>
              <XCircle className="h-4 w-4 mr-2" />
              Reject All
            </Button>
            <Button onClick={handleApprove} disabled={selectedTestCases.size === 0 || isProcessing}>
              <CheckCircle className="h-4 w-4 mr-2" />
              {isProcessing ? "Saving..." : `Approve ${selectedTestCases.size} Test Case(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Test Cases</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting these AI-generated test cases. This feedback helps improve future
              generations.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Reason for rejection</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Steps are too vague, missing edge cases, incorrect expected results..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              Reject All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
