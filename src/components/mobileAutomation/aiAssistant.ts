import { ActionType, RecordedAction, SelectedDevice } from "./types";

export type AssistantIssueSeverity = "high" | "medium" | "low";

export interface AssistantIssue {
  id: string;
  severity: AssistantIssueSeverity;
  title: string;
  detail: string;
  recommendation: string;
  stepIndex?: number;
}

export interface AIIntegrationArea {
  id: string;
  title: string;
  description: string;
  status: "safe_now" | "next_phase";
}

export const MOBILE_AI_INTEGRATION_AREAS: AIIntegrationArea[] = [
  {
    id: "scenario_review",
    title: "Scenario Health Review",
    description: "Analyze recorded steps for flaky selectors, weak assertions, and risky waits.",
    status: "safe_now",
  },
  {
    id: "prompt_studio",
    title: "Prompt Studio",
    description: "Generate a structured assistant prompt from saved scenarios and device context.",
    status: "safe_now",
  },
  {
    id: "human_in_loop",
    title: "Human-in-the-Loop Suggestions",
    description: "Show AI-ready recommendations without auto-applying step mutations.",
    status: "safe_now",
  },
  {
    id: "step_generation",
    title: "Natural Language to Steps",
    description: "Generate new mobile steps from plain English and require approval before merge.",
    status: "next_phase",
  },
  {
    id: "failure_healing",
    title: "Failure Auto-Heal",
    description: "Use replay failures and hierarchy snapshots to suggest locator repairs.",
    status: "next_phase",
  },
  {
    id: "ux_coach",
    title: "In-Flow UX Assistant",
    description: "Inline coaching during recording for better coverage and stronger validation.",
    status: "next_phase",
  },
];

const hasStableLocator = (action: RecordedAction): boolean => {
  const bundle = action.locatorBundle;
  if (bundle?.primary?.value) return true;
  if (Array.isArray(bundle?.fallbacks) && bundle.fallbacks.some((c) => !!c.value)) return true;
  if (action.elementId || action.elementContentDesc || action.elementText) return true;
  if (action.smartXPath || action.xpath) return true;
  if (action.locatorStrategy && action.locatorStrategy !== "coordinates" && action.locator) return true;
  if (action.locator && action.locator.startsWith("//")) return true;
  return false;
};

const toWaitMs = (action: RecordedAction): number | null => {
  if (action.type !== "wait") return null;
  const raw = Number(action.value || "0");
  if (Number.isNaN(raw) || raw < 0) return null;
  return raw;
};

export const analyzeScenarioActions = (actions: RecordedAction[]): AssistantIssue[] => {
  const issues: AssistantIssue[] = [];
  if (!actions.length) {
    issues.push({
      id: "empty_scenario",
      severity: "medium",
      title: "No steps available",
      detail: "There are no recorded steps to analyze.",
      recommendation: "Record and save a scenario before asking AI for optimization.",
    });
    return issues;
  }

  const disabledSteps = actions.filter((a) => a.enabled === false).length;
  if (disabledSteps > 0) {
    issues.push({
      id: "disabled_steps",
      severity: "low",
      title: "Disabled steps detected",
      detail: `${disabledSteps} step(s) are currently disabled and may hide gaps during replay.`,
      recommendation: "Review disabled steps and either remove or re-enable them intentionally.",
    });
  }

  const assertionCount = actions.filter((a) => a.type === "assert").length;
  if (assertionCount === 0) {
    issues.push({
      id: "missing_assertions",
      severity: "high",
      title: "No assertions found",
      detail: "The scenario verifies actions but does not validate outcomes.",
      recommendation: "Add assertions at key checkpoints (screen loaded, text visible, state changes).",
    });
  }

  let consecutiveWaits = 0;

  actions.forEach((action, index) => {
    const key = `${action.id || "step"}-${index}`;
    const needsLocator = action.type === "tap" || action.type === "input" || action.type === "longPress" || action.type === "assert";

    if (needsLocator && !hasStableLocator(action)) {
      issues.push({
        id: `locator_risk_${key}`,
        severity: "high",
        title: `Unstable locator at step ${index + 1}`,
        detail: `The "${action.type}" action has no stable selector strategy and may fail after UI shifts.`,
        recommendation: "Prefer resource-id, accessibility-id, text, or a resilient XPath bundle over coordinates.",
        stepIndex: index,
      });
    }

    const waitMs = toWaitMs(action);
    if (waitMs != null) {
      if (waitMs > 5000) {
        issues.push({
          id: `long_wait_${key}`,
          severity: "medium",
          title: `Long wait at step ${index + 1}`,
          detail: `Wait duration is ${waitMs}ms, which can slow execution and mask timing issues.`,
          recommendation: "Replace long static waits with assertions or shorter conditional waits.",
          stepIndex: index,
        });
      }

      consecutiveWaits += 1;
      if (consecutiveWaits >= 2) {
        issues.push({
          id: `consecutive_wait_${key}`,
          severity: "medium",
          title: `Consecutive waits near step ${index + 1}`,
          detail: "Multiple wait steps in sequence increase run time and flakiness.",
          recommendation: "Merge duplicate waits and validate readiness with explicit assertions.",
          stepIndex: index,
        });
      }
    } else {
      consecutiveWaits = 0;
    }

    if (action.type === "input" && (!action.value || !String(action.value).trim())) {
      issues.push({
        id: `empty_input_${key}`,
        severity: "medium",
        title: `Empty input value at step ${index + 1}`,
        detail: "Input action exists but no value is configured.",
        recommendation: "Provide a test value or parameterize the value before replay.",
        stepIndex: index,
      });
    }
  });

  return issues;
};

export const getReadinessScore = (issues: AssistantIssue[]): number => {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === "high") score -= 15;
    if (issue.severity === "medium") score -= 8;
    if (issue.severity === "low") score -= 3;
  }
  return Math.max(0, Math.min(100, score));
};

export interface MobilePromptInput {
  objective: string;
  appPackage?: string;
  scenarioName?: string;
  selectedDevice?: SelectedDevice | null;
  additionalConstraints?: string;
  steps: RecordedAction[];
  includeDeviceContext?: boolean;
  includeSafetyRules?: boolean;
}

const summarizeStep = (step: RecordedAction, index: number): string => {
  const locatorSummary =
    step.elementId ||
    step.elementContentDesc ||
    step.elementText ||
    step.locator ||
    "N/A";

  const valueSummary = step.value ? ` | value: ${String(step.value)}` : "";
  return `${index + 1}. ${step.type} | desc: ${step.description} | locator: ${locatorSummary}${valueSummary}`;
};

export const buildMobileAutomationAssistantPrompt = ({
  objective,
  appPackage,
  scenarioName,
  selectedDevice,
  additionalConstraints,
  steps,
  includeDeviceContext = true,
  includeSafetyRules = true,
}: MobilePromptInput): string => {
  const normalizedObjective =
    objective.trim() ||
    "Improve and stabilize this mobile no-code automation flow while preserving behavior.";

  const stepSummary = steps.length
    ? steps.map((step, index) => summarizeStep(step, index)).join("\n")
    : "No recorded steps yet.";

  const constraints = additionalConstraints?.trim() || "No additional constraints provided.";

  const deviceContext = includeDeviceContext
    ? [
      `Device: ${selectedDevice?.name || selectedDevice?.device || "Not selected"}`,
      `OS Version: ${selectedDevice?.os_version || "Unknown"}`,
      `Real Device: ${selectedDevice ? (selectedDevice.real_mobile ? "Yes" : "No (Emulator)") : "Unknown"}`,
    ].join("\n")
    : "Device context intentionally omitted.";

  const safetyRules = includeSafetyRules
    ? [
      "- Do not remove or reorder existing steps unless required for stability.",
      "- Keep output backward-compatible with current no-code replay behavior.",
      "- Prefer incremental edits over full rewrites.",
      "- Preserve selectors already proven stable unless a stronger fallback is required.",
      "- Maintain user-friendly UX: short labels, clear intent, minimal cognitive load.",
    ].join("\n")
    : "Safety rules intentionally omitted.";

  return `You are an AI assistant embedded in a no-code mobile automation module.

## Goal
${normalizedObjective}

## Current Context
Project Area: Mobile No-Code Automation
Scenario: ${scenarioName || "Unsaved / ad-hoc scenario"}
App Package: ${appPackage || "Not set"}

## Device Context
${deviceContext}

## Recorded Steps
${stepSummary}

## Non-Breaking Constraints
${safetyRules}

## Additional User Constraints
${constraints}

## What You Must Produce
1. A risk analysis of current steps (flaky selectors, missing validations, timing risks).
2. A prioritized list of safe, incremental improvements (low-risk first).
3. Suggested step-level edits with clear reason per edit.
4. A UX guidance section to keep the flow clean and user-friendly for non-technical users.

## Response Format (strict)
### Functional Safety Check
- ...

### Incremental Improvements
- Priority: High | Step X | Change | Why
- Priority: Medium | Step Y | Change | Why

### Updated Step Suggestions
- Step X: ...

### UI/UX Guidance
- ...

### Open Questions
- ...`;
};

export type RecorderSuggestionType =
  | "rename_step"
  | "duplicate_step"
  | "group_flow"
  | "locator_warning"
  | "ensure_fallbacks"
  | "add_assertion"
  | "context_assertion"
  | "action_hint";

export interface RecorderAISuggestion {
  id: string;
  type: RecorderSuggestionType;
  severity: AssistantIssueSeverity;
  title: string;
  detail: string;
  reason: string;
  confidence: number;
  impact: string;
  stepIndex?: number;
  relatedStepIndex?: number;
  suggestedValue?: string;
  suggestedLocatorStrategy?: RecordedAction["locatorStrategy"];
}

export interface LowScoreLocatorInsight {
  stepIndex: number;
  score: number;
  title: string;
  issue: string;
  resolution: string;
  suggestedLocator?: string;
}

export interface ScriptExplanation {
  summary: string;
  plainEnglishSteps: string[];
  riskySteps: Array<{ stepIndex: number; reason: string }>;
  waitRecommendations: string[];
}

export interface ReplayFailureExplanation {
  title: string;
  explanation: string;
  suggestedFixes: string[];
  confidence: number;
}

export interface ScenarioOrganizationSuggestion {
  suggestedName: string;
  tags: string[];
  suiteRecommendations: string[];
  rationale: string;
}

export interface RecorderAskAIContext {
  recording: boolean;
  isPaused: boolean;
  replaying: boolean;
  hasActions: boolean;
  connectionStatus?: "disconnected" | "connecting" | "connected" | string;
  selectedDevice?: SelectedDevice | null;
  lastReplayStatus?: "PASS" | "FAIL" | null;
  latestFailure?: string | null;
}

export interface CoachHint {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
}

const LOCATOR_REQUIRED_TYPES: ActionType[] = ["tap", "input", "longPress", "assert"];
const DUPLICATE_IGNORE_TYPES: ActionType[] = ["wait", "swipe", "scroll", "pressKey", "hideKeyboard"];

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const looksGenericDescription = (action: RecordedAction): boolean => {
  const desc = normalizeText(action.description || "");
  if (!desc) return true;
  if (desc === `${normalizeText(action.type)} action`) return true;
  if (/^step\s+\d+$/.test(desc)) return true;
  if (/^(tap|input|wait|assert|swipe|scroll|longpress|doubletap)(\s+step)?$/.test(desc)) return true;
  if (/^(action|interaction)\s+\d+$/.test(desc)) return true;
  if (/^tap at \(\d+,\s*\d+\)$/.test(desc)) return true;
  if (/^swipe from \(\d+,\s*\d+\) to \(\d+,\s*\d+\)$/.test(desc)) return true;
  return false;
};

const getStepTarget = (action: RecordedAction): string => {
  if (action.elementText) return action.elementText;
  if (action.elementContentDesc) return action.elementContentDesc;
  if (action.elementId) return action.elementId.split("/").pop() || action.elementId;
  return "";
};

const getFriendlyStepName = (action: RecordedAction, index: number): string => {
  const target = getStepTarget(action);
  const fallbackTarget = target ? `"${target}"` : "target element";

  switch (action.type) {
    case "tap":
      return `Tap ${fallbackTarget}`;
    case "input":
      return `Enter text in ${fallbackTarget}`;
    case "longPress":
      return `Long press ${fallbackTarget}`;
    case "wait": {
      const waitMs = toWaitMs(action);
      return waitMs != null ? `Wait ${waitMs}ms` : "Wait for screen to settle";
    }
    case "assert":
      return target ? `Verify "${target}" is visible` : "Verify expected screen state";
    case "openApp":
      return action.value ? `Open app ${action.value}` : "Open app";
    case "stopApp":
      return action.value ? `Stop app ${action.value}` : "Stop app";
    case "clearCache":
      return action.value ? `Clear data for ${action.value}` : "Clear app data";
    case "swipe":
      return action.description || "Swipe on screen";
    case "scroll":
      return action.description || "Scroll screen";
    case "hideKeyboard":
      return "Hide keyboard";
    case "pressKey":
      return action.description || "Press device key";
    case "doubleTap":
      return `Double tap ${fallbackTarget}`;
    default:
      return action.description || `Step ${index + 1}`;
  }
};

const deriveLocatorSuggestion = (
  action: RecordedAction
): { value: string; strategy: RecordedAction["locatorStrategy"] } | null => {
  const primary = action.locatorBundle?.primary;
  if (primary?.value) {
    const strategy =
      primary.strategy === "accessibilityId" ||
      primary.strategy === "id" ||
      primary.strategy === "text" ||
      primary.strategy === "xpath" ||
      primary.strategy === "coordinates"
        ? primary.strategy
        : undefined;
    return {
      value: primary.value,
      strategy: strategy || (primary.value.startsWith("//") ? "xpath" : action.locatorStrategy),
    };
  }

  if (action.smartXPath && action.smartXPath.startsWith("//")) {
    return { value: action.smartXPath, strategy: "xpath" };
  }
  if (action.xpath && action.xpath.startsWith("//")) {
    return { value: action.xpath, strategy: "xpath" };
  }
  if (action.elementId) {
    return { value: action.elementId, strategy: "id" };
  }
  if (action.elementContentDesc) {
    return { value: action.elementContentDesc, strategy: "accessibilityId" };
  }
  if (action.elementText) {
    return { value: action.elementText, strategy: "text" };
  }
  return null;
};

const isWeakClassOnlyXPath = (locator: string): boolean => {
  const raw = String(locator || "").trim();
  if (!raw.startsWith("//")) return false;
  return /@class\s*=/.test(raw) && !/@resource-id=|@content-desc=|@text=|contains\(@text|contains\(@resource-id|contains\(@content-desc/.test(raw);
};

const buildContextualXPath = (action: RecordedAction): string | null => {
  const cls = String(action.elementClass || "").trim();
  const txt = String(action.elementText || "").trim();
  const a11y = String(action.elementContentDesc || "").trim();
  const id = String(action.elementId || "").trim();

  if (id) return `//*[@resource-id="${id}"]`;
  if (cls && a11y) return `//${cls}[@content-desc="${a11y}"]`;
  if (cls && txt) return `//${cls}[normalize-space(@text)="${txt}"]`;
  if (txt) return `//*[@text="${txt}"]`;
  if (a11y) return `//*[@content-desc="${a11y}"]`;
  return null;
};

const getLocatorScore = (action: RecordedAction): number =>
  typeof action.reliabilityScore === "number"
    ? action.reliabilityScore
    : hasStableLocator(action)
      ? 70
      : 35;

const hasFallbackCandidates = (action: RecordedAction): boolean =>
  Array.isArray(action.locatorBundle?.fallbacks) && action.locatorBundle!.fallbacks.some((c) => !!c?.value);

const makeActionSignature = (action: RecordedAction): string => {
  const locator = action.locator || action.smartXPath || action.xpath || "";
  const value = action.value || "";
  const coords = action.coordinates
    ? `${action.coordinates.x},${action.coordinates.y},${action.coordinates.endX ?? ""},${action.coordinates.endY ?? ""}`
    : "";
  return `${action.type}::${locator}::${value}::${coords}`.toLowerCase();
};

const getTargetFingerprint = (action: RecordedAction): string => {
  const bundle = action.locatorBundle?.primary?.value || "";
  const locator = action.locator || action.smartXPath || action.xpath || "";
  const id = action.elementId || "";
  const a11y = action.elementContentDesc || "";
  const text = action.elementText || "";
  return normalizeText(`${bundle}|${locator}|${id}|${a11y}|${text}`);
};

const shouldFlagDuplicate = (
  current: RecordedAction,
  previous: RecordedAction,
  currentIndex: number,
  previousIndex: number
): boolean => {
  if (DUPLICATE_IGNORE_TYPES.includes(current.type)) return false;
  if (current.type !== previous.type) return false;

  // Far-apart repeats are often intentional across navigation phases.
  if (currentIndex - previousIndex > 3) return false;

  if (current.type === "input") {
    const currentValue = normalizeText(String(current.value || ""));
    const previousValue = normalizeText(String(previous.value || ""));
    if (!currentValue || !previousValue || currentValue !== previousValue) return false;
  }

  const currentTarget = getTargetFingerprint(current);
  const previousTarget = getTargetFingerprint(previous);
  if (!currentTarget || !previousTarget) return false;

  return currentTarget === previousTarget;
};

const inferFlowFromText = (actions: RecordedAction[]): string | null => {
  if (actions.length < 4) return null;

  const joined = normalizeText(actions.map((a) => `${a.description} ${a.value || ""}`).join(" "));
  const signals: Array<{ label: string; patterns: RegExp[] }> = [
    { label: "Login Flow", patterns: [/login/, /sign in/, /username/, /password/, /otp/] },
    { label: "Checkout Flow", patterns: [/checkout/, /payment/, /cart/, /place order/, /shipping/] },
    { label: "Search Flow", patterns: [/search/, /filter/, /results/] },
    { label: "Registration Flow", patterns: [/signup/, /register/, /create account/] },
    { label: "Settings Flow", patterns: [/settings/, /profile/, /preferences/] },
  ];

  let bestLabel: string | null = null;
  let bestScore = 0;
  for (const signal of signals) {
    const score = signal.patterns.reduce((acc, p) => acc + (p.test(joined) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestLabel = signal.label;
    }
  }

  if (bestScore >= 2) return bestLabel;
  return null;
};

export const buildRecorderAISuggestions = (actions: RecordedAction[]): RecorderAISuggestion[] => {
  const suggestions: RecorderAISuggestion[] = [];
  if (!actions.length) return suggestions;

  const seenSignatures = new Map<string, number[]>();
  const hasAssertion = actions.some((a) => a.type === "assert");
  let bestAssertionCandidate: { index: number; label: string; locator?: string; strategy?: RecordedAction["locatorStrategy"] } | null = null;

  actions.forEach((action, index) => {
    const keyBase = `${action.id || "step"}-${index}`;
    const suggestedStepName = getFriendlyStepName(action, index);
    const targetLabel = getStepTarget(action);

    if (looksGenericDescription(action) && normalizeText(suggestedStepName) !== normalizeText(action.description || "")) {
      suggestions.push({
        id: `rename_${keyBase}`,
        type: "rename_step",
        severity: "low",
        title: `Improve step ${index + 1} name`,
        detail: `Current label is generic. Suggested: "${suggestedStepName}".`,
        reason: "Human-readable steps are easier to review and debug.",
        confidence: 0.86,
        impact: "Improves script readability without changing behavior.",
        stepIndex: index,
        suggestedValue: suggestedStepName,
      });
    }

    if (targetLabel) {
      const hintDesc = getFriendlyStepName(action, index);
      if (normalizeText(hintDesc) !== normalizeText(action.description || "")) {
        suggestions.push({
          id: `hint_${keyBase}`,
          type: "action_hint",
          severity: "low",
          title: `Use precise label for step ${index + 1}`,
          detail: `Prefill: ${hintDesc}`,
          reason: "Specific, intent-rich labels make scripts easier to reuse and debug.",
          confidence: 0.9,
          impact: "Improves readability and aligns generated script with UI intent.",
          stepIndex: index,
          suggestedValue: hintDesc,
        });
      }
    }

    if (LOCATOR_REQUIRED_TYPES.includes(action.type)) {
      const score = getLocatorScore(action);
      const criticalRisk = score <= 10;
      const locatorLooksGenericClassOnly = isWeakClassOnlyXPath(action.locator || action.smartXPath || action.xpath || "");
      if (!hasStableLocator(action) || score < 60) {
        const locatorSuggestion = deriveLocatorSuggestion(action) || (() => {
          const contextual = buildContextualXPath(action);
          if (!contextual) return null;
          return { value: contextual, strategy: "xpath" as const };
        })();
        suggestions.push({
          id: `locator_${keyBase}`,
          type: "locator_warning",
          severity: criticalRisk || score < 40 ? "high" : "medium",
          title: criticalRisk
            ? `Critical locator risk at step ${index + 1} (<=10 score)`
            : `Step ${index + 1} locator may be fragile`,
          detail: locatorSuggestion
            ? `Suggested stable locator: ${locatorSuggestion.strategy || "locator"} = ${locatorSuggestion.value}. Use parent/child or ancestor context instead of generic class-only XPath.`
            : "No strong locator candidate found. Keep coordinate fallback but capture a stable selector from Inspector with parent/ancestor context.",
          reason: criticalRisk || locatorLooksGenericClassOnly
            ? "Low score and generic selectors are highly likely to break after minor UI changes."
            : "Locator stability is the main predictor of replay flakiness.",
          confidence: criticalRisk || score < 40 ? 0.94 : 0.76,
          impact: "Can reduce replay failures after UI layout shifts.",
          stepIndex: index,
          suggestedValue: locatorSuggestion?.value,
          suggestedLocatorStrategy: locatorSuggestion?.strategy,
        });
      }

      if (!hasFallbackCandidates(action)) {
        suggestions.push({
          id: `fallbacks_${keyBase}`,
          type: "ensure_fallbacks",
          severity: criticalRisk ? "high" : "medium",
          title: `Add self-healing fallbacks for step ${index + 1}`,
          detail: "No locator fallbacks are stored. Populate fallback candidates (id/accessibilityId/text/xpath/coordinates) to enable replay self-healing.",
          reason: "Fallback candidates let replay recover when the primary locator fails.",
          confidence: 0.88,
          impact: "Improves resilience and lowers hard failures on dynamic screens.",
          stepIndex: index,
        });
      }
    }

    if (action.enabled !== false) {
      const signature = makeActionSignature(action);
      const previousIndices = seenSignatures.get(signature) || [];
      const previousIndex = [...previousIndices]
        .reverse()
        .find((idx) => shouldFlagDuplicate(action, actions[idx], index, idx));

      if (typeof previousIndex === "number") {
        suggestions.push({
          id: `dup_${keyBase}`,
          type: "duplicate_step",
          severity: "low",
          title: `Possible duplicate step at ${index + 1}`,
          detail: `This repeats the same target interaction as step ${previousIndex + 1}.`,
          reason: "Near-duplicate interactions often add noise and increase replay time.",
          confidence: 0.76,
          impact: "Disabling duplicates can shorten replay time safely.",
          stepIndex: index,
          relatedStepIndex: previousIndex,
        });
      }
      seenSignatures.set(signature, [...previousIndices, index]);
    }

    if (!hasAssertion && !bestAssertionCandidate) {
      const label = targetLabel || suggestedStepName;
      if (label && label.length <= 80 && action.type !== "wait") {
        const locator =
          action.locator && action.locatorStrategy && action.locatorStrategy !== "coordinates"
            ? action.locator
            : action.smartXPath || action.xpath || action.elementId || action.elementContentDesc || "";
        const strategy =
          action.locatorStrategy && action.locatorStrategy !== "coordinates"
            ? action.locatorStrategy
            : locator?.startsWith("//")
              ? "xpath"
              : action.elementContentDesc
                ? "accessibilityId"
                : action.elementId
                  ? "id"
                  : undefined;
        bestAssertionCandidate = { index, label, locator, strategy };
      }
    }
  });

  if (!hasAssertion && bestAssertionCandidate) {
    const { index, label, locator, strategy } = bestAssertionCandidate;
    suggestions.push({
      id: `context_assert_${index}`,
      type: "context_assertion",
      severity: "medium",
      title: `Verify "${label}" appears`,
      detail: `Add an assertion after step ${index + 1} to confirm "${label}" is visible.`,
      reason: "Contextual assertions reduce false positives and catch UI regressions early.",
      confidence: 0.82,
      impact: "Adds validation without changing flow.",
      stepIndex: index,
      suggestedValue: `Assert "${label}" is visible`,
      suggestedLocatorStrategy: strategy,
      // optional extension for locator carry-over
      // @ts-ignore
      suggestedLocator: locator,
    });
  }

  const flowLabel = inferFlowFromText(actions);
  if (flowLabel) {
    suggestions.push({
      id: `flow_${normalizeText(flowLabel).replace(/\s+/g, "_")}`,
      type: "group_flow",
      severity: "low",
      title: `Group steps as "${flowLabel}"`,
      detail: "These actions appear to belong to one reusable flow.",
      reason: "Grouping improves scenario reuse and suite organization.",
      confidence: 0.73,
      impact: "Helps organize scenarios without changing execution.",
      suggestedValue: flowLabel,
    });
  }

  if (!hasAssertion && actions.length > 0) {
    suggestions.push({
      id: "add_assertion_outcome_guard",
      type: "add_assertion",
      severity: "high",
      title: "Add at least one assertion (Phase 3 Context Coach)",
      detail: "Assertions validate expected outcomes and prevent false positive passes.",
      reason: "Action-only flows can pass even when UI state is wrong.",
      confidence: 0.95,
      impact: "Improves replay trustworthiness and defect detection.",
    });
  }

  return suggestions;
};

export const buildLowScoreLocatorInsights = (actions: RecordedAction[]): LowScoreLocatorInsight[] => {
  const insights: LowScoreLocatorInsight[] = [];
  actions.forEach((action, index) => {
    if (!LOCATOR_REQUIRED_TYPES.includes(action.type)) return;
    const score = getLocatorScore(action);
    if (score > 10) return;
    const suggestion = deriveLocatorSuggestion(action);
    const contextual = buildContextualXPath(action);
    const weakLocator = action.locator || action.smartXPath || action.xpath || "";
    insights.push({
      stepIndex: index,
      score,
      title: `Step ${index + 1} has critical locator score (${score}/100)`,
      issue: weakLocator
        ? `Current locator is fragile: ${weakLocator}`
        : "Current step depends on weak/non-stable targeting.",
      resolution: suggestion?.value
        ? `Use ${suggestion.strategy || "locator"} = ${suggestion.value}; add fallback candidates and avoid generic class-only XPath.`
        : contextual
          ? `Use contextual XPath: ${contextual}; add fallback candidates from id/accessibilityId/text and keep coordinates only as last fallback.`
          : "Capture locator again using Inspector and anchor by id/accessibility/text with ancestor context.",
      suggestedLocator: suggestion?.value || contextual || undefined,
    });
  });
  return insights;
};

const toPlainEnglishStep = (action: RecordedAction, index: number): string => {
  const friendly = getFriendlyStepName(action, index);
  if (action.type === "input" && action.value) {
    return `${index + 1}. ${friendly} with value "${action.value}".`;
  }
  return `${index + 1}. ${friendly}.`;
};

export const explainRecordedScript = (actions: RecordedAction[]): ScriptExplanation => {
  const enabledActions = actions.filter((a) => a.enabled !== false);
  if (!enabledActions.length) {
    return {
      summary: "No executable steps are available yet.",
      plainEnglishSteps: [],
      riskySteps: [],
      waitRecommendations: [],
    };
  }

  const plainEnglishSteps = enabledActions.map((action, index) => toPlainEnglishStep(action, index));
  const riskySteps: Array<{ stepIndex: number; reason: string }> = [];
  const waitRecommendations: string[] = [];

  enabledActions.forEach((action, index) => {
    if (LOCATOR_REQUIRED_TYPES.includes(action.type) && !hasStableLocator(action)) {
      riskySteps.push({
        stepIndex: index,
        reason: "No stable locator is available for this interaction.",
      });
    }

    const waitMs = toWaitMs(action);
    if (waitMs != null && waitMs > 5000) {
      riskySteps.push({
        stepIndex: index,
        reason: `Long static wait (${waitMs}ms) may hide timing issues.`,
      });
    }

    if (action.type === "input" && !String(action.value || "").trim()) {
      riskySteps.push({
        stepIndex: index,
        reason: "Input step has no configured value.",
      });
    }
  });

  const hasAssertions = enabledActions.some((a) => a.type === "assert");
  if (!hasAssertions) {
    waitRecommendations.push("Add at least one assertion to verify expected screen outcome.");
  }

  const hasWaits = enabledActions.some((a) => a.type === "wait");
  const transitionActions = enabledActions.filter((a) => ["tap", "input", "openApp", "scroll", "swipe"].includes(a.type)).length;
  if (!hasWaits && transitionActions >= 3) {
    waitRecommendations.push("Add short waits or readiness assertions after navigation-heavy actions.");
  }

  if (enabledActions.some((a) => toWaitMs(a) != null && (toWaitMs(a) as number) > 5000)) {
    waitRecommendations.push("Replace long waits with condition-based checks where possible.");
  }

  return {
    summary: `Script has ${enabledActions.length} executable step(s). ${riskySteps.length} potential risk area(s) detected.`,
    plainEnglishSteps,
    riskySteps,
    waitRecommendations,
  };
};

export const explainReplayFailure = (
  errorMessage: string,
  failedAction?: RecordedAction | null
): ReplayFailureExplanation => {
  const msg = normalizeText(errorMessage || "");
  const fallbackLocator = failedAction ? deriveLocatorSuggestion(failedAction) : null;

  if (!msg) {
    return {
      title: "Replay failure detected",
      explanation: "The replay failed but no detailed error message was available.",
      suggestedFixes: ["Re-run the failed step and inspect the locator and screen state."],
      confidence: 0.45,
    };
  }

  if (msg.includes("not found") || msg.includes("locator") || msg.includes("element not found")) {
    const fixes = [
      "Open Inspector and capture a stable locator (id/accessibilityId/xpath).",
      "Avoid pure coordinate locators for dynamic screens.",
      "Re-run only the failed step to confirm locator validity.",
    ];
    if (fallbackLocator?.value) {
      fixes.unshift(`Try this locator: ${fallbackLocator.strategy || "locator"} = ${fallbackLocator.value}`);
    }
    return {
      title: "Element resolution failed",
      explanation: "Replay could not find the target element with the current locator.",
      suggestedFixes: fixes,
      confidence: 0.92,
    };
  }

  if (msg.includes("timeout") || msg.includes("timed out")) {
    return {
      title: "Timing issue detected",
      explanation: "The step likely ran before the UI was fully ready.",
      suggestedFixes: [
        "Insert a short wait before the failed step.",
        "Prefer explicit assertions to confirm screen readiness.",
        "Increase replay settle delay for slower devices.",
      ],
      confidence: 0.88,
    };
  }

  if (msg.includes("connection") || msg.includes("device") || msg.includes("adb")) {
    return {
      title: "Device connectivity issue",
      explanation: "Replay failed due to a device/agent communication issue.",
      suggestedFixes: [
        "Confirm device is connected and visible in setup status.",
        "Restart local helper if connection remains unstable.",
        "Retry replay after device reconnects.",
      ],
      confidence: 0.84,
    };
  }

  if (msg.includes("stopped by user")) {
    return {
      title: "Replay stopped manually",
      explanation: "Execution was intentionally interrupted.",
      suggestedFixes: [
        "Use Continue From Here to resume from the failed step.",
        "Use Restart Replay to re-run from step 1 if needed.",
      ],
      confidence: 0.99,
    };
  }

  return {
    title: "Execution error",
    explanation: errorMessage,
    suggestedFixes: [
      "Re-run the failed step in isolation to confirm reproducibility.",
      "Review locator and action value for the failed step.",
      "Check whether app screen changed unexpectedly before this step.",
    ],
    confidence: 0.6,
  };
};

export const suggestScenarioOrganization = (
  actions: RecordedAction[],
  appPackage?: string,
  currentName?: string
): ScenarioOrganizationSuggestion => {
  const enabledActions = actions.filter((a) => a.enabled !== false);
  const flow = inferFlowFromText(enabledActions) || "Core Flow";
  const appLabel = appPackage ? appPackage.split(".").pop() || "app" : "app";

  const tags = new Set<string>();
  tags.add(enabledActions.length <= 8 ? "smoke" : "regression");
  if (flow.toLowerCase().includes("login")) tags.add("login");
  if (flow.toLowerCase().includes("checkout")) tags.add("checkout");
  if (enabledActions.some((a) => a.type === "assert")) tags.add("validated");
  if (enabledActions.some((a) => a.type === "input")) tags.add("form");
  if (enabledActions.some((a) => a.type === "openApp")) tags.add("launch");

  const preferredName =
    currentName && currentName.trim().length > 0
      ? currentName.trim()
      : `${flow} - ${appLabel}`;

  return {
    suggestedName: preferredName,
    tags: Array.from(tags),
    suiteRecommendations: [
      `${flow} Suite`,
      enabledActions.length <= 8 ? "Smoke Suite" : "Regression Suite",
    ],
    rationale: "Grouping by user journey + run frequency improves discoverability and reuse.",
  };
};

export const answerRecorderQuestion = (
  question: string,
  context: RecorderAskAIContext
): string => {
  const q = normalizeText(question);

  if (!q) {
    return "Ask about recording, locator stability, replay failures, or script behavior.";
  }

  if (q.includes("record") && (q.includes("not capturing") || q.includes("not working") || q.includes("why"))) {
    const checks = [
      `Agent connection: ${context.connectionStatus || "unknown"}`,
      `Device selected: ${context.selectedDevice ? "yes" : "no"}`,
      `Recording state: ${context.recording ? (context.isPaused ? "paused" : "active") : "stopped"}`,
    ];
    return `Recording diagnostics:\n- ${checks.join("\n- ")}\n- Ensure setup is complete and recording is not paused.\n- Tap inside live preview after pressing Start Recording.`;
  }

  if (q.includes("replay") && (q.includes("fail") || q.includes("failed") || q.includes("why"))) {
    const base = context.latestFailure
      ? explainReplayFailure(context.latestFailure).explanation
      : "Replay can fail due to unstable locators, timing, or device connectivity.";
    return `Replay failure guidance:\n- ${base}\n- Use "Why did this fail?" on the failed step for targeted fixes.\n- Re-run the failed step before re-running the full flow.`;
  }

  if (q.includes("button") || q.includes("what does this")) {
    return "Use Setup to connect device/appium, Recorder to capture/edit steps, Script to review/export Java code, and History to debug replay outcomes.";
  }

  if (q.includes("locator")) {
    return "Prefer id/accessibilityId first, then stable xpath. Keep coordinates only as fallback. Apply locator suggestions from the AI panel only after reviewing them.";
  }

  return "I can help with recording readiness, locator stability, replay failures, script explanation, and scenario organization.";
};

export const buildContextualCoachHints = (
  context: RecorderAskAIContext,
  actions: RecordedAction[]
): CoachHint[] => {
  const hints: CoachHint[] = [];

  if (!context.selectedDevice) {
    hints.push({
      id: "coach_select_device",
      priority: "high",
      title: "Select a device to begin",
      detail: "Open Setup and connect a real device/emulator first.",
    });
  }

  if (!context.recording && actions.length === 0) {
    hints.push({
      id: "coach_start_recording",
      priority: "high",
      title: "Start your first recording",
      detail: "Tap Start Recording, then interact with the app screen to capture steps.",
    });
  }

  if (context.recording && context.isPaused) {
    hints.push({
      id: "coach_resume_recording",
      priority: "medium",
      title: "Recording is paused",
      detail: "Resume recording to continue capturing actions.",
    });
  }

  if (actions.length > 0 && !actions.some((a) => a.type === "assert")) {
    hints.push({
      id: "coach_add_assertion",
      priority: "high",
      title: "Add at least one assertion",
      detail: "Assertions validate outcome and reduce false positives.",
    });
  }

  const unstableCount = actions.filter(
    (a) => LOCATOR_REQUIRED_TYPES.includes(a.type) && !hasStableLocator(a)
  ).length;
  if (unstableCount > 0) {
    hints.push({
      id: "coach_stabilize_locators",
      priority: "medium",
      title: "Stabilize fragile locators",
      detail: `${unstableCount} step(s) rely on weak selectors. Prefer id/accessibilityId/xpath from Inspector.`,
    });
  }

  const longWaitCount = actions.filter((a) => {
    const wait = toWaitMs(a);
    return wait != null && wait > 5000;
  }).length;
  if (longWaitCount > 0) {
    hints.push({
      id: "coach_reduce_waits",
      priority: "low",
      title: "Reduce long static waits",
      detail: "Replace long waits with readiness assertions where possible.",
    });
  }

  if (context.lastReplayStatus === "FAIL" && context.latestFailure) {
    hints.push({
      id: "coach_replay_failed",
      priority: "high",
      title: "Replay failed recently",
      detail: "Use 'Why did this fail?' and re-run only the failed step before full replay.",
    });
  }

  return hints;
};
