import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FlaskConical,
  Gauge,
  ListChecks,
  Rocket,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { RecordedScenario, ScenarioService } from "./ScenarioService";
import { RecordedAction, SelectedDevice } from "./types";
import {
  analyzeScenarioActions,
  buildMobileAutomationAssistantPrompt,
  getReadinessScore,
  MOBILE_AI_INTEGRATION_AREAS,
} from "./aiAssistant";

interface MobileAIAssistantProps {
  projectId: string;
  selectedDevice: SelectedDevice | null;
  setupState: {
    appium: boolean;
    emulator: boolean;
    device: boolean;
  };
}

const DEFAULT_OBJECTIVE =
  "Stabilize and optimize this mobile no-code flow while keeping existing behavior unchanged.";

const toRecordedActions = (rawSteps: unknown): RecordedAction[] => {
  if (Array.isArray(rawSteps)) return rawSteps as RecordedAction[];
  if (typeof rawSteps === "string") {
    try {
      const parsed = JSON.parse(rawSteps);
      return Array.isArray(parsed) ? (parsed as RecordedAction[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const getReadinessTone = (score: number) => {
  if (score >= 85) return "text-emerald-600 border-emerald-500/30 bg-emerald-500/10";
  if (score >= 65) return "text-amber-600 border-amber-500/30 bg-amber-500/10";
  return "text-red-600 border-red-500/30 bg-red-500/10";
};

export default function MobileAIAssistant({
  projectId,
  selectedDevice,
  setupState,
}: MobileAIAssistantProps) {
  const { toast } = useToast();

  const [scenarios, setScenarios] = useState<RecordedScenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");
  const [objective, setObjective] = useState(DEFAULT_OBJECTIVE);
  const [additionalConstraints, setAdditionalConstraints] = useState("");
  const [includeDeviceContext, setIncludeDeviceContext] = useState(true);
  const [includeSafetyRules, setIncludeSafetyRules] = useState(true);

  const loadScenarios = async () => {
    setLoadingScenarios(true);
    try {
      const result = await ScenarioService.getScenarios();
      if (!result.success) {
        throw new Error(result.error || "Failed to load scenarios");
      }

      const list = Array.isArray(result.data) ? (result.data as RecordedScenario[]) : [];
      setScenarios(list);
      if (list.length > 0 && !selectedScenarioId) {
        setSelectedScenarioId(list[0].id);
      }
    } catch (error) {
      console.error("[MobileAIAssistant] Failed to load scenarios:", error);
      toast({
        title: "Failed to load scenarios",
        description: "Save a scenario from Recorder first, then refresh this panel.",
        variant: "destructive",
      });
    } finally {
      setLoadingScenarios(false);
    }
  };

  useEffect(() => {
    void loadScenarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedScenarioId && scenarios.length > 0) {
      setSelectedScenarioId(scenarios[0].id);
    }
  }, [scenarios, selectedScenarioId]);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) || null,
    [scenarios, selectedScenarioId]
  );

  const scenarioActions = useMemo(
    () => toRecordedActions(selectedScenario?.steps),
    [selectedScenario]
  );

  const issues = useMemo(() => analyzeScenarioActions(scenarioActions), [scenarioActions]);
  const readinessScore = useMemo(() => getReadinessScore(issues), [issues]);
  const highRiskCount = useMemo(
    () => issues.filter((issue) => issue.severity === "high").length,
    [issues]
  );
  const mediumRiskCount = useMemo(
    () => issues.filter((issue) => issue.severity === "medium").length,
    [issues]
  );
  const lowRiskCount = useMemo(
    () => issues.filter((issue) => issue.severity === "low").length,
    [issues]
  );

  const promptText = useMemo(
    () =>
      buildMobileAutomationAssistantPrompt({
        objective,
        appPackage: selectedScenario?.app_package,
        scenarioName: selectedScenario?.name,
        selectedDevice,
        additionalConstraints,
        steps: scenarioActions,
        includeDeviceContext,
        includeSafetyRules,
      }),
    [
      additionalConstraints,
      includeDeviceContext,
      includeSafetyRules,
      objective,
      scenarioActions,
      selectedDevice,
      selectedScenario,
    ]
  );

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      toast({
        title: "Prompt copied",
        description: "Use this prompt with your AI assistant or agent backend.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy prompt to clipboard.",
        variant: "destructive",
      });
    }
  };

  const setupReadiness = setupState.appium && setupState.device;
  const safeNowAreas = MOBILE_AI_INTEGRATION_AREAS.filter((area) => area.status === "safe_now");
  const nextPhaseAreas = MOBILE_AI_INTEGRATION_AREAS.filter((area) => area.status === "next_phase");

  return (
    <div className="space-y-6">
      <Card className="bg-card/50 backdrop-blur-sm border-border">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>AI Assistant (Incremental Rollout)</CardTitle>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              Project: {projectId.slice(0, 8)}
            </Badge>
          </div>
          <CardDescription>
            This assistant is additive and non-destructive: it reviews scenarios, drafts prompts, and surfaces
            safe improvement suggestions without changing existing execution logic.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={setupReadiness ? "default" : "secondary"} className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              {setupReadiness ? "Setup Ready" : "Setup Incomplete"}
            </Badge>
            <Badge variant={selectedDevice ? "default" : "secondary"}>
              {selectedDevice ? `Device: ${selectedDevice.device}` : "No Device Selected"}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Gauge className="h-3 w-3" />
              Readiness {readinessScore}%
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <FlaskConical className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Step 1</p>
                <p className="text-sm font-semibold">Select Scenario</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Pick a saved flow from Recorder to analyze and improve.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/10 p-2">
                <ListChecks className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Step 2</p>
                <p className="text-sm font-semibold">Review Risks</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Validate flaky points before running replays.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <Rocket className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Step 3</p>
                <p className="text-sm font-semibold">Generate Prompt</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Copy and run with your AI assistant or agent backend.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 1: Scenario Selection</CardTitle>
            <CardDescription>Select a saved scenario to enable QA-focused analysis.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Saved Scenario</Label>
              <div className="flex gap-2">
                <Select value={selectedScenarioId} onValueChange={setSelectedScenarioId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a saved scenario" />
                  </SelectTrigger>
                  <SelectContent>
                    {scenarios.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No saved scenarios
                      </SelectItem>
                    ) : (
                      scenarios.map((scenario) => (
                        <SelectItem key={scenario.id} value={scenario.id}>
                          {scenario.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={loadScenarios}
                  disabled={loadingScenarios}
                  title="Refresh scenarios"
                >
                  <RefreshCw className={cn("h-4 w-4", loadingScenarios && "animate-spin")} />
                </Button>
              </div>
            </div>

            {selectedScenario ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
                <p className="font-semibold text-foreground">{selectedScenario.name}</p>
                <p className="mt-1 text-muted-foreground">
                  {scenarioActions.length} step(s) loaded
                  {selectedScenario.app_package ? ` | App: ${selectedScenario.app_package}` : ""}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                Save a scenario in Recorder, then come back here for guided AI analysis.
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">AI Integration Coverage</p>
                <Badge variant="outline">{safeNowAreas.length} live now</Badge>
              </div>
              <div className="grid gap-2">
                {safeNowAreas.map((area) => (
                  <div key={area.id} className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
                    <p className="text-xs font-medium">{area.title}</p>
                    <p className="text-xs text-muted-foreground">{area.description}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                {nextPhaseAreas.map((area) => (
                  <div key={area.id} className="rounded-md border p-2">
                    <p className="text-xs font-medium">{area.title}</p>
                    <p className="text-xs text-muted-foreground">{area.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Step 2: Scenario Risk Analysis</CardTitle>
              <Badge className={cn("border", getReadinessTone(readinessScore))}>Readiness: {readinessScore}%</Badge>
            </div>
            <CardDescription>Read-only QA checks for reliability and coverage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-2 text-center">
                <p className="text-lg font-bold text-red-600">{highRiskCount}</p>
                <p className="text-[11px] text-muted-foreground">High</p>
              </div>
              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-center">
                <p className="text-lg font-bold text-amber-600">{mediumRiskCount}</p>
                <p className="text-[11px] text-muted-foreground">Medium</p>
              </div>
              <div className="rounded-md border border-slate-500/20 bg-slate-500/10 p-2 text-center">
                <p className="text-lg font-bold text-slate-600">{lowRiskCount}</p>
                <p className="text-[11px] text-muted-foreground">Low</p>
              </div>
            </div>

            <div className="space-y-2">
              {issues.length === 0 ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    No major stability risks found.
                  </div>
                </div>
              ) : (
                issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={cn(
                      "rounded-lg border p-3",
                      issue.severity === "high" && "border-red-500/30 bg-red-500/10",
                      issue.severity === "medium" && "border-amber-500/30 bg-amber-500/10",
                      issue.severity === "low" && "border-slate-500/30 bg-slate-500/10"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        <p className="text-sm font-medium">{issue.title}</p>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {issue.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{issue.detail}</p>
                    <p className="mt-1 text-xs font-medium">{issue.recommendation}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wand2 className="h-4 w-4 text-primary" />
                Step 3: Prompt Studio
              </CardTitle>
              <CardDescription>
                Generates a structured prompt for your AI assistant using live scenario and device context.
              </CardDescription>
            </div>
            <Button onClick={copyPrompt} size="sm" className="gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              Copy Prompt
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assistant-objective">Primary Objective</Label>
              <Textarea
                id="assistant-objective"
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                className="min-h-[88px]"
                placeholder={DEFAULT_OBJECTIVE}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assistant-constraints">Additional Constraints</Label>
              <Textarea
                id="assistant-constraints"
                value={additionalConstraints}
                onChange={(event) => setAdditionalConstraints(event.target.value)}
                className="min-h-[88px]"
                placeholder="Example: prioritize login flow, avoid introducing new dependencies."
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Switch checked={includeDeviceContext} onCheckedChange={setIncludeDeviceContext} />
              <Label>Include device context</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={includeSafetyRules} onCheckedChange={setIncludeSafetyRules} />
              <Label>Include non-breaking safety rules</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Generated Prompt</Label>
            <Textarea value={promptText} readOnly className="min-h-[380px] font-mono text-xs leading-relaxed" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
