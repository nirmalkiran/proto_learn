import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Trash2,
  ArrowDown,
  Play,
  Link2,
  Variable,
  Loader2,
  CheckCircle,
  XCircle,
  GripVertical,
  Clock,
  Save,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  APIEndpoint,
  APIFlow,
  APIFlowStep,
  VariableExtraction,
  VariableInjection,
  GeneratedTestCase,
  FlowExecutionResult,
  FlowStepResult,
} from "./types";

interface AzureConfig {
  endpoint: string;
  apiKey: string;
  deploymentId: string;
  apiVersion: string;
}

interface APIFlowEditorProps {
  endpoints: APIEndpoint[];
  flows: APIFlow[];
  onFlowsChange: (flows: APIFlow[]) => void;
  onExecuteFlow: (flow: APIFlow) => Promise<FlowExecutionResult | undefined>;
  isExecuting: boolean;
  projectId?: string;
}

// Sortable Flow Step Component
const SortableFlowStep = ({
  step,
  index,
  endpoint,
  testCase,
  isLastStep,
  availableVariables,
  onEditExtractions,
  onEditInjections,
  onRemove,
}: {
  step: APIFlowStep;
  index: number;
  endpoint?: APIEndpoint;
  testCase?: GeneratedTestCase;
  isLastStep: boolean;
  availableVariables: string[];
  onEditExtractions: () => void;
  onEditInjections: () => void;
  onRemove: () => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className={`p-3 border rounded-lg bg-muted/30 ${isDragging ? "shadow-lg" : ""}`}>
        <div className="flex items-center gap-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <Badge variant="outline" className="font-mono">
            Step {index + 1}
          </Badge>
          <Badge className="bg-primary text-primary-foreground">
            {endpoint?.method || "GET"}
          </Badge>
          <span className="text-sm font-mono flex-1 truncate">
            {endpoint?.path || "Unknown endpoint"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEditExtractions}
            title="Extract variables from response"
          >
            <Variable className="h-4 w-4" />
          </Button>
          {index > 0 && availableVariables.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onEditInjections}
              title="Configure variable injection"
            >
              <Link2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1 ml-6">
          Test: {testCase?.name || "Unknown test case"}
        </p>
        {(step.extractVariables?.length || 0) > 0 && (
          <div className="flex gap-1 mt-2 ml-6">
            {step.extractVariables?.map((v) => (
              <Badge key={v.variableName} variant="secondary" className="text-xs">
                {`$\{${v.variableName}\}`}
              </Badge>
            ))}
          </div>
        )}
        {(step.injectVariables?.length || 0) > 0 && (
          <div className="flex gap-1 mt-1 ml-6">
            <span className="text-xs text-muted-foreground">Uses:</span>
            {step.injectVariables?.map((v) => (
              <Badge key={v.variableName} variant="outline" className="text-xs">
                {`$\{${v.variableName}\}`}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {!isLastStep && (
        <div className="flex justify-center py-1">
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
};

export const APIFlowEditor = ({
  endpoints,
  flows,
  onFlowsChange,
  onExecuteFlow,
  isExecuting,
  projectId,
}: APIFlowEditorProps) => {
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(flows[0]?.id || null);
  const [isAddingStep, setIsAddingStep] = useState(false);
  const [newStepEndpointId, setNewStepEndpointId] = useState<string>("");
  const [newStepTestCaseId, setNewStepTestCaseId] = useState<string>("");
  const [editingExtractions, setEditingExtractions] = useState<{
    stepId: string;
    extractions: VariableExtraction[];
  } | null>(null);
  const [editingInjections, setEditingInjections] = useState<{
    stepId: string;
    injections: VariableInjection[];
  } | null>(null);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [selectedResult, setSelectedResult] = useState<FlowExecutionResult | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [isSavingResult, setIsSavingResult] = useState(false);

  // AI Generation state
  const [showAIGenerateDialog, setShowAIGenerateDialog] = useState(false);
  const [aiFlowDescription, setAiFlowDescription] = useState("");
  const [isGeneratingFlows, setIsGeneratingFlows] = useState(false);
  const [azureConfig, setAzureConfig] = useState<AzureConfig | null>(null);

  const { toast } = useToast();

  // Load Azure OpenAI config from integrations
  useEffect(() => {
    const loadAzureConfig = async () => {
      if (!projectId) return;

      try {
        const { data, error } = await supabase
          .from("integration_configs")
          .select("config")
          .eq("project_id", projectId)
          .eq("integration_id", "openai")
          .eq("enabled", true)
          .maybeSingle();

        if (error) {
          console.error("Error loading Azure config:", error);
          return;
        }

        if (data?.config) {
          const config = data.config as Record<string, any>;
          setAzureConfig({
            endpoint: config.endpoint || "",
            apiKey: config.apiKey || "",
            deploymentId: config.deploymentId || "",
            apiVersion: config.apiVersion || "2024-02-15-preview",
          });
        }
      } catch (err) {
        console.error("Failed to load Azure config:", err);
      }
    };

    loadAzureConfig();
  }, [projectId]);

  const generateFlowsWithAI = async () => {
    if (!azureConfig || !azureConfig.endpoint || !azureConfig.apiKey) {
      toast({
        title: "Configuration Required",
        description: "Please configure Azure OpenAI in the Integrations module first",
        variant: "destructive",
      });
      return;
    }

    // Check if there are endpoints with test cases
    const endpointsWithTests = endpoints.filter((ep) => ep.testCases && ep.testCases.length > 0);
    if (endpointsWithTests.length === 0) {
      toast({
        title: "No Test Cases",
        description: "Please generate test cases for endpoints first before generating flows",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingFlows(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-api-flow", {
        body: {
          endpoints: endpointsWithTests,
          azureConfig,
          flowDescription: aiFlowDescription,
          projectId,
        },
      });

      if (error) throw error;

      if (data.success && data.flows) {
        onFlowsChange([...flows, ...data.flows]);
        setShowAIGenerateDialog(false);
        setAiFlowDescription("");
        toast({
          title: "Flows Generated",
          description: `Successfully generated ${data.flows.length} E2E API flows`,
        });

        // Select the first generated flow
        if (data.flows.length > 0) {
          setSelectedFlowId(data.flows[0].id);
        }
      } else {
        throw new Error(data.error || "Failed to generate flows");
      }
    } catch (error) {
      console.error("Error generating flows:", error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate API flows",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingFlows(false);
    }
  };

  const selectedFlow = flows.find((f) => f.id === selectedFlowId);
  const selectedEndpoint = endpoints.find((e) => e.id === newStepEndpointId);

  const createNewFlow = () => {
    const newFlow: APIFlow = {
      id: crypto.randomUUID(),
      name: `Flow ${flows.length + 1}`,
      description: "",
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onFlowsChange([...flows, newFlow]);
    setSelectedFlowId(newFlow.id);
  };

  const deleteFlow = (id: string) => {
    onFlowsChange(flows.filter((f) => f.id !== id));
    if (selectedFlowId === id) {
      setSelectedFlowId(flows[0]?.id || null);
    }
  };

  const updateFlow = (updates: Partial<APIFlow>) => {
    if (!selectedFlow) return;
    onFlowsChange(
      flows.map((f) => (f.id === selectedFlowId ? { ...f, ...updates, updatedAt: new Date().toISOString() } : f)),
    );
  };

  const addStep = () => {
    if (!selectedFlow || !newStepEndpointId || !newStepTestCaseId) return;

    const newStep: APIFlowStep = {
      id: crypto.randomUUID(),
      endpointId: newStepEndpointId,
      testCaseId: newStepTestCaseId,
      order: selectedFlow.steps.length,
      extractVariables: [],
      injectVariables: [],
    };

    updateFlow({ steps: [...selectedFlow.steps, newStep] });
    setIsAddingStep(false);
    setNewStepEndpointId("");
    setNewStepTestCaseId("");
  };

  const removeStep = (stepId: string) => {
    if (!selectedFlow) return;
    const updatedSteps = selectedFlow.steps.filter((s) => s.id !== stepId).map((s, idx) => ({ ...s, order: idx }));
    updateFlow({ steps: updatedSteps });
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!selectedFlow || !over || active.id === over.id) return;

    const oldIndex = selectedFlow.steps.findIndex((s) => s.id === active.id);
    const newIndex = selectedFlow.steps.findIndex((s) => s.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newSteps = arrayMove(selectedFlow.steps, oldIndex, newIndex);
      newSteps.forEach((s, idx) => (s.order = idx));
      updateFlow({ steps: newSteps });
    }
  };

  const moveStep = (stepId: string, direction: "up" | "down") => {
    if (!selectedFlow) return;
    const stepIndex = selectedFlow.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) return;

    const newIndex = direction === "up" ? stepIndex - 1 : stepIndex + 1;
    if (newIndex < 0 || newIndex >= selectedFlow.steps.length) return;

    const newSteps = arrayMove(selectedFlow.steps, stepIndex, newIndex);
    newSteps.forEach((s, idx) => (s.order = idx));
    updateFlow({ steps: newSteps });
  };

  const saveExtractions = () => {
    if (!selectedFlow || !editingExtractions) return;
    updateFlow({
      steps: selectedFlow.steps.map((s) =>
        s.id === editingExtractions.stepId ? { ...s, extractVariables: editingExtractions.extractions } : s,
      ),
    });
    setEditingExtractions(null);
  };

  const saveInjections = () => {
    if (!selectedFlow || !editingInjections) return;
    updateFlow({
      steps: selectedFlow.steps.map((s) =>
        s.id === editingInjections.stepId ? { ...s, injectVariables: editingInjections.injections } : s,
      ),
    });
    setEditingInjections(null);
  };

  const getEndpointForStep = (step: APIFlowStep): APIEndpoint | undefined => {
    return endpoints.find((e) => e.id === step.endpointId);
  };

  const getTestCaseForStep = (step: APIFlowStep): GeneratedTestCase | undefined => {
    const endpoint = getEndpointForStep(step);
    return endpoint?.testCases?.find((tc) => tc.id === step.testCaseId);
  };

  // Collect all extracted variables from previous steps
  const getAvailableVariables = (currentStepOrder: number): string[] => {
    if (!selectedFlow) return [];
    return selectedFlow.steps
      .filter((s) => s.order < currentStepOrder)
      .flatMap((s) => s.extractVariables?.map((e) => e.variableName) || []);
  };

  const handleExecuteFlow = async () => {
    if (!selectedFlow) return;
    const result = await onExecuteFlow(selectedFlow);
    if (result) {
      setSelectedResult(result);
      setShowResultsDialog(true);
    }
  };

  const toggleStepExpanded = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const handleSaveResult = async (result: FlowExecutionResult) => {
    if (!projectId) {
      toast({
        title: "Cannot Save",
        description: "Project ID is required to save results",
        variant: "destructive",
      });
      return;
    }

    setIsSavingResult(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("saved_test_reports").insert({
        project_id: projectId,
        user_id: user.id,
        report_name: `E2E Flow: ${result.flowName}`,
        report_type: "api_flow",
        report_content: JSON.stringify(result, null, 2),
        statistics: {
          total_steps: result.totalSteps,
          passed_steps: result.passedSteps,
          failed_steps: result.failedSteps,
          total_duration: result.totalDuration,
          status: result.status,
        },
      });

      if (error) throw error;

      toast({
        title: "Result Saved",
        description: "Flow execution result has been saved to test reports",
      });
    } catch (error) {
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save result",
        variant: "destructive",
      });
    } finally {
      setIsSavingResult(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "passed":
        return (
          <Badge className="bg-green-500 text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Passed
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-500 text-white">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-orange-500 text-white">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      case "skipped":
        return <Badge variant="secondary">Skipped</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              End-to-End API Flows
            </CardTitle>
            <CardDescription>Chain API calls with variable extraction and injection</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAIGenerateDialog(true)}
              disabled={endpoints.filter((ep) => ep.testCases && ep.testCases.length > 0).length === 0}
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Generate with AI
            </Button>
            <Button size="sm" onClick={createNewFlow}>
              <Plus className="h-4 w-4 mr-1" />
              New Flow
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {flows.length === 0 ? (
          <div className="text-center py-8">
            <Link2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">No API flows defined yet</p>
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                onClick={() => setShowAIGenerateDialog(true)}
                disabled={endpoints.filter((ep) => ep.testCases && ep.testCases.length > 0).length === 0}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Generate with AI
              </Button>
              <Button onClick={createNewFlow}>
                <Plus className="h-4 w-4 mr-1" />
                Create Manually
              </Button>
            </div>
            {endpoints.filter((ep) => ep.testCases && ep.testCases.length > 0).length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Generate test cases for endpoints first to enable AI flow generation
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-4">
            {/* Flow List */}
            <div className="col-span-4">
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {flows.map((flow) => (
                    <div
                      key={flow.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-all ${
                        selectedFlowId === flow.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedFlowId(flow.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{flow.name}</span>
                        <Badge variant="secondary">{flow.steps.length} steps</Badge>
                      </div>
                      {flow.description && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{flow.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Flow Editor */}
            <div className="col-span-8">
              {selectedFlow ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Input
                      value={selectedFlow.name}
                      onChange={(e) => updateFlow({ name: e.target.value })}
                      className="font-medium"
                    />
                    <Button onClick={handleExecuteFlow} disabled={isExecuting || selectedFlow.steps.length === 0}>
                      {isExecuting ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-1" />
                      )}
                      Run Flow
                    </Button>
                    {selectedFlow.lastExecution && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedResult(selectedFlow.lastExecution!);
                          setShowResultsDialog(true);
                        }}
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        View Last Result
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteFlow(selectedFlow.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {selectedFlow.lastExecution && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                      {getStatusBadge(selectedFlow.lastExecution.status)}
                      <span className="text-xs text-muted-foreground">
                        {selectedFlow.lastExecution.passedSteps}/{selectedFlow.lastExecution.totalSteps} steps passed
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        {selectedFlow.lastExecution.totalDuration}ms
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(selectedFlow.lastExecution.timestamp).toLocaleString()}
                      </span>
                    </div>
                  )}

                  <Input
                    value={selectedFlow.description || ""}
                    onChange={(e) => updateFlow({ description: e.target.value })}
                    placeholder="Flow description..."
                    className="text-sm"
                  />

                  <ScrollArea className="h-[300px] overflow-auto">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={selectedFlow.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {selectedFlow.steps.map((step, idx) => (
                            <SortableFlowStep
                              key={step.id}
                              step={step}
                              index={idx}
                              endpoint={getEndpointForStep(step)}
                              testCase={getTestCaseForStep(step)}
                              isLastStep={idx === selectedFlow.steps.length - 1}
                              availableVariables={getAvailableVariables(step.order)}
                              onEditExtractions={() =>
                                setEditingExtractions({
                                  stepId: step.id,
                                  extractions: step.extractVariables || [],
                                })
                              }
                              onEditInjections={() =>
                                setEditingInjections({
                                  stepId: step.id,
                                  injections: step.injectVariables || [],
                                })
                              }
                              onRemove={() => removeStep(step.id)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </ScrollArea>

                  <Button variant="outline" className="w-full" onClick={() => setIsAddingStep(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Step
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">Select a flow to edit</div>
              )}
            </div>
          </div>
        )}
      </CardContent>

      {/* Add Step Dialog */}
      <Dialog open={isAddingStep} onOpenChange={setIsAddingStep}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Flow Step</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm mb-1.5 block">Select Endpoint</Label>
              <Select
                value={newStepEndpointId}
                onValueChange={(v) => {
                  setNewStepEndpointId(v);
                  setNewStepTestCaseId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose an endpoint..." />
                </SelectTrigger>
                <SelectContent>
                  {endpoints.map((ep) => (
                    <SelectItem key={ep.id} value={ep.id}>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {ep.method}
                        </Badge>
                        {ep.path}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedEndpoint && (
              <div>
                <Label className="text-sm mb-1.5 block">Select Test Case</Label>
                <Select value={newStepTestCaseId} onValueChange={setNewStepTestCaseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a test case..." />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedEndpoint.testCases?.map((tc) => (
                      <SelectItem key={tc.id} value={tc.id}>
                        {tc.name}
                      </SelectItem>
                    )) || (
                      <SelectItem value="" disabled>
                        No test cases generated yet
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedFlow && selectedFlow.steps.length > 0 && (
              <div>
                <Label className="text-sm mb-1.5 block">Available Variables</Label>
                <div className="flex flex-wrap gap-1">
                  {getAvailableVariables(selectedFlow.steps.length).map((v) => (
                    <Badge key={v} variant="secondary">{`$\{${v}\}`}</Badge>
                  ))}
                  {getAvailableVariables(selectedFlow.steps.length).length === 0 && (
                    <span className="text-xs text-muted-foreground">No variables extracted from previous steps</span>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingStep(false)}>
              Cancel
            </Button>
            <Button onClick={addStep} disabled={!newStepEndpointId || !newStepTestCaseId}>
              Add Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variable Extraction Dialog */}
      <Dialog open={!!editingExtractions} onOpenChange={() => setEditingExtractions(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extract Variables from Response</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editingExtractions?.extractions.map((extraction, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={extraction.variableName}
                  onChange={(e) => {
                    const newExtractions = [...editingExtractions.extractions];
                    newExtractions[idx] = { ...extraction, variableName: e.target.value };
                    setEditingExtractions({ ...editingExtractions, extractions: newExtractions });
                  }}
                  placeholder="Variable name"
                  className="w-32"
                />
                <Select
                  value={extraction.source}
                  onValueChange={(v: "response_body" | "response_header") => {
                    const newExtractions = [...editingExtractions.extractions];
                    newExtractions[idx] = { ...extraction, source: v };
                    setEditingExtractions({ ...editingExtractions, extractions: newExtractions });
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="response_body">Body (JSON)</SelectItem>
                    <SelectItem value="response_header">Header</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={
                    extraction.source === "response_body" ? extraction.jsonPath || "" : extraction.headerName || ""
                  }
                  onChange={(e) => {
                    const newExtractions = [...editingExtractions.extractions];
                    if (extraction.source === "response_body") {
                      newExtractions[idx] = { ...extraction, jsonPath: e.target.value };
                    } else {
                      newExtractions[idx] = { ...extraction, headerName: e.target.value };
                    }
                    setEditingExtractions({ ...editingExtractions, extractions: newExtractions });
                  }}
                  placeholder={extraction.source === "response_body" ? "$.data.id" : "Header-Name"}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newExtractions = editingExtractions.extractions.filter((_, i) => i !== idx);
                    setEditingExtractions({ ...editingExtractions, extractions: newExtractions });
                  }}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingExtractions({
                  ...editingExtractions!,
                  extractions: [
                    ...editingExtractions!.extractions,
                    { variableName: "", source: "response_body", jsonPath: "" },
                  ],
                });
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Extraction
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingExtractions(null)}>
              Cancel
            </Button>
            <Button onClick={saveExtractions}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variable Injection Dialog */}
      <Dialog open={!!editingInjections} onOpenChange={() => setEditingInjections(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Variable Injection</DialogTitle>
            <DialogDescription>
              Inject variables extracted from previous steps into this request
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editingInjections?.injections.map((injection, idx) => {
              const stepOrder = selectedFlow?.steps.find(s => s.id === editingInjections.stepId)?.order || 0;
              const availableVars = getAvailableVariables(stepOrder);
              
              return (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    value={injection.variableName}
                    onValueChange={(v) => {
                      const newInjections = [...editingInjections.injections];
                      newInjections[idx] = { ...injection, variableName: v };
                      setEditingInjections({ ...editingInjections, injections: newInjections });
                    }}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Variable..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableVars.map((v) => (
                        <SelectItem key={v} value={v}>{`$\{${v}\}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={injection.target}
                    onValueChange={(v: 'path' | 'query' | 'header' | 'body') => {
                      const newInjections = [...editingInjections.injections];
                      newInjections[idx] = { ...injection, target: v };
                      setEditingInjections({ ...editingInjections, injections: newInjections });
                    }}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="path">Path</SelectItem>
                      <SelectItem value="query">Query</SelectItem>
                      <SelectItem value="header">Header</SelectItem>
                      <SelectItem value="body">Body</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={injection.target === 'body' ? injection.path || '' : injection.paramName || ''}
                    onChange={(e) => {
                      const newInjections = [...editingInjections.injections];
                      if (injection.target === 'body') {
                        newInjections[idx] = { ...injection, path: e.target.value };
                      } else {
                        newInjections[idx] = { ...injection, paramName: e.target.value };
                      }
                      setEditingInjections({ ...editingInjections, injections: newInjections });
                    }}
                    placeholder={injection.target === 'body' ? '$.data.userId' : 'param name'}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newInjections = editingInjections.injections.filter((_, i) => i !== idx);
                      setEditingInjections({ ...editingInjections, injections: newInjections });
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingInjections({
                  ...editingInjections!,
                  injections: [
                    ...editingInjections!.injections,
                    { variableName: '', target: 'path', paramName: '' },
                  ],
                });
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Injection
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingInjections(null)}>
              Cancel
            </Button>
            <Button onClick={saveInjections}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flow Execution Results Dialog */}
      <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Flow Execution Results
            </DialogTitle>
            <DialogDescription>
              {selectedResult && (
                <span>
                  {selectedResult.flowName} - {new Date(selectedResult.timestamp).toLocaleString()}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedResult && (
            <div className="flex-1 overflow-hidden flex flex-col space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 shrink-0">
                {getStatusBadge(selectedResult.status)}
                <div className="flex-1 grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold">{selectedResult.totalSteps}</div>
                    <div className="text-xs text-muted-foreground">Total Steps</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-500">{selectedResult.passedSteps}</div>
                    <div className="text-xs text-muted-foreground">Passed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-500">{selectedResult.failedSteps}</div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{selectedResult.totalDuration}ms</div>
                    <div className="text-xs text-muted-foreground">Duration</div>
                  </div>
                </div>
              </div>

              {/* Step Results */}
              <Tabs defaultValue="steps" className="flex-1 overflow-hidden flex flex-col">
                <TabsList className="shrink-0">
                  <TabsTrigger value="steps">Step Results</TabsTrigger>
                  <TabsTrigger value="json">Raw JSON</TabsTrigger>
                </TabsList>

                <TabsContent value="steps" className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full max-h-[350px] overflow-auto">
                    <div className="space-y-2 pr-4">
                      {selectedResult.stepResults.map((stepResult, idx) => (
                        <Collapsible
                          key={stepResult.stepId}
                          open={expandedSteps.has(stepResult.stepId)}
                          onOpenChange={() => toggleStepExpanded(stepResult.stepId)}
                        >
                          <div className="border rounded-lg">
                            <CollapsibleTrigger className="w-full p-3 flex items-center gap-2 hover:bg-muted/50">
                              {expandedSteps.has(stepResult.stepId) ? (
                                <ChevronDown className="h-4 w-4 shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0" />
                              )}
                              <Badge variant="outline" className="font-mono shrink-0">
                                Step {idx + 1}
                              </Badge>
                              <Badge className="bg-primary text-primary-foreground shrink-0">{stepResult.method}</Badge>
                              <span className="text-sm font-mono flex-1 text-left truncate">
                                {stepResult.endpointPath}
                              </span>
                              {getStatusBadge(stepResult.status)}
                              <span className="text-xs text-muted-foreground shrink-0">
                                {stepResult.responseTime}ms
                              </span>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <div className="p-3 pt-0 space-y-3 border-t">
                                <div className="text-sm">
                                  <span className="font-medium">Test Case:</span> {stepResult.testCaseName}
                                </div>

                                <div className="flex gap-4 text-sm">
                                  <div>
                                    <span className="font-medium">Status Code:</span>{" "}
                                    <Badge
                                      variant={
                                        stepResult.responseStatus >= 200 && stepResult.responseStatus < 300
                                          ? "default"
                                          : "destructive"
                                      }
                                    >
                                      {stepResult.responseStatus}
                                    </Badge>
                                  </div>
                                  <div>
                                    <span className="font-medium">Response Time:</span> {stepResult.responseTime}ms
                                  </div>
                                </div>

                                {stepResult.error && (
                                  <div className="p-2 rounded bg-red-500/10 text-red-500 text-sm">
                                    <AlertCircle className="h-4 w-4 inline mr-1" />
                                    {stepResult.error}
                                  </div>
                                )}

                                {stepResult.extractedVariables &&
                                  Object.keys(stepResult.extractedVariables).length > 0 && (
                                    <div>
                                      <span className="font-medium text-sm">Extracted Variables:</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {Object.entries(stepResult.extractedVariables).map(([key, value]) => (
                                          <Badge key={key} variant="secondary" className="text-xs">
                                            {key}: {JSON.stringify(value)}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                {stepResult.responseData && (
                                  <div>
                                    <span className="font-medium text-sm">Response Data:</span>
                                    <pre className="mt-1 p-2 rounded bg-muted text-xs max-h-40 overflow-auto whitespace-pre-wrap break-all">
                                      {JSON.stringify(stepResult.responseData, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="json" className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full max-h-[350px] overflow-auto">
                    <pre className="p-4 text-xs font-mono bg-muted rounded-lg whitespace-pre-wrap break-all">
                      {JSON.stringify(selectedResult, null, 2)}
                    </pre>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          )}

          <DialogFooter className="shrink-0 pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setShowResultsDialog(false)}>
              Close
            </Button>
            {selectedResult && projectId && (
              <Button onClick={() => handleSaveResult(selectedResult)} disabled={isSavingResult}>
                {isSavingResult ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save Result
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Generate Flow Dialog */}
      <Dialog open={showAIGenerateDialog} onOpenChange={setShowAIGenerateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate E2E Flows with AI
            </DialogTitle>
            <DialogDescription>
              AI will analyze your API endpoints and test cases to generate logical end-to-end test flows with variable
              extraction and injection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Available Endpoints</Label>
              <div className="text-sm text-muted-foreground">
                {endpoints.filter((ep) => ep.testCases && ep.testCases.length > 0).length} endpoints with test cases
                will be used
              </div>
              <ScrollArea className="h-24 border rounded-md p-2 overflow-auto">
                <div className="space-y-1">
                  {endpoints
                    .filter((ep) => ep.testCases && ep.testCases.length > 0)
                    .map((ep) => (
                      <div key={ep.id} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="font-mono text-xs">
                          {ep.method}
                        </Badge>
                        <span className="font-mono">{ep.path}</span>
                        <Badge variant="secondary" className="text-xs">
                          {ep.testCases?.length || 0} tests
                        </Badge>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-2">
              <Label htmlFor="flowDescription">Flow Requirements (Optional)</Label>
              <Textarea
                id="flowDescription"
                value={aiFlowDescription}
                onChange={(e) => setAiFlowDescription(e.target.value)}
                placeholder="Describe specific workflows you want to test, e.g., 'Create a flow for user registration and login', 'Test the complete order lifecycle from cart to delivery'"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to let AI determine the best flows based on your API structure
              </p>
            </div>

            {!azureConfig?.endpoint && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  Azure OpenAI is not configured. Please set it up in the Integrations module.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAIGenerateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={generateFlowsWithAI} disabled={isGeneratingFlows || !azureConfig?.endpoint}>
              {isGeneratingFlows ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1" />
                  Generate Flows
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
