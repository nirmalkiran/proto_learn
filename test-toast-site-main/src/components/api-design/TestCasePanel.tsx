import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Play,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Loader2,
  Pencil,
  Plus,
  Trash2
} from "lucide-react";
import { GeneratedTestCase, TestExecutionResult, TestAssertion } from "./types";
import { TestCaseDataEditor } from "./TestCaseDataEditor";

interface TestCasePanelProps {
  testCases: GeneratedTestCase[];
  endpointMethod: string;
  endpointPath: string;
  onExecuteTestCase: (testCase: GeneratedTestCase) => Promise<void>;
  onExecuteSelected: (selectedIds: string[]) => Promise<void>;
  onUpdateTestCase: (testCase: GeneratedTestCase) => void;
  onAddTestCase: (testCase: GeneratedTestCase) => void;
  onDeleteTestCase: (testCaseId: string) => void;
  isExecuting: boolean;
  executingTestCaseId: string | null;
}

export const TestCasePanel = ({
  testCases,
  endpointMethod,
  endpointPath,
  onExecuteTestCase,
  onExecuteSelected,
  onUpdateTestCase,
  onAddTestCase,
  onDeleteTestCase,
  isExecuting,
  executingTestCaseId
}: TestCasePanelProps) => {
  const [expandedTestCases, setExpandedTestCases] = useState<Set<string>>(new Set());
  const [selectedTestCases, setSelectedTestCases] = useState<Set<string>>(new Set(testCases.map(tc => tc.id)));
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState<GeneratedTestCase | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const createNewTestCase = (): GeneratedTestCase => ({
    id: `tc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: 'New Test Case',
    description: '',
    type: 'positive',
    priority: 'Medium',
    method: endpointMethod,
    endpoint: endpointPath,
    expectedStatus: 200,
    assertions: [{ type: 'status_code', condition: 'equals', value: '200', description: 'Check status code' }]
  });

  const openCreateDialog = () => {
    setEditingTestCase(createNewTestCase());
    setIsCreating(true);
    setEditDialogOpen(true);
  };

  const openEditDialog = (testCase: GeneratedTestCase) => {
    setEditingTestCase({ ...testCase, assertions: [...testCase.assertions] });
    setIsCreating(false);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (editingTestCase) {
      if (isCreating) {
        onAddTestCase(editingTestCase);
      } else {
        onUpdateTestCase(editingTestCase);
      }
      setEditDialogOpen(false);
      setEditingTestCase(null);
      setIsCreating(false);
    }
  };

  const updateEditingField = (field: keyof GeneratedTestCase, value: any) => {
    if (editingTestCase) {
      setEditingTestCase({ ...editingTestCase, [field]: value });
    }
  };

  const updateAssertion = (index: number, field: keyof TestAssertion, value: string) => {
    if (editingTestCase) {
      const newAssertions = [...editingTestCase.assertions];
      newAssertions[index] = { ...newAssertions[index], [field]: value };
      setEditingTestCase({ ...editingTestCase, assertions: newAssertions });
    }
  };

  const addAssertion = () => {
    if (editingTestCase) {
      setEditingTestCase({
        ...editingTestCase,
        assertions: [...editingTestCase.assertions, { type: 'status_code', condition: 'equals', value: '200', description: 'Check status code' }]
      });
    }
  };

  const removeAssertion = (index: number) => {
    if (editingTestCase) {
      const newAssertions = editingTestCase.assertions.filter((_, i) => i !== index);
      setEditingTestCase({ ...editingTestCase, assertions: newAssertions });
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedTestCases);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedTestCases(newExpanded);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedTestCases);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTestCases(newSelected);
  };

  const selectAll = () => {
    setSelectedTestCases(new Set(testCases.map(tc => tc.id)));
  };

  const deselectAll = () => {
    setSelectedTestCases(new Set());
  };

  const getStatusIcon = (result?: TestExecutionResult) => {
    if (!result) return <Clock className="h-4 w-4 text-muted-foreground" />;
    switch (result.status) {
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
    }
  };

  const getTypeColor = (type: GeneratedTestCase['type']) => {
    switch (type) {
      case 'positive': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'negative': return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'edge': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'security': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    }
  };

  const getPriorityColor = (priority: GeneratedTestCase['priority']) => {
    switch (priority) {
      case 'High': return 'bg-red-500/10 text-red-600';
      case 'Medium': return 'bg-amber-500/10 text-amber-600';
      case 'Low': return 'bg-blue-500/10 text-blue-600';
    }
  };

  const passedCount = testCases.filter(tc => tc.lastExecution?.status === 'passed').length;
  const failedCount = testCases.filter(tc => tc.lastExecution?.status === 'failed').length;
  const notRunCount = testCases.filter(tc => !tc.lastExecution).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Test Cases ({testCases.length})</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 text-sm mr-4">
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle className="h-4 w-4" /> {passedCount}
              </span>
              <span className="flex items-center gap-1 text-red-600">
                <XCircle className="h-4 w-4" /> {failedCount}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-4 w-4" /> {notRunCount}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={selectedTestCases.size === testCases.length ? deselectAll : selectAll}
            >
              {selectedTestCases.size === testCases.length ? 'Deselect All' : 'Select All'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openCreateDialog}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Test
            </Button>
            <Button
              size="sm"
              onClick={() => onExecuteSelected(Array.from(selectedTestCases))}
              disabled={isExecuting || selectedTestCases.size === 0}
            >
              {isExecuting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              Run Selected ({selectedTestCases.size})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {testCases.map(testCase => (
              <Collapsible
                key={testCase.id}
                open={expandedTestCases.has(testCase.id)}
                onOpenChange={() => toggleExpand(testCase.id)}
              >
                <div className={`border rounded-lg transition-all ${
                  expandedTestCases.has(testCase.id) ? 'border-primary' : ''
                }`}>
                  <div className="p-3 flex items-center gap-3">
                    <Checkbox
                      checked={selectedTestCases.has(testCase.id)}
                      onCheckedChange={() => toggleSelect(testCase.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
                      {expandedTestCases.has(testCase.id) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      {getStatusIcon(testCase.lastExecution)}
                      <span className="font-medium text-sm flex-1">{testCase.name}</span>
                    </CollapsibleTrigger>
                    <Badge variant="outline" className={getTypeColor(testCase.type)}>
                      {testCase.type}
                    </Badge>
                    <Badge variant="outline" className={getPriorityColor(testCase.priority)}>
                      {testCase.priority}
                    </Badge>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {testCase.expectedStatus}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDialog(testCase);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExecuteTestCase(testCase);
                      }}
                      disabled={isExecuting}
                    >
                      {executingTestCaseId === testCase.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTestCase(testCase.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  
                  <CollapsibleContent>
                    <div className="px-3 pb-3 pt-0">
                      {/* Test Case Data Editor */}
                      <TestCaseDataEditor 
                        testCase={testCase} 
                        onUpdate={onUpdateTestCase} 
                      />
                      
                      <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Description</p>
                          <p className="text-sm">{testCase.description || <span className="text-muted-foreground italic">No description</span>}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Expected Status</p>
                          <Badge variant="secondary" className="font-mono">
                            {testCase.expectedStatus}
                          </Badge>
                        </div>
                      </div>
                      
                      {testCase.assertions.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-muted-foreground mb-2">Assertions</p>
                          <div className="space-y-1">
                            {testCase.assertions.map((assertion, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                {testCase.lastExecution?.assertionResults?.[idx]?.passed !== undefined && (
                                  testCase.lastExecution.assertionResults[idx].passed ? (
                                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                                  ) : (
                                    <XCircle className="h-3 w-3 text-red-500" />
                                  )
                                )}
                                <span className="text-muted-foreground">
                                  {assertion.type}: {assertion.condition} {assertion.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {testCase.lastExecution && (
                        <div className="mt-3 p-2 bg-muted/50 rounded">
                          <p className="text-xs text-muted-foreground mb-2">Last Execution</p>
                          <div className="flex items-center gap-4 text-xs flex-wrap">
                            <span>Status: <Badge variant={testCase.lastExecution.status === 'passed' ? 'default' : 'destructive'}>
                              {testCase.lastExecution.status.toUpperCase()} ({testCase.lastExecution.responseStatus})
                            </Badge></span>
                            <span>Time: {testCase.lastExecution.responseTime}ms</span>
                            <span className="text-muted-foreground">
                              {new Date(testCase.lastExecution.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {testCase.lastExecution.error && (
                            <p className="text-xs text-red-500 mt-2">{testCase.lastExecution.error}</p>
                          )}
                          {testCase.lastExecution.responseData && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground mb-1">Response:</p>
                              <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap break-all">
                                {typeof testCase.lastExecution.responseData === 'object' 
                                  ? JSON.stringify(testCase.lastExecution.responseData, null, 2)
                                  : String(testCase.lastExecution.responseData)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Edit Test Case Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isCreating ? 'Add New Test Case' : 'Edit Test Case'}</DialogTitle>
          </DialogHeader>
          {editingTestCase && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={editingTestCase.name}
                    onChange={(e) => updateEditingField('name', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={editingTestCase.type}
                    onValueChange={(value) => updateEditingField('type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="positive">Positive</SelectItem>
                      <SelectItem value="negative">Negative</SelectItem>
                      <SelectItem value="edge">Edge</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingTestCase.description}
                  onChange={(e) => updateEditingField('description', e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={editingTestCase.priority}
                    onValueChange={(value) => updateEditingField('priority', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select
                    value={editingTestCase.method}
                    onValueChange={(value) => updateEditingField('method', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="DELETE">DELETE</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Expected Status</Label>
                  <Input
                    type="number"
                    value={editingTestCase.expectedStatus}
                    onChange={(e) => updateEditingField('expectedStatus', parseInt(e.target.value) || 200)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Endpoint</Label>
                <Input
                  value={editingTestCase.endpoint}
                  onChange={(e) => updateEditingField('endpoint', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Assertions</Label>
                  <Button variant="outline" size="sm" onClick={addAssertion}>
                    <Plus className="h-4 w-4 mr-1" /> Add Assertion
                  </Button>
                </div>
                <div className="space-y-2">
                  {editingTestCase.assertions.map((assertion, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                      <Select
                        value={assertion.type}
                        onValueChange={(value) => updateAssertion(idx, 'type', value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="status_code">Status Code</SelectItem>
                          <SelectItem value="response_body">Response Body</SelectItem>
                          <SelectItem value="response_header">Response Header</SelectItem>
                          <SelectItem value="response_time">Response Time</SelectItem>
                          <SelectItem value="json_path">JSON Path</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={assertion.condition}
                        onValueChange={(value) => updateAssertion(idx, 'condition', value)}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equals">Equals</SelectItem>
                          <SelectItem value="contains">Contains</SelectItem>
                          <SelectItem value="not_equals">Not Equals</SelectItem>
                          <SelectItem value="greater_than">Greater Than</SelectItem>
                          <SelectItem value="less_than">Less Than</SelectItem>
                          <SelectItem value="exists">Exists</SelectItem>
                          <SelectItem value="not_exists">Not Exists</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Value"
                        value={assertion.value}
                        onChange={(e) => updateAssertion(idx, 'value', e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAssertion(idx)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
