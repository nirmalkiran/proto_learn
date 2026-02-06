/**
 * Purpose:
 * Provides the core recording and playback experience for mobile automation.
 * Features real-time screen mirroring, action capture via SSE, script generation,
 * and automated replay with visual progress tracking.
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";
import {
  Play, Pause, Square, Trash2, RefreshCw, Copy, Download, Monitor, Smartphone,
  Wifi, WifiOff, Upload, Package, CheckCircle, XCircle, Type, MousePointer2,
  Move, ChevronRight, Settings, Settings2, Info, AlertCircle, Circle, Keyboard,
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, HelpCircle, ExternalLink, X,
  Zap, ChevronDown, ChevronUp, ListChecks, Clock, RotateCcw, Terminal,
  History, Wand2, Save, FolderOpen, Edit, FileInput
} from "lucide-react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import DeviceSelector from "./DeviceSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { ActionType, LocatorBundleV1, LocatorCandidate, LocatorStrategy, RecordedAction, SelectedDevice } from "./types";
import { ExecutionHistoryService } from "./ExecutionHistoryService";
import { ScenarioService, RecordedScenario } from "./ScenarioService";
import {
  CoachHint,
  RecorderAISuggestion,
  buildContextualCoachHints,
  buildRecorderAISuggestions,
  buildLowScoreLocatorInsights,
  explainRecordedScript,
  explainReplayFailure,
  suggestScenarioOrganization,
  answerRecorderQuestion,
} from "./aiAssistant";

const AGENT_URL = (import.meta as any).env?.VITE_AGENT_URL || "http://localhost:3001";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);
const DEVICE_WIDTH = 310;
const DEVICE_HEIGHT = 568;
const MANUAL_SCRIPT_STORAGE_KEY = "wispr.mobile.manualScripts.v1";
const ENABLE_MJPEG_DEFAULT = (() => {
  try {
    const raw = (import.meta as any).env?.VITE_ENABLE_MJPEG;
    if (raw === "0" || raw === "false") return false;
    return true;
  } catch {
    return true;
  }
})();
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const getContainMetrics = (
  containerW: number,
  containerH: number,
  contentW: number,
  contentH: number
) => {
  const safeContentW = contentW > 0 ? contentW : 1;
  const safeContentH = contentH > 0 ? contentH : 1;
  const safeContainerW = containerW > 0 ? containerW : 1;
  const safeContainerH = containerH > 0 ? containerH : 1;

  const contentAspect = safeContentW / safeContentH;
  const containerAspect = safeContainerW / safeContainerH;

  if (containerAspect > contentAspect) {
    const displayH = safeContainerH;
    const displayW = displayH * contentAspect;
    const offsetX = (safeContainerW - displayW) / 2;
    return { displayW, displayH, offsetX, offsetY: 0 };
  }

  const displayW = safeContainerW;
  const displayH = displayW / contentAspect;
  const offsetY = (safeContainerH - displayH) / 2;
  return { displayW, displayH, offsetX: 0, offsetY };
};

/**
 * Purpose:
 * Provides a robust retry mechanism for asynchronous device actions.
 * Useful for handling transient network issues or device busy states.
 */
const retryDeviceAction = async <T,>(
  action: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 300
): Promise<T> => {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await action();
    } catch (err) {
      lastError = err;

      if (attempt < maxRetries) {
        const backoffDelay = delayMs * Math.pow(2, attempt);
        console.debug(`[Retry] Attempt ${attempt + 1} failed, retrying in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  console.error('[Retry] All attempts failed:', lastError);
  throw lastError;
};
/**
 * Purpose:
 * Polls the local agent until a device connection is successfully established
 * or the specified timeout is reached.
 */
const waitForDeviceReady = async (
  agentUrl: string,
  timeoutMs: number = 10000,
  pollIntervalMs: number = 500
): Promise<boolean> => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(`${agentUrl}/device/check`, {
        signal: AbortSignal.timeout(2000)
      });
      const data = await res.json();

      if (data.connected) {
        console.debug('[DeviceReady] Device is ready');
        return true;
      }
    } catch (err) {
      // Continue polling on error
      console.debug('[DeviceReady] Check failed, continuing to poll...');
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  console.warn('[DeviceReady] Timeout waiting for device');
  return false; // Timeout
};

/**
 * Wait for screen to settle before action execution
 * Reduces "element not found" errors on slow devices
 */
const waitForScreenSettle = async (delayMs: number = 500): Promise<void> => {
  console.debug(`[ScreenSettle] Waiting ${delayMs}ms for screen to settle...`);
  await new Promise(resolve => setTimeout(resolve, delayMs));
};

const readManualScriptCache = (): Record<string, string> => {
  try {
    const raw = window.localStorage.getItem(MANUAL_SCRIPT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeManualScriptCache = (cache: Record<string, string>) => {
  try {
    window.localStorage.setItem(MANUAL_SCRIPT_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage errors; script persistence remains best-effort.
  }
};

const saveManualScriptForScenario = (scenarioId: string, script: string | null) => {
  if (!scenarioId) return;
  const cache = readManualScriptCache();
  if (script && script.trim().length > 0) {
    cache[scenarioId] = script;
  } else {
    delete cache[scenarioId];
  }
  writeManualScriptCache(cache);
};

const getManualScriptForScenario = (scenarioId: string): string | null => {
  if (!scenarioId) return null;
  const cache = readManualScriptCache();
  const script = cache[scenarioId];
  return typeof script === "string" && script.trim().length > 0 ? script : null;
};

const removeManualScriptForScenario = (scenarioId: string) => {
  if (!scenarioId) return;
  const cache = readManualScriptCache();
  if (!(scenarioId in cache)) return;
  delete cache[scenarioId];
  writeManualScriptCache(cache);
};

const LOCATOR_REQUIRED_ACTIONS: ActionType[] = ["tap", "input", "longPress", "assert"];

const isLocatorRequiredAction = (action: RecordedAction): boolean =>
  LOCATOR_REQUIRED_ACTIONS.includes(action.type);

const normalizeLocatorStrategy = (strategy?: string): LocatorStrategy | null => {
  if (!strategy) return null;
  const raw = String(strategy).trim();
  if (!raw) return null;
  if (raw === "id" || raw === "accessibilityId" || raw === "text" || raw === "xpath" || raw === "coordinates" || raw === "androidUiAutomator") {
    return raw;
  }
  return null;
};

const pushUniqueCandidate = (
  list: LocatorCandidate[],
  strategy: LocatorStrategy,
  value: string,
  score: number,
  source: LocatorCandidate["source"] = "legacy",
  reason?: string
) => {
  const v = String(value || "").trim();
  if (!v) return;
  const key = `${strategy}:${v}`;
  if (list.some((c) => `${c.strategy}:${c.value}` === key)) return;
  list.push({ strategy, value: v, score, source, reason });
};

const buildLocatorCandidatesFromAction = (action: RecordedAction): LocatorCandidate[] => {
  const candidates: LocatorCandidate[] = [];
  const lb = action.locatorBundle;
  if (lb?.primary?.strategy && lb?.primary?.value) {
    pushUniqueCandidate(candidates, lb.primary.strategy, lb.primary.value, lb.primary.score || 90, lb.primary.source || "inspector", lb.primary.reason);
  }
  if (Array.isArray(lb?.fallbacks)) {
    for (const f of lb.fallbacks) {
      if (!f?.strategy || !f?.value) continue;
      pushUniqueCandidate(candidates, f.strategy, f.value, f.score || 60, f.source || "legacy", f.reason);
    }
  }

  const normalizedStrategy = normalizeLocatorStrategy(action.locatorStrategy || "");
  if (normalizedStrategy && action.locator) {
    pushUniqueCandidate(candidates, normalizedStrategy, action.locator, 65, "legacy");
  }
  if (action.smartXPath) pushUniqueCandidate(candidates, "xpath", action.smartXPath, 74, "inspector");
  if (action.xpath) pushUniqueCandidate(candidates, "xpath", action.xpath, 68, "legacy");
  if (action.elementId) pushUniqueCandidate(candidates, "id", action.elementId, 88, "inspector");
  if (action.elementContentDesc) pushUniqueCandidate(candidates, "accessibilityId", action.elementContentDesc, 84, "inspector");
  if (action.elementText) pushUniqueCandidate(candidates, "text", action.elementText, 56, "inspector");
  if (action.coordinates && typeof action.coordinates.x === "number" && typeof action.coordinates.y === "number") {
    pushUniqueCandidate(candidates, "coordinates", `${action.coordinates.x},${action.coordinates.y}`, 30, "legacy");
  }

  candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
  return candidates;
};

const ensureActionLocatorBundle = (action: RecordedAction): RecordedAction => {
  if (!isLocatorRequiredAction(action)) return action;
  const candidates = buildLocatorCandidatesFromAction(action);
  if (!candidates.length) return action;

  const existingPrimary = action.locatorBundle?.primary;
  const primary = (existingPrimary?.strategy && existingPrimary?.value)
    ? { ...existingPrimary }
    : { ...candidates[0] };
  const fallbacks = candidates.filter((c) => !(c.strategy === primary.strategy && c.value === primary.value));

  const fingerprint =
    action.locatorBundle?.fingerprint ||
    action.elementFingerprint ||
    `${action.type}:${action.id}`;

  const locatorBundle: LocatorBundleV1 = {
    version: 1,
    fingerprint,
    primary,
    fallbacks,
  };

  return {
    ...action,
    locatorBundle,
    locator: action.locator || primary.value,
    locatorStrategy: (action.locatorStrategy || primary.strategy || "") as RecordedAction["locatorStrategy"],
  };
};

const normalizeActionsForLocatorHealing = (actions: RecordedAction[]): RecordedAction[] =>
  actions.map((action) => ensureActionLocatorBundle(action));

const isWeakClassOnlyXPath = (locator: string): boolean => {
  const raw = String(locator || "").trim();
  if (!raw.startsWith("//")) return false;
  return /@class\s*=/.test(raw) && !/@resource-id=|@content-desc=|@text=|contains\(@text|contains\(@resource-id|contains\(@content-desc/.test(raw);
};

const syntaxHighlightScript = (code: string): string => {
  const escape = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escaped = escape(code || "");
  const keyword = /\b(const|let|var|function|async|await|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|class|extends|super|import|from|export|default)\b/g;
  const strings = /(\".*?\"|\'.*?\'|\`.*?\`)/g;
  const comments = /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm;
  return escaped
    .replace(comments, '<span class="text-zinc-500">$1</span>')
    .replace(strings, '<span class="text-amber-300">$1</span>')
    .replace(keyword, '<span class="text-sky-300">$1</span>');
};

const deriveStableLocatorFromAction = (
  action: RecordedAction
): { value: string; strategy: RecordedAction["locatorStrategy"] } | null => {
  if (action.elementId) return { value: action.elementId, strategy: "id" };
  if (action.elementContentDesc) return { value: action.elementContentDesc, strategy: "accessibilityId" };
  if (action.elementText && action.elementClass) {
    return { value: `//${action.elementClass}[normalize-space(@text)="${action.elementText}"]`, strategy: "xpath" };
  }
  if (action.elementText) return { value: action.elementText, strategy: "text" };

  const smart = String(action.smartXPath || "").trim();
  if (smart.startsWith("//") && !isWeakClassOnlyXPath(smart)) return { value: smart, strategy: "xpath" };
  const xpath = String(action.xpath || "").trim();
  if (xpath.startsWith("//") && !isWeakClassOnlyXPath(xpath)) return { value: xpath, strategy: "xpath" };
  return null;
};

const inferLocatorStrategy = (locator: string, explicit?: string): LocatorStrategy => {
  const normalizedExplicit = normalizeLocatorStrategy(explicit || "");
  if (normalizedExplicit) return normalizedExplicit;
  const raw = String(locator || "").trim();
  if (!raw) return "xpath";
  if (raw.startsWith("//")) return "xpath";
  if (/^\d+\s*,\s*\d+$/.test(raw)) return "coordinates";
  return "id";
};

const boundsCenterFromString = (bounds?: string): { x: number; y: number } | null => {
  const raw = String(bounds || "");
  const m = raw.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!m) return null;
  const x1 = Number(m[1]);
  const y1 = Number(m[2]);
  const x2 = Number(m[3]);
  const y2 = Number(m[4]);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
};

type UiNodeAttrs = Record<string, string>;

const parseUiNodesFromXml = (xml: string): UiNodeAttrs[] => {
  const nodes: UiNodeAttrs[] = [];
  const nodeRegex = /<node\b([^>]*)\/>/g;
  let m: RegExpExecArray | null = null;
  while ((m = nodeRegex.exec(xml)) !== null) {
    const attrBlob = m[1] || "";
    const attrs: UiNodeAttrs = {};
    const attrRegex = /([a-zA-Z0-9_:\-]+)="([^"]*)"/g;
    let a: RegExpExecArray | null = null;
    while ((a = attrRegex.exec(attrBlob)) !== null) {
      attrs[a[1]] = a[2];
    }
    nodes.push(attrs);
  }
  return nodes;
};

const parseSimpleXPathFilter = (xpath: string): { className?: string; eq: Record<string, string>; contains: Record<string, string> } => {
  const raw = String(xpath || "").trim();
  const out = { className: "", eq: {} as Record<string, string>, contains: {} as Record<string, string> };
  const classMatch = raw.match(/^\/\/([a-zA-Z0-9\._]+)/);
  if (classMatch) out.className = classMatch[1];

  const eqRegex = /@([a-zA-Z\-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null = null;
  while ((m = eqRegex.exec(raw)) !== null) {
    out.eq[m[1]] = m[2];
  }
  const containsRegex = /contains\(\s*@([a-zA-Z\-]+)\s*,\s*"([^"]*)"\s*\)/g;
  while ((m = containsRegex.exec(raw)) !== null) {
    out.contains[m[1]] = m[2];
  }
  return out;
};

const findCenterFromLocatorInUiXml = (
  xml: string,
  locator: string,
  strategy: LocatorStrategy
): { x: number; y: number } | null => {
  const nodes = parseUiNodesFromXml(xml);
  if (!nodes.length) return null;

  const pick = (pred: (n: UiNodeAttrs) => boolean): { x: number; y: number } | null => {
    const n = nodes.find(pred);
    return n ? boundsCenterFromString(n.bounds) : null;
  };

  if (strategy === "id") return pick((n) => String(n["resource-id"] || "") === locator);
  if (strategy === "accessibilityId") return pick((n) => String(n["content-desc"] || "") === locator);
  if (strategy === "text") return pick((n) => String(n.text || "") === locator);
  if (strategy !== "xpath") return null;

  const f = parseSimpleXPathFilter(locator);
  return pick((n) => {
    if (f.className && String(n.class || "") !== f.className) return false;
    for (const [k, v] of Object.entries(f.eq)) {
      if (String((n as any)[k] || "") !== String(v || "")) return false;
    }
    for (const [k, v] of Object.entries(f.contains)) {
      if (!String((n as any)[k] || "").includes(String(v || ""))) return false;
    }
    return true;
  });
};

interface MobileRecorderProps {
  setupState: {
    appium: boolean;
    emulator: boolean;
    device: boolean;
  };
  setSetupState?: (updater: any) => void;
  selectedDevice: SelectedDevice | null;
  setSelectedDevice: (device: SelectedDevice | null) => void;
  selectedDeviceFromSetup?: string;
}

/**
 * Purpose:
 * The main component for the Mobile Recorder. Manages the recording session,
 * device mirroring, and scenario lifecycle.
 */
export default function MobileRecorder({
  setupState,
  setSetupState,
  selectedDevice,
  setSelectedDevice,
  selectedDeviceFromSetup,
}: MobileRecorderProps) {
  const [generatedScriptCache, setGeneratedScriptCache] = useState<string>("");
  const [recording, setRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [mirrorActive, setMirrorActive] = useState(false);
  const [mirrorImage, setMirrorImage] = useState<string | null>(null);
  const [mirrorError, setMirrorError] = useState<string | null>(null);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [isPreparingDevice, setIsPreparingDevice] = useState(false);
  const [mjpegActive, setMjpegActive] = useState(false);
  const [mjpegFailed, setMjpegFailed] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const [deviceSize, setDeviceSize] = useState<{ width: number; height: number } | null>(null);
  const inspectorModeEnabled = useMemo(() => {
    try {
      const raw = window.localStorage.getItem("wispr.inspectorMode");
      if (raw == null) return true;
      return raw !== "0" && raw !== "false";
    } catch {
      return true;
    }
	  }, []);
  const [hoverInspect, setHoverInspect] = useState<any>(null);
  const [tapInspect, setTapInspect] = useState<any>(null);
  const [pinnedInspect, setPinnedInspect] = useState<any>(null);
  const [inspectorPanelOpen, setInspectorPanelOpen] = useState(false);
  const [inspectorSpotlight, setInspectorSpotlight] = useState(false);
  const tapInspectDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoverInspectTsRef = useRef(0);
  const hoverInspectAbortRef = useRef<AbortController | null>(null);
  const hoverRequestIdRef = useRef(0);
  const [inputText, setInputText] = useState("");
  const [inputCoords, setInputCoords] = useState<{ x: number; y: number } | null>(null);
  const inputFieldRef = useRef<HTMLInputElement>(null);
  const [inputTargetMeta, setInputTargetMeta] = useState<{
    resourceId?: string;
    text?: string;
    class?: string;
    contentDesc?: string;
    bounds?: string;
  } | null>(null);
  const [inputTargetBounds, setInputTargetBounds] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [appPackage, setAppPackage] = useState("");
  const [isAppInstalled, setIsAppInstalled] = useState<boolean | null>(null);
  const [checkingInstall, setCheckingInstall] = useState(false);
  const [inputPending, setInputPending] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [editingLocatorStepId, setEditingLocatorStepId] = useState<string | null>(null);
  const [editingLocatorValue, setEditingLocatorValue] = useState<string>("");
  const [previewPendingId, setPreviewPendingId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState<boolean>(false);
  const [deviceRefreshKey, setDeviceRefreshKey] = useState(0);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [nextStepTrigger, setNextStepTrigger] = useState<(() => void) | null>(null);
  const [showInputPanel, setShowInputPanel] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [activeTab, setActiveTab] = useState<"actions" | "script" | "history">("actions");
  const [showAISuggestions, setShowAISuggestions] = useState(true);
  const [dismissedAISuggestionIds, setDismissedAISuggestionIds] = useState<string[]>([]);
  const [lastAIChange, setLastAIChange] = useState<{ title: string; previousActions: RecordedAction[] } | null>(null);
  const [showScriptExplanation, setShowScriptExplanation] = useState(false);
  const [expandedFailureInsightIndex, setExpandedFailureInsightIndex] = useState<number | null>(null);
  const [showAskAI, setShowAskAI] = useState(false);
  const [askAIQuestion, setAskAIQuestion] = useState("");
  const [askAIAnswer, setAskAIAnswer] = useState("");
  const [askAIFeedbackSubmitted, setAskAIFeedbackSubmitted] = useState(false);
  const previewDimensions = useMemo(() => {
    const fixedHeight = 700;
    if (deviceSize && deviceSize.width > 0 && deviceSize.height > 0) {
      const aspectRatio = deviceSize.width / deviceSize.height;
      return {
        width: Math.round(fixedHeight * aspectRatio),
        height: fixedHeight
      };
    }

    return { width: 350, height: fixedHeight };
  }, [deviceSize]);

  const replayAbortRef = useRef<AbortController | null>(null);
  const replayStopRequestedRef = useRef(false);
  const stopReplay = async () => {
    replayStopRequestedRef.current = true;
    try { replayAbortRef.current?.abort(); } catch { }
    try {
      await fetch(`${AGENT_URL}/recording/replay/stop`, { method: "POST" }).catch(() => null);
    } catch { }
    toast.info("Replay stopped");
  };

  const copyText = async (text: string, label: string = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("Copy failed");
    }
  };

  const showInspectorFloating = inspectorModeEnabled && captureMode && mirrorActive;
  const hasBounds = (ins: any) => {
    const s = String(ins?.element?.bounds || "");
    return /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.test(s);
  };
  const hasUsefulInspectorData = (ins: any) => {
    if (!ins) return false;
    if (hasBounds(ins)) return true;
    const el = ins?.element || {};
    if (el?.resourceId || el?.contentDesc || el?.text || el?.class) return true;
    if (ins?.best?.value || ins?.smartXPath || ins?.xpath) return true;
    if (ins?.locatorBundle?.primary?.value) return true;
    if (Array.isArray(ins?.locators) && ins.locators.length) return true;
    return false;
  };
  // Prevent a stale/empty pinned target from freezing updates.
  const activeInspect = (pinnedInspect && hasUsefulInspectorData(pinnedInspect))
    ? pinnedInspect
    : (tapInspect ?? hoverInspect);
  const inspectorDerived = useMemo(() => {
    const active = activeInspect;
    const el = active?.element || {};
    const lb = active?.locatorBundle || null;
    const locators = (active?.locators && Array.isArray(active.locators))
      ? active.locators
      : (lb ? [lb.primary, ...(lb.fallbacks || [])] : []);
    const best = active?.best || (lb?.primary ?? null);
    const score = (typeof active?.reliabilityScore === "number") ? active.reliabilityScore : undefined;

    const getBestValue = (strategy: string) => {
      const found = locators.find((c: any) => c?.strategy === strategy && c?.value)?.value;
      return found ? String(found) : "";
    };

    const xpathValue =
      (best?.strategy === "xpath" && best?.value) ? String(best.value) :
        (String(active?.smartXPath || "").startsWith("//") ? String(active.smartXPath) :
          (String(active?.xpath || "").startsWith("//") ? String(active.xpath) : getBestValue("xpath")));

    const a11yValue = getBestValue("accessibilityId") || String(el.contentDesc || "");
    const idValue = getBestValue("id") || String(el.resourceId || "");
    const textValue = getBestValue("text") || String(el.text || "");
    const classValue = String(el.class || "");
    const boundsValue = String(el.bounds || "");

    const targetName =
      String(el.text || "") ||
      String(el.contentDesc || "") ||
      (String(el.resourceId || "").split("/").pop() || "") ||
      classValue ||
      "Element";

    const band = (score == null) ? "bg-slate-400" : score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";

    return {
      active,
      el,
      lb,
      locators,
      best,
      score,
      band,
      targetName,
      xpathValue,
      a11yValue,
      idValue,
      textValue,
      classValue,
      boundsValue,
    };
  }, [activeInspect]);

  const inspectorPortal = useMemo(() => {
    if (!showInspectorFloating) return null;
    if (typeof document === "undefined") return null;

    const d = inspectorDerived;
    const locatorRows = (() => {
      const rowMap = new Map<string, { strategy: string; value: string; source: string; primary: boolean }>();
      const addRow = (
        strategy: string,
        value: string,
        source: string,
        primary: boolean = false
      ) => {
        const normalizedValue = String(value || "").trim();
        if (!normalizedValue) return;
        const key = `${strategy}::${normalizedValue}`;
        const existing = rowMap.get(key);
        if (!existing) {
          rowMap.set(key, { strategy, value: normalizedValue, source, primary });
          return;
        }
        if (primary && !existing.primary) {
          rowMap.set(key, { ...existing, primary: true });
        }
      };

      if (d.best?.strategy && d.best?.value) {
        addRow(String(d.best.strategy), String(d.best.value), "best", true);
      }
      for (const loc of d.locators || []) {
        addRow(String(loc?.strategy || "locator"), String(loc?.value || ""), "bundle");
      }
      addRow("xpath", d.xpathValue || "", "derived");
      addRow("accessibilityId", d.a11yValue || "", "element");
      addRow("id", d.idValue || "", "element");
      addRow("text", d.textValue || "", "element");
      addRow("class", d.classValue || "", "element");
      addRow("bounds", d.boundsValue || "", "element");

      return Array.from(rowMap.values()).sort((a, b) => {
        if (a.primary && !b.primary) return -1;
        if (!a.primary && b.primary) return 1;
        return a.strategy.localeCompare(b.strategy);
      });
    })();

    if (!inspectorPanelOpen) {
      return createPortal(
        <div className="fixed right-4 top-24 z-[10000] pointer-events-auto">
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-border/60 bg-background/90 backdrop-blur px-3 py-1.5 shadow-lg hover:bg-background transition-colors"
            onClick={() => setInspectorPanelOpen(true)}
            title="Open inspector"
          >
            <div className={`h-2 w-2 rounded-full ${d.band}`} />
            <span className="text-xs font-semibold">Inspector</span>
            <span className="text-[11px] font-mono text-muted-foreground">
              {locatorRows.length} locators
            </span>
          </button>
        </div>,
        document.body
      );
    }

    return createPortal(
      <div className="fixed right-4 top-4 z-[10000] pointer-events-auto w-[430px] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-1rem)] rounded-2xl border border-border/70 bg-background shadow-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`h-2.5 w-2.5 rounded-full ${d.band}`} />
              <div className="text-sm font-semibold truncate">Inspector</div>
              {pinnedInspect && (
                <Badge variant="outline" className="text-[10px] px-1.5 h-5">Pinned</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`text-xs rounded-md px-2 py-1 border ${pinnedInspect ? "border-primary/40 text-primary bg-primary/10" : "border-border/50 text-muted-foreground hover:text-foreground"}`}
                onClick={() => {
                  if (pinnedInspect) {
                    setPinnedInspect(null);
                    toast.info("Inspector unpinned");
                    return;
                  }
                  const b = String(activeInspect?.element?.bounds || "");
                  if (!b || !b.includes("[")) {
                    toast.info("No element to pin yet");
                    return;
                  }
                  if (activeInspect) {
                    setPinnedInspect(activeInspect);
                    toast.success("Inspector pinned");
                  }
                }}
              >
                {pinnedInspect ? "Unpin" : "Pin"}
              </button>
              <button
                type="button"
                className={`text-xs rounded-md px-2 py-1 border ${inspectorSpotlight ? "border-foreground/20 text-foreground/80 bg-foreground/5" : "border-border/50 text-muted-foreground hover:text-foreground"}`}
                onClick={() => setInspectorSpotlight((v) => !v)}
              >
                {inspectorSpotlight ? "Spotlight On" : "Spotlight"}
              </button>
              <button
                type="button"
                className="text-xs rounded-md px-2 py-1 border border-border/50 text-muted-foreground hover:text-foreground"
                onClick={() => setInspectorPanelOpen(false)}
              >
                Collapse
              </button>
            </div>
          </div>

          <div className="px-4 py-3 space-y-3 overflow-auto">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold truncate">{d.targetName}</div>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono">
                  {typeof d.score === "number" ? `${d.score}%` : "--"}
                </Badge>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {d.best?.strategy && d.best?.value
                  ? `Preferred locator: ${d.best.strategy}`
                  : "Hover or tap an element to load locator details."}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">Locator Explorer</p>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                  {locatorRows.length}
                </Badge>
              </div>
              <div className="mt-2 space-y-1.5">
                {locatorRows.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    No locator candidates yet. Move cursor over a screen element.
                  </p>
                ) : (
                  locatorRows.map((row, idx) => (
                    <div
                      key={`${row.strategy}-${idx}`}
                      className={`rounded-md border px-2 py-1.5 ${row.primary ? "border-primary/40 bg-primary/10" : "border-border/50 bg-muted/10"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {row.strategy}
                          {row.primary ? " - primary" : ""}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="text-[10px] rounded px-1.5 py-0.5 border border-border/50 hover:bg-muted/40"
                            onClick={() =>
                              highlightElementByLocator(
                                row.value,
                                row.strategy,
                                boundsCenterFromString(d.el?.bounds || "")
                              )
                            }
                          >
                            Highlight
                          </button>
                          <button
                            type="button"
                            className="text-[10px] rounded px-1.5 py-0.5 border border-border/50 hover:bg-muted/40"
                            onClick={() => copyText(row.value, `${row.strategy} copied`)}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] font-mono break-all text-foreground/90">
                        {row.value}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <p className="text-xs font-semibold">Element Snapshot</p>
              <div className="mt-2 grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-[11px]">
                <div className="text-muted-foreground">Text</div>
                <div className="font-mono break-all">{d.textValue || "-"}</div>
                <div className="text-muted-foreground">Class</div>
                <div className="font-mono break-all">{d.classValue || "-"}</div>
                <div className="text-muted-foreground">Bounds</div>
                <div className="font-mono break-all">{d.boundsValue || "-"}</div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="text-[11px] rounded-md px-2 py-1 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  onClick={() =>
                    copyText(
                      JSON.stringify(d.lb || { best: d.best, locators: d.locators, element: d.el }, null, 2),
                      "Locator bundle copied"
                    )
                  }
                >
                  Copy Bundle JSON
                </button>
                <span className="text-[10px] text-muted-foreground/80">
                  Copying locators never records steps.
                </span>
              </div>
            </div>
          </div>
      </div>,
      document.body
    );
  }, [showInspectorFloating, inspectorDerived, inspectorPanelOpen, pinnedInspect, activeInspect, inspectorSpotlight, highlightElementByLocator]);

  /**
     * Purpose:
     * Continuously monitors the mobile device for focused input fields.
     * If a candidate field is found, it automatically opens the text entry panel.
     * FIX: Added 404 detection to stop polling if backend doesn't support it.
     */
  useEffect(() => {
    let focusInterval: ReturnType<typeof setInterval> | null = null;
    let burstTimeout1: ReturnType<typeof setTimeout> | null = null;
    let burstTimeout2: ReturnType<typeof setTimeout> | null = null;

    // CIRCUIT BREAKER: Local flag to stop polling if backend is missing the feature
    let isEndpointMissing = false;

    const checkInputFocus = async () => {
      // 1. Stop if panel is open, input is pending, or we know the endpoint is missing
      if (showInputPanel || inputPending || isEndpointMissing) return;

      try {
        const res = await fetch(`${AGENT_URL}/device/focus`);

        // === FIX START: Handle 404 Gracefully ===
        if (res.status === 404) {
          // Backend doesn't support this feature. Stop polling immediately.
          isEndpointMissing = true;
          if (focusInterval) clearInterval(focusInterval);
          return;
        }
        // === FIX END ===

        if (res.ok) {
          const data = await res.json();

          if (data.success && data.isInputCandidate && data.focusedElement) {
            let x = 500, y = 500;
            if (data.focusedElement.bounds) {
              const match = data.focusedElement.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
              if (match) {
                x = Math.round((parseInt(match[1]) + parseInt(match[3])) / 2);
                y = Math.round((parseInt(match[2]) + parseInt(match[4])) / 2);
                setInputTargetBounds({
                  x1: parseInt(match[1], 10),
                  y1: parseInt(match[2], 10),
                  x2: parseInt(match[3], 10),
                  y2: parseInt(match[4], 10),
                });
              }
            }

            setInputTargetMeta({
              resourceId: data.focusedElement.resourceId,
              text: data.focusedElement.text,
              class: data.focusedElement.class,
              contentDesc: data.focusedElement.contentDesc,
              bounds: data.focusedElement.bounds,
            });
            setInputText("");
            setInputCoords({ x, y });
            setShowInputPanel(true);
            toast.info("Input focus detected", {
              description: `Automatically opened panel for ${data.focusedElement.resourceId || 'input field'}`
            });
          }
        }
      } catch (err) {
        // Only log network errors (fetch failures), not 404s (handled above)
        // console.warn("[FocusMonitor] Network error:", err);
      }
    };

    if (recording && !isPaused && mirrorActive) {
      checkInputFocus();
      // Burst checks to catch UI settling
      burstTimeout1 = setTimeout(checkInputFocus, 500);
      burstTimeout2 = setTimeout(checkInputFocus, 1200);
      // Regular polling
      focusInterval = setInterval(checkInputFocus, 3500);
    }

    return () => {
      if (focusInterval) clearInterval(focusInterval);
      if (burstTimeout1) clearTimeout(burstTimeout1);
      if (burstTimeout2) clearTimeout(burstTimeout2);
    };
  }, [recording, isPaused, mirrorActive, showInputPanel, inputPending]);

  // Auto-focus the text input panel when it opens (auto or manual)
  useEffect(() => {
    if (!showInputPanel) return;
    const raf = requestAnimationFrame(() => {
      inputFieldRef.current?.focus();
      inputFieldRef.current?.select?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [showInputPanel]);


  const [executionLogs, setExecutionLogs] = useState<{
    id: string;
    description: string;
    status: "pending" | "running" | "success" | "error";
    error?: string;
    duration?: number;
  }[]>([]);
  const [replayStartTime, setReplayStartTime] = useState<number | null>(null);
  const [lastReplayStatus, setLastReplayStatus] = useState<"PASS" | "FAIL" | null>(null);
  const [replayPulse, setReplayPulse] = useState<{
    x: number;
    y: number;
    label?: string;
    type?: string;
    ts: number;
  } | null>(null);
  const replayPulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Script editor state
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [editableScript, setEditableScript] = useState("");
  const [savedManualScript, setSavedManualScript] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenshotIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mjpegImgRef = useRef<HTMLImageElement | null>(null);
  const enableMjpeg = ENABLE_MJPEG_DEFAULT;

  const [uiXml, setUiXml] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  //const pressCoordsRef = useRef<{ x: number, y: number } | null>(null);

  // Helper to extract a friendly name from package ID
  const getAppFriendlyName = useCallback((pkg: string) => {
    if (!pkg) return "";

    // Check for common patterns
    const apps: Record<string, string> = {
      'com.whatsapp': 'WhatsApp',
      'com.instagram.android': 'Instagram',
      'com.facebook.katana': 'Facebook',
      'com.google.android.youtube': 'YouTube',
      'com.android.chrome': 'Chrome',
      'com.snapchat.android': 'Snapchat',
      'com.spotify.music': 'Spotify',
      'com.google.android.gm': 'Gmail',
      'com.google.android.apps.maps': 'Google Maps',
      'com.android.settings': 'Settings',
      // 'com.beta.yourkeepr': 'Keepr Beta'
    };

    if (apps[pkg]) return apps[pkg];

    // Heuristic: take the last part and capitalize
    const parts = pkg.split('.');
    let last = parts[parts.length - 1];

    // Capitalize each word if separated by underscores or just the first char
    return last
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }, []);
  const pressCoordsRef = useRef<{ x: number, y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const longPressHappenedRef = useRef(false);
  const [apkUploading, setApkUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apkInstalling, setApkInstalling] = useState(false);
  const [uploadedApk, setUploadedApk] = useState<{ path: string; name: string } | null>(null);
  const [installedPackages, setInstalledPackages] = useState<string[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  // Scenario Management State
  const [scenarios, setScenarios] = useState<RecordedScenario[]>([]);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [currentScenarioName, setCurrentScenarioName] = useState<string>("");
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [saveScenarioName, setSaveScenarioName] = useState("");
  const [loadingScenarios, setLoadingScenarios] = useState(false);

  // Advanced Configuration (Optional - for power users)
  const [advancedConfig, setAdvancedConfig] = useState({
    // Retry settings
    maxRetries: 2,
    retryDelayMs: 300,

    // Device readiness polling
    deviceReadyTimeoutMs: 10000,
    deviceReadyPollIntervalMs: 500,
    emulatorReadyTimeoutMs: 15000,
    emulatorReadyPollIntervalMs: 1000,

    // Screen settling
    screenSettleDelayMs: 500,

    // Screenshot stream
    screenshotMaxFails: 5,
    screenshotTimeoutMs: 8000,
  });

  const enabledReplayActions = useMemo(
    () => actions.filter((action) => action.enabled !== false),
    [actions]
  );

  const allAISuggestions = useMemo(
    () => buildRecorderAISuggestions(actions),
    [actions]
  );

  useEffect(() => {
    setDismissedAISuggestionIds((prev) =>
      prev.filter((id) => allAISuggestions.some((s) => s.id === id))
    );
  }, [allAISuggestions]);

  const aiSuggestions = useMemo(
    () => allAISuggestions.filter((suggestion) => !dismissedAISuggestionIds.includes(suggestion.id)),
    [allAISuggestions, dismissedAISuggestionIds]
  );

  const lowScoreLocatorInsights = useMemo(
    () => buildLowScoreLocatorInsights(actions),
    [actions]
  );

  const hasAssertionStep = useMemo(
    () => actions.some((action) => action.enabled !== false && action.type === "assert"),
    [actions]
  );

  const locatorSuggestionByActionId = useMemo(() => {
    const map = new Map<string, RecorderAISuggestion>();
    for (const suggestion of aiSuggestions) {
      if (suggestion.type !== "locator_warning" || typeof suggestion.stepIndex !== "number") continue;
      const action = actions[suggestion.stepIndex];
      if (!action) continue;
      map.set(action.id, suggestion);
    }
    return map;
  }, [aiSuggestions, actions]);

  const scriptExplanation = useMemo(
    () => explainRecordedScript(enabledReplayActions),
    [enabledReplayActions]
  );

  const scenarioOrganizationSuggestion = useMemo(
    () => suggestScenarioOrganization(actions, appPackage, saveScenarioName || currentScenarioName),
    [actions, appPackage, saveScenarioName, currentScenarioName]
  );

  const coachHints: CoachHint[] = useMemo(() => {
    const latestFailure = executionLogs.find((log) => log.status === "error")?.error || null;
    return buildContextualCoachHints(
      {
        recording,
        isPaused,
        replaying,
        hasActions: actions.length > 0,
        connectionStatus,
        selectedDevice,
        lastReplayStatus,
        latestFailure,
      },
      actions
    );
  }, [
    actions,
    connectionStatus,
    executionLogs,
    isPaused,
    lastReplayStatus,
    recording,
    replaying,
    selectedDevice,
  ]);

  const submitAIFeedback = useCallback(async (feedbackType: "helpful" | "not_helpful") => {
    if (!askAIAnswer) return;
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;

      await supabase.from("ai_learning_data").insert({
        user_id: userId,
        project_id: null,
        artifact_type: "mobile_ask_ai",
        artifact_id: "recorder-help",
        feedback_type: feedbackType,
        feedback_content: JSON.stringify({
          question: askAIQuestion,
          answer: askAIAnswer,
          source: "local_assistive",
        }),
        confidence_score: 0.6,
      });

      setAskAIFeedbackSubmitted(true);
      toast.success("Feedback captured");
    } catch (error) {
      console.warn("[MobileRecorder] Failed to store AI feedback:", error);
    }
  }, [askAIAnswer, askAIQuestion]);

  const dismissAISuggestion = useCallback((id: string) => {
    setDismissedAISuggestionIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const addOutcomeAssertionStep = useCallback(() => {
    const lastLocatorAction = [...actions]
      .reverse()
      .find((action) =>
        action.enabled !== false &&
        ["tap", "input", "longPress"].includes(action.type) &&
        (action.locatorBundle?.primary?.value || action.locator || action.elementId || action.elementContentDesc || action.elementText)
      );

    const rawLocator =
      lastLocatorAction?.locatorBundle?.primary?.value ||
      lastLocatorAction?.elementId ||
      lastLocatorAction?.elementContentDesc ||
      lastLocatorAction?.elementText ||
      lastLocatorAction?.locator ||
      "system";

    const inferredStrategy: RecordedAction["locatorStrategy"] =
      lastLocatorAction?.locatorBundle?.primary?.strategy ||
      (rawLocator.startsWith("//") ? "xpath" : lastLocatorAction?.locatorStrategy || "");

    const assertionStep: RecordedAction = ensureActionLocatorBundle({
      id: crypto.randomUUID(),
      type: "assert",
      description: lastLocatorAction?.elementText
        ? `Assert "${lastLocatorAction.elementText}" is visible`
        : "Assert expected screen is loaded",
      locator: rawLocator,
      locatorStrategy: inferredStrategy,
      value: lastLocatorAction?.elementText || "",
      timestamp: Date.now(),
      enabled: true,
      assertionType: "visible",
    });

    setActions((prev) => [...prev, assertionStep]);
    setSavedManualScript(null);
    toast.success("Assertion step added for outcome validation");
  }, [actions]);

  const applyAISuggestion = useCallback((suggestion: RecorderAISuggestion) => {
    if (suggestion.type === "group_flow") {
      if (suggestion.suggestedValue) {
        setSaveScenarioName(suggestion.suggestedValue);
        setIsSaveDialogOpen(true);
      }
      dismissAISuggestion(suggestion.id);
      toast.success("AI suggestion prepared for scenario save");
      return;
    }

    if (suggestion.type === "add_assertion") {
      addOutcomeAssertionStep();
      dismissAISuggestion(suggestion.id);
      return;
    }

    if (suggestion.type === "context_assertion") {
      const idx = suggestion.stepIndex;
      const refAction = typeof idx === "number" ? actions[idx] : null;
      const snapshot = actions.map((a) => ({ ...a }));
      const insertIndex = typeof idx === "number" ? idx + 1 : actions.length;
      const locator = (suggestion as any).suggestedLocator || refAction?.locator || refAction?.smartXPath || refAction?.xpath || "";
      const locatorStrategy =
        (suggestion.suggestedLocatorStrategy as any) ||
        refAction?.locatorStrategy ||
        (locator?.startsWith("//") ? "xpath" : refAction?.elementContentDesc ? "accessibilityId" : refAction?.elementId ? "id" : undefined);
      const desc = suggestion.suggestedValue || "Add outcome assertion";
      const newAssert: RecordedAction = ensureActionLocatorBundle({
        id: crypto.randomUUID(),
        type: "assert",
        description: desc,
        locator,
        locatorStrategy: locatorStrategy || "xpath",
        enabled: true,
        timestamp: Date.now(),
        elementText: refAction?.elementText,
        elementContentDesc: refAction?.elementContentDesc,
        elementId: refAction?.elementId,
        elementClass: refAction?.elementClass,
        elementMetadata: refAction?.elementMetadata,
        smartXPath: refAction?.smartXPath,
        xpath: refAction?.xpath,
        locatorBundle: refAction?.locatorBundle,
        reliabilityScore: refAction?.reliabilityScore,
      });
      setActions((prev) => {
        const next = [...prev];
        next.splice(insertIndex, 0, newAssert);
        return next;
      });
      setSavedManualScript(null);
      setLastAIChange({ title: `Add assertion after step ${insertIndex}`, previousActions: snapshot });
      dismissAISuggestion(suggestion.id);
      toast.success("Assertion added");
      return;
    }

    if (typeof suggestion.stepIndex !== "number") {
      dismissAISuggestion(suggestion.id);
      return;
    }

    const targetIndex = suggestion.stepIndex;
    const targetAction = actions[targetIndex];
    if (!targetAction) {
      dismissAISuggestion(suggestion.id);
      return;
    }

    const snapshot = actions.map((action) => ({ ...action }));

    if (suggestion.type === "action_hint" && suggestion.suggestedValue) {
      setActions((prev) =>
        prev.map((action, index) =>
          index === targetIndex
            ? ensureActionLocatorBundle({
              ...action,
              description: suggestion.suggestedValue as string,
            })
            : action
        )
      );
      setSavedManualScript(null);
      setLastAIChange({ title: `Apply action hint for step ${targetIndex + 1}`, previousActions: snapshot });
      dismissAISuggestion(suggestion.id);
      toast.success(`Updated step ${targetIndex + 1} label`);
      return;
    }

    if (suggestion.type === "rename_step" && suggestion.suggestedValue) {
      setActions((prev) =>
        prev.map((action, index) =>
          index === targetIndex ? { ...action, description: suggestion.suggestedValue as string } : action
        )
      );
      setLastAIChange({ title: `Rename step ${targetIndex + 1}`, previousActions: snapshot });
      dismissAISuggestion(suggestion.id);
      toast.success(`Applied AI rename for step ${targetIndex + 1}`);
      return;
    }

    if (suggestion.type === "duplicate_step") {
      setActions((prev) =>
        prev.map((action, index) =>
          index === targetIndex ? { ...action, enabled: false } : action
        )
      );
      setLastAIChange({ title: `Disable duplicate step ${targetIndex + 1}`, previousActions: snapshot });
      dismissAISuggestion(suggestion.id);
      toast.success(`Disabled duplicate step ${targetIndex + 1}`);
      return;
    }

    if (suggestion.type === "locator_warning" && suggestion.suggestedValue) {
      const inferredStrategy =
        suggestion.suggestedLocatorStrategy ||
        (suggestion.suggestedValue.startsWith("//") ? "xpath" : targetAction.locatorStrategy);
      setActions((prev) =>
        prev.map((action, index) =>
          index === targetIndex
            ? ensureActionLocatorBundle({
              ...action,
              locator: suggestion.suggestedValue as string,
              locatorStrategy: inferredStrategy || action.locatorStrategy,
            })
            : action
        )
      );
      setSavedManualScript(null);
      setLastAIChange({ title: `Update locator for step ${targetIndex + 1}`, previousActions: snapshot });
      dismissAISuggestion(suggestion.id);
      toast.success(`Applied AI locator suggestion for step ${targetIndex + 1}`);
      return;
    }

    if (suggestion.type === "ensure_fallbacks") {
      setActions((prev) =>
        prev.map((action, index) =>
          index === targetIndex ? ensureActionLocatorBundle(action) : action
        )
      );
      setSavedManualScript(null);
      setLastAIChange({ title: `Add fallback locators for step ${targetIndex + 1}`, previousActions: snapshot });
      dismissAISuggestion(suggestion.id);
      toast.success(`Added self-healing fallbacks for step ${targetIndex + 1}`);
      return;
    }

    dismissAISuggestion(suggestion.id);
  }, [actions, addOutcomeAssertionStep, dismissAISuggestion]);

  async function highlightElementByLocator(
    locator: string,
    strategy?: string,
    fallbackCoords?: { x: number; y: number } | null
  ) {
    if (!captureMode || !mirrorActive) {
      toast.info("Start capture to highlight elements");
      return;
    }

    const applyInspectHighlight = (inspectPayload: any) => {
      if (!inspectPayload?.element?.bounds) return false;
      // Prevent stale tap-dismiss timer from instantly hiding a new highlight.
      if (tapInspectDismissRef.current) {
        clearTimeout(tapInspectDismissRef.current);
        tapInspectDismissRef.current = null;
      }
      // If user has pinned inspector, update the pinned target so highlight is visible.
      if (pinnedInspect) {
        setPinnedInspect(inspectPayload);
      } else {
        setTapInspect(inspectPayload);
      }
      setInspectorPanelOpen(true);
      setInspectorSpotlight(true);
      return true;
    };

    const value = String(locator || "").trim();
    if (!value) {
      toast.info("No locator available for highlight");
      return;
    }
    const resolvedStrategy = inferLocatorStrategy(value, strategy);
    if (resolvedStrategy === "coordinates") {
      toast.info("Coordinate locators cannot be highlighted reliably. Use id/a11y/xpath for visual inspect.");
      return;
    }

    try {
      const res = await fetch(`${AGENT_URL}/device/inspect-locator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locator: value,
          strategy: resolvedStrategy,
          deviceId: selectedDevice?.id,
          preferCache: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !data?.inspect?.element?.bounds) {
        const errMsg = String(data?.error || "");
        const agentNeedsRestart =
          res.status === 501 ||
          errMsg.includes("inspectByLocator is unavailable") ||
          errMsg.includes("inspectByLocator is not a function");
        let derivedFallback =
          (fallbackCoords && Number.isFinite(fallbackCoords.x) && Number.isFinite(fallbackCoords.y))
            ? fallbackCoords
            : boundsCenterFromString(activeInspect?.element?.bounds);
        if (!derivedFallback) {
          try {
            const uiRes = await fetch(`${AGENT_URL}/device/ui`, { method: "GET" });
            const uiData = await uiRes.json().catch(() => ({}));
            const xml = String(uiData?.xml || "");
            if (uiRes.ok && uiData?.success && xml) {
              derivedFallback = findCenterFromLocatorInUiXml(xml, value, resolvedStrategy);
            }
          } catch {
            // best effort only
          }
        }
        if (agentNeedsRestart && derivedFallback && Number.isFinite(derivedFallback.x) && Number.isFinite(derivedFallback.y)) {
          const fallbackRes = await fetch(`${AGENT_URL}/device/inspect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              x: derivedFallback.x,
              y: derivedFallback.y,
              mode: "tap",
              preferCache: true,
              preferXPath: true,
            }),
          });
          const fallbackData = await fallbackRes.json().catch(() => ({}));
          const highlighted = fallbackRes.ok && fallbackData?.success && applyInspectHighlight(fallbackData.inspect);
          if (highlighted) {
            toast.success("Element highlighted");
            return;
          }
          if (activeInspect?.element?.bounds && applyInspectHighlight(activeInspect)) {
            toast.info("Using current inspector target. Locator endpoint is unavailable in this agent runtime.");
            return;
          }
          toast.error("Element not found for this locator on the current screen.");
          return;
        }
        throw new Error(data?.error || "Element not found for locator");
      }
      const highlighted = applyInspectHighlight(data.inspect);
      if (!highlighted) {
        toast.error("Element matched but highlight bounds were unavailable.");
      } else {
        toast.success("Element highlighted");
      }
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.includes("inspectByLocator is unavailable") || msg.includes("inspectByLocator is not a function")) {
        if (activeInspect?.element?.bounds && applyInspectHighlight(activeInspect)) {
          toast.info("Using current inspector target. Locator endpoint is unavailable in this agent runtime.");
          return;
        }
        toast.error("Element not found for this locator on the current screen.");
        return;
      }
      if (msg.toLowerCase().includes("not found")) {
        toast.error("Element not found for this locator on the current screen.");
        return;
      }
      toast.error(msg || "Failed to highlight locator");
    }
  }

  const applyStableLocatorForAction = useCallback((action: RecordedAction, stepIndex: number) => {
    const mappedSuggestion = locatorSuggestionByActionId.get(action.id);
    if (mappedSuggestion?.suggestedValue) {
      const inferredStrategy =
        mappedSuggestion.suggestedLocatorStrategy ||
        (mappedSuggestion.suggestedValue.startsWith("//") ? "xpath" : action.locatorStrategy);
      const snapshot = actions.map((x) => ({ ...x }));
      setActions((prev) =>
        prev.map((x, idx) =>
          idx === stepIndex
            ? ensureActionLocatorBundle({
              ...x,
              locator: mappedSuggestion.suggestedValue as string,
              locatorStrategy: inferredStrategy || x.locatorStrategy,
            })
            : x
        )
      );
      setSavedManualScript(null);
      setLastAIChange({ title: `Apply stable locator for step ${stepIndex + 1}`, previousActions: snapshot });
      toast.success(`Applied stable locator for step ${stepIndex + 1}`);
      return;
    }

    const fallback = deriveStableLocatorFromAction(action);
    if (!fallback) {
      toast.info("No stable locator candidate found yet. Capture this element again in Inspector.");
      return;
    }

    const currentLocator = String(action.locator || "").trim();
    const currentStrategy = String(action.locatorStrategy || "").trim();
    const noChange =
      currentLocator === fallback.value &&
      currentStrategy === String(fallback.strategy || "");

    if (noChange) {
      setActions((prev) => prev.map((x, idx) => (idx === stepIndex ? ensureActionLocatorBundle(x) : x)));
      setSavedManualScript(null);
      toast.info("Step already uses the best available locator. Added fallback chain for self-healing.");
      return;
    }

    const snapshot = actions.map((x) => ({ ...x }));
    setActions((prev) =>
      prev.map((x, idx) =>
        idx === stepIndex
          ? ensureActionLocatorBundle({
            ...x,
            locator: fallback.value,
            locatorStrategy: fallback.strategy || x.locatorStrategy,
          })
          : x
      )
    );
    setSavedManualScript(null);
    setLastAIChange({ title: `Apply stable locator for step ${stepIndex + 1}`, previousActions: snapshot });
    toast.success(`Applied stable locator for step ${stepIndex + 1}`);
  }, [actions, locatorSuggestionByActionId]);

  const undoLastAIChange = useCallback(() => {
    if (!lastAIChange) return;
    setActions(lastAIChange.previousActions.map((action) => ({ ...action })));
    setSavedManualScript(null);
    toast.success(`Undid AI change: ${lastAIChange.title}`);
    setLastAIChange(null);
  }, [lastAIChange]);

  const askAI = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q) {
      toast.info("Type a question first");
      return;
    }

    const latestFailure =
      executionLogs.find((log) => log.status === "error")?.error || null;

    const fallbackAnswer = answerRecorderQuestion(q, {
      recording,
      isPaused,
      replaying,
      hasActions: actions.length > 0,
      connectionStatus,
      selectedDevice,
      lastReplayStatus,
      latestFailure,
    });

    setAskAIFeedbackSubmitted(false);
    setAskAIQuestion(q);

    setAskAIAnswer(fallbackAnswer);
  }, [
    actions.length,
    connectionStatus,
    executionLogs,
    isPaused,
    lastReplayStatus,
    recording,
    replaying,
    selectedDevice,
  ]);

  const showReplayPulse = useCallback((action: RecordedAction) => {
    if (!action?.coordinates || typeof action.coordinates.x !== "number" || typeof action.coordinates.y !== "number") {
      return;
    }
    const label = action.description || `${action.type} step`;
    setReplayPulse({ x: action.coordinates.x, y: action.coordinates.y, label, type: action.type, ts: Date.now() });
    if (replayPulseTimeoutRef.current) clearTimeout(replayPulseTimeoutRef.current);
    replayPulseTimeoutRef.current = setTimeout(() => setReplayPulse(null), 900);
  }, []);

  /**
   * Purpose:
   * Establishes a persistent Server-Sent Events (SSE) connection to the local agent.
   * This stream provides real-time updates for recorded steps and replay progress.
   */
  const connectToEventStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionStatus("connecting");
    console.log("[MobileRecorder] Connecting to SSE stream...");

    const source = new EventSource(`${AGENT_URL}/recording/events`);
    eventSourceRef.current = source;

    source.onopen = () => {
      console.log("[MobileRecorder] SSE connected");
      setConnectionStatus("connected");
      if (recording) {
        toast.success("Connected to recording agent");
      }
    };

    source.onmessage = (e) => {
      try {
        console.log("[MobileRecorder] Received event:", e.data);
        const event = JSON.parse(e.data);

        // Map events to user-friendly messages for replay progress
        if (event.type && event.type.startsWith("replay")) {
          if (event.type === "replay:start") {
            setReplaying(true);
            toast.info(event.description);
          } else if (event.type === "replay:info") {
            toast.info(event.description);
          } else if (event.type === "replay:step:start") {
            // Mark step as running
            setExecutionLogs(prev => prev.map((log, idx) => {
              // Try to match by ID if available, otherwise index
              const isMatch = event.stepId ? log.id === event.stepId : idx === event.index;
              return isMatch ? { ...log, status: "running" } : log;
            }));
            if (typeof event.index === "number") {
              const action = enabledReplayActions[event.index];
              if (action) showReplayPulse(action);
            }
          } else if (event.type === "replay:step:success") {
            // Mark step as success
            setExecutionLogs(prev => prev.map((log, idx) => {
              const isMatch = event.stepId ? log.id === event.stepId : idx === event.index;
              return isMatch ? { ...log, status: "success", duration: event.duration } : log;
            }));
          } else if (event.type === "replay:step:error") {
            // Mark step as error
            setExecutionLogs(prev => prev.map((log, idx) => {
              const isMatch = event.stepId ? log.id === event.stepId : idx === event.index;
              return isMatch ? { ...log, status: "error", error: event.error } : log;
            }));
          }
        } else if (event.type === "step-added") {
          // Handle real-time step recording from server
          if (!recording || isPaused) return;

          const rawStep = event.step || {};
          if (!rawStep.type) return;

          const meta = rawStep.elementMetadata || null;
          const elementId = rawStep.elementId || meta?.resourceId || "";
          const elementText = rawStep.elementText || meta?.text || "";
          const elementClass = rawStep.elementClass || meta?.class || "";
          const elementContentDesc = rawStep.elementContentDesc || meta?.contentDesc || "";
          const xpath = rawStep.xpath || "";
          const locatorStrategy = rawStep.locatorStrategy || "";
          const locatorBundle = rawStep.locatorBundle || null;
          const reliabilityScore = (typeof rawStep.reliabilityScore === "number") ? rawStep.reliabilityScore : undefined;
          const hierarchySnapshotId = rawStep.hierarchySnapshotId ?? null;
          const smartXPath = rawStep.smartXPath || "";
          const elementFingerprint = rawStep.elementFingerprint || "";
          const screenContext = rawStep.screenContext || null;

          const coords = rawStep.coordinates || null;
          const coordsLocator = (coords && typeof coords.x === "number" && typeof coords.y === "number")
            ? `${coords.x},${coords.y}`
            : "";

          let locator = rawStep.locator || "";
          if (!locator || locator === "system") {
            locator = elementId || elementContentDesc || elementText || coordsLocator || "";
          }

          const newStep: RecordedAction = ensureActionLocatorBundle({
            id: String(rawStep.id ?? crypto.randomUUID()),
            type: rawStep.type,
            description: rawStep.description || `${rawStep.type} action`,
            locator,
            value: rawStep.value,
            enabled: rawStep.enabled ?? true,
            coordinates: coords,
            timestamp: (typeof rawStep.timestamp === "number") ? rawStep.timestamp : Date.now(),
            elementId,
            elementText,
            elementClass,
            elementContentDesc,
            elementMetadata: meta,
            xpath,
            locatorStrategy,
            locatorBundle,
            reliabilityScore,
            hierarchySnapshotId,
            smartXPath,
            elementFingerprint,
            screenContext,
            assertionType: rawStep.assertionType,
          });

          setActions(prev => {
            // Deduplicate based on ID if server provides it, otherwise use type+timestamp
            const isDuplicate = prev.some(a =>
              (a.id === newStep.id) ||
              (a.type === newStep.type && Math.abs((a.timestamp || 0) - (newStep.timestamp || 0)) < 300)
            );
            if (isDuplicate) return prev;
            return [...prev, newStep];
          });
          setSavedManualScript(null); // Invalidate manual edit when new step arrives
          toast.success("Action recorded");
        }
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    source.onerror = (err) => {
      console.error("[MobileRecorder] SSE connection error:", err);
      if (source.readyState === EventSource.CLOSED) {
        setConnectionStatus("disconnected");
      } else {
        setConnectionStatus("connecting");
      }
    };
  }, [recording, isPaused, enabledReplayActions, showReplayPulse]);

  useEffect(() => {
    if (!mirrorActive || !captureMode) {
      setHoverInspect(null);
      setPinnedInspect(null);
      setTapInspect(null);
      if (tapInspectDismissRef.current) {
        clearTimeout(tapInspectDismissRef.current);
        tapInspectDismissRef.current = null;
      }
      setInspectorPanelOpen(false);
    }
  }, [mirrorActive, captureMode]);

  useEffect(() => {
    if (inspectorModeEnabled && captureMode && mirrorActive) {
      setInspectorPanelOpen(true);
    }
  }, [inspectorModeEnabled, captureMode, mirrorActive]);

  /* =====================================================
   * SCENARIO MANAGEMENT HANDLERS
   * ===================================================== */

  /**
   * Purpose:
   * Fetches the list of saved scenarios from the database (Supabase)
   * to populate the scenario management UI.
   */
  const fetchScenarios = async () => {
    setLoadingScenarios(true);
    const res = await ScenarioService.getScenarios();
    setLoadingScenarios(false);

    if (res.success && res.data) {
      // Map to RecordedScenario type with fallbacks
      const mappedScenarios: RecordedScenario[] = (res.data as any[]).map((s: any) => ({
        id: s.id,
        name: s.name || "Unnamed Scenario",
        description: s.description,
        steps: s.steps || [],
        app_package: s.app_package,
        manual_script: s.manual_script ?? null,
        user_id: s.user_id,
        created_at: s.created_at,
        updated_at: s.updated_at
      }));
      setScenarios(mappedScenarios);
    } else {
      toast.error("Failed to load scenarios");
    }
  };

  /**
   * Purpose:
   * Saves the current sequence of recorded actions as a new scenario or
   * updates an existing one in the database.
   */
  const handleSaveScenario = async () => {
    if (!saveScenarioName.trim()) {
      toast.error("Please enter a scenario name");
      return;
    }

    if (actions.length === 0) {
      toast.error("No actions to save");
      return;
    }

    // Determine if updating existing or saving new (Create copy if ID is cleared)
    // If user explicitly opened "Save As" (which we can flag), we clear ID.
    // For now, simple Save logic:

    const res = await ScenarioService.saveScenario(
      saveScenarioName,
      actions,
      currentScenarioId || undefined, // Update if ID exists
      undefined, // description
      appPackage,
      savedManualScript
    );

    if (res.success && res.data) {
      toast.success("Scenario saved successfully");
      setCurrentScenarioId(res.data.id);
      setCurrentScenarioName(res.data.name);
      saveManualScriptForScenario(res.data.id, savedManualScript);
      setIsSaveDialogOpen(false);
      setSaveScenarioName(""); // Reset input
      fetchScenarios(); // Refresh list
    } else {
      toast.error(res.error || "Failed to save scenario");
    }
  };

  const loadScenario = (scenario: RecordedScenario) => {
    // Parse steps if they are stored as JSON string (Supabase might return object automatically)
    let loadedActions = scenario.steps;
    if (typeof loadedActions === 'string') {
      try { loadedActions = JSON.parse(loadedActions); } catch (e) { console.error("Parse steps failed", e); }
    }

    const normalizedLoaded = Array.isArray(loadedActions) ? normalizeActionsForLocatorHealing(loadedActions as RecordedAction[]) : [];
    setActions(normalizedLoaded);
    setCurrentScenarioId(scenario.id);
    setCurrentScenarioName(scenario.name);
    setAppPackage(scenario.app_package || "");
    const serverScript = typeof scenario.manual_script === "string" ? scenario.manual_script : null;
    setSavedManualScript(serverScript ?? getManualScriptForScenario(scenario.id));
    setIsLoadDialogOpen(false);
    toast.success(`Loaded scenario: ${scenario.name}`);
  };

  const deleteScenario = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this scenario?")) return;

    const res = await ScenarioService.deleteScenario(id);
    if (res.success) {
      toast.success("Scenario deleted");
      removeManualScriptForScenario(id);
      if (currentScenarioId === id) {
        setCurrentScenarioId(null);
        setCurrentScenarioName("");
      }
      fetchScenarios();
    } else {
      toast.error("Failed to delete scenario");
    }
  };





  /* =====================================================
   * CLEANUP ON UNMOUNT
   * ===================================================== */

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (screenshotIntervalRef.current) {
        clearTimeout(screenshotIntervalRef.current as unknown as number);
      }
    };
  }, []);

  /* =====================================================
   * CONNECT WHEN RECORDING STARTS
   * ===================================================== */

  useEffect(() => {
    if (recording) {
      connectToEventStream();
    } else {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnectionStatus("disconnected");
    }
  }, [recording, connectToEventStream]);

  // Check app installation when package changes
  useEffect(() => {
    if (appPackage && mirrorActive) {
      checkAppInstallation(appPackage);
    } else {
      setIsAppInstalled(false);
    }
  }, [appPackage, mirrorActive]);

  // Fetch installed packages when mirror connects
  useEffect(() => {
    if (mirrorActive) {
      fetchInstalledPackages();
    }
  }, [mirrorActive]);

  /* =====================================================
   * HELPER: fetch with timeout
   * ===================================================== */

  const fetchJsonWithTimeout = async (url: string, timeoutMs = 2500) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return { ok: res.ok, json: await res.json() };
    } finally {
      clearTimeout(id);
    }
  };

  const verifySetup = async () => {
    try {
      // Use the unified status endpoint instead of multiple individual checks
      // This is more efficient and avoids the non-existent /emulator/status endpoint
      const { ok, json } = await fetchJsonWithTimeout(`${AGENT_URL}/setup/status`, 3000);

      if (!ok) return null;

      const verified = {
        appium: Boolean(json.appium),
        device: Boolean(json.device),
        emulator: Boolean(json.emulator),
      };

      if (setSetupState) {
        setSetupState((prev: any) => ({ ...prev, ...verified }));
      }

      return verified;
    } catch {
      return null;
    }
  };

  /* =====================================================
   * 📷 SCREENSHOT STREAM FOR EMBEDDED PREVIEW
   * ===================================================== */

  /**
   * Purpose:
   * Initializes and maintains a high-frequency screenshot stream from the mobile device.
   * Leverages a dynamic interval to balance UI responsiveness with network efficiency.
   */
  const startScreenshotStream = useCallback(() => {
    // Clear any existing scheduled capture
    if (screenshotIntervalRef.current) {
      clearTimeout(screenshotIntervalRef.current);
      screenshotIntervalRef.current = null;
    }

    let failCount = 0;
    const maxFails = advancedConfig.screenshotMaxFails; // Configurable max failures
    const intervalMs = 200; // desired interval between captures
    const timeoutMs = advancedConfig.screenshotTimeoutMs; // Configurable timeout

    // Prevent overlapping requests
    let inFlight = false;
    let active = true;

    const stopLoop = () => {
      active = false;
      if (screenshotIntervalRef.current) {
        clearTimeout(screenshotIntervalRef.current);
        screenshotIntervalRef.current = null;
      }
    };

    const captureScreenshot = async () => {
      if (!active) return;
      if (inFlight) return;
      inFlight = true;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Dynamic interval: Fast on success, Slow on failure
      let nextInterval = intervalMs;

      try {
        const res = await fetch(`${AGENT_URL}/device/screenshot`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            setMirrorImage((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return url;
            });
            setMirrorError(null);
            failCount = 0;
          } else {
            failCount++;
            nextInterval = 1000;
          }
        } else {
          const data = await res.json().catch(() => ({}));
          console.warn(`[Mirror] Server error (${res.status}):`, data.error || res.statusText);
          failCount++;
          nextInterval = 2000;
        }
      } catch (err: any) {
        const isNetworkError = err.name === 'TypeError' || err.name === 'AbortError' || err.message?.includes('Failed to fetch');

        failCount++;
        nextInterval = isNetworkError ? 5000 : 3000;

        if (isNetworkError) {
          setMirrorError("Device service is offline. Please start the WISPR Agent.");
        }
      } finally {
        inFlight = false;
      }
      if (failCount >= maxFails) {
        setMirrorActive(false);
        setMirrorError("Connection lost to device. Please reconnect.");
        stopLoop();
        return;
      }
      if (active) {
        screenshotIntervalRef.current = setTimeout(captureScreenshot as any, nextInterval);
      }
    };
    captureScreenshot();

    return () => stopLoop();
  }, [advancedConfig.screenshotMaxFails, advancedConfig.screenshotTimeoutMs]);

  const stopScreenshotStream = useCallback(() => {
    if (screenshotIntervalRef.current) {
      clearTimeout(screenshotIntervalRef.current);
      screenshotIntervalRef.current = null;
    }
  }, []);

  const startMjpegStream = useCallback(() => {
    if (!enableMjpeg) return false;
    stopScreenshotStream();
    setMjpegFailed(false);
    const deviceId = selectedDevice?.id || selectedDevice?.device || "";
    const url = `${AGENT_URL}/device/stream/mjpeg?deviceId=${encodeURIComponent(deviceId)}&fps=8&quality=70&ts=${Date.now()}`;
    setMirrorImage((prev) => {
      if (prev && prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return url;
    });
    setMjpegActive(true);
    return true;
  }, [enableMjpeg, selectedDevice?.device, selectedDevice?.id, stopScreenshotStream]);

  const stopMjpegStream = useCallback(() => {
    setMjpegActive(false);
    if (mjpegImgRef.current) {
      mjpegImgRef.current.src = "";
    }
  }, []);


  useEffect(() => {
    setMirrorActive(false);
    setMirrorImage(null);
    setCaptureMode(false);
    setMirrorError(null);
  }, [selectedDevice?.id, selectedDevice?.device]);

  /* =====================================================
   * 📱 STOP EMULATOR
   * ===================================================== */

  const stopEmulator = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/emulator/stop`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to stop emulator");
      console.log("[MobileRecorder] Emulator stopped");
      return true;
    } catch (err) {
      // Suppress noisy logs when agent is offline
      console.debug("[MobileRecorder] stopEmulator - agent offline");
      return false;
    }
  };

  /* =====================================================
   * 📱 CONNECT DEVICE - EMBEDDED MIRROR
   * ===================================================== */

  /**
   * Purpose:
   * Establishes a complete connection to the mobile device:
   * 1. Verifies local helper health.
   * 2. Checks if the device/emulator is already connected.
   * 3. Starts the specified emulator if necessary.
   * 4. Waits for the device to become fully responsive before proceeding.
   */
  const connectDevice = useCallback(async () => {
    if (!selectedDevice) {
      toast.error("Select a device first");
      return;
    }

    setMirrorError(null);
    setMirrorLoading(true);

    try {
      // First check if local helper is running (increased timeout to 5s for reliability)
      const healthRes = await fetch(`${AGENT_URL}/health`, {
        signal: AbortSignal.timeout(5000)
      }).catch(() => null);

      if (!healthRes?.ok) {
        setMirrorLoading(false);
        setMirrorError("Local helper not running. Run: cd public\\mobile-automation; npm start");
        toast.error("Local helper not running");
        return;
      }

      let deviceRes = await fetch(`${AGENT_URL}/device/check`);
      let deviceData = await deviceRes.json();

      if (!deviceData.connected) {
        if (!selectedDevice.real_mobile) {
          toast.info(`Starting emulator: ${selectedDevice.name || selectedDevice.device}...`);
          const startRes = await fetch(`${AGENT_URL}/emulator/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avd: selectedDevice.device }),
          });

          if (!startRes.ok) {
            // Handle 500 error - check if emulator actually started despite error
            if (startRes.status === 500) {
              console.warn("[connectDevice] Emulator start returned 500, checking if emulator is actually running...");
              try {
                const verifyRes = await fetch(`${AGENT_URL}/setup/status`);
                const verifyData = await verifyRes.json();

                if (!verifyData.emulator) {
                  const err = await startRes.json().catch(() => ({}));
                  throw new Error(`Failed to start emulator: ${err.error || startRes.statusText}`);
                }
                console.log("[connectDevice] Emulator is running despite 500 error");
              } catch (verifyError) {
                console.warn("[connectDevice] Could not verify emulator status after 500:", verifyError);
                const err = await startRes.json().catch(() => ({}));
                throw new Error(`Failed to start emulator: ${err.error || startRes.statusText}`);
              }
            } else {
              const err = await startRes.json().catch(() => ({}));
              throw new Error(`Failed to start emulator: ${err.error || startRes.statusText}`);
            }
          }
          toast.info("Waiting for emulator to initialize...");
          const isReady = await waitForDeviceReady(
            AGENT_URL,
            advancedConfig.emulatorReadyTimeoutMs,
            advancedConfig.emulatorReadyPollIntervalMs
          );
          if (isReady) {
            console.log("[MobileRecorder] Emulator ready");
          } else {
            console.warn("[MobileRecorder] Emulator readiness timeout, checking anyway...");
          }
          deviceRes = await fetch(`${AGENT_URL}/device/check`);
          deviceData = await deviceRes.json();
        }
      }

      if (!deviceData.connected) {
        setMirrorError("No device connected. Start an emulator or connect a device via ADB.");
        setMirrorLoading(false);
        toast.error("No device connected");
        return;
      }

      // If user selected an AVD name (e.g. "Pixel_4a"), bind to the actual ADB device id (e.g. "emulator-5554")
      // so replay/shell commands target a real connected device. Keep `selectedDevice.device` unchanged so we can
      // still refer to the AVD name for emulator start UX.
      const resolvedDeviceId =
        deviceData.primaryDevice ||
        (Array.isArray(deviceData.devices) ? deviceData.devices[0]?.id : null);

      if (resolvedDeviceId && selectedDevice.id !== resolvedDeviceId) {
        setSelectedDevice(prev => prev ? { ...prev, id: resolvedDeviceId } : prev);
      }

      // Test screenshot endpoint first
      const testScreenshot = await fetch(`${AGENT_URL}/device/screenshot`);
      if (!testScreenshot.ok) {
        const err = await testScreenshot.json().catch(() => ({}));
        setMirrorLoading(false);
        setMirrorError(err.error || "Cannot capture device screen");
        toast.error("Cannot capture device screen");
        return;
      }

      // Fetch device size for accurate click mapping
      try {
        const sizeRes = await fetch(`${AGENT_URL}/device/size`);
        if (sizeRes.ok) {
          const sizeJson = await sizeRes.json();
          if (sizeJson.success && sizeJson.size) setDeviceSize(sizeJson.size);
        } else {
          console.warn("[connectDevice] Failed to fetch device size:", sizeRes.status);
        }
      } catch (err) {
        console.warn("[connectDevice] Error fetching device size:", err);
      }

      setMirrorActive(true);
      setMirrorLoading(false);
      const startedMjpeg = startMjpegStream();
      if (!startedMjpeg) {
        startScreenshotStream();
      }

      // Fresh Device Start logic
      try {
        setIsPreparingDevice(true);
        console.log("[MobileRecorder] Initializing fresh device state...");

        // 1. Home screen using KEYCODE_HOME (3)
        await fetch(`${AGENT_URL}/device/key`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyCode: 3, keyName: "Home" }),
        });

        // Smart wait for device to be ready (replaces fixed 8s delay)
        console.log("[MobileRecorder] Waiting for device to settle...");
        const isReady = await waitForDeviceReady(
          AGENT_URL,
          advancedConfig.deviceReadyTimeoutMs,
          advancedConfig.deviceReadyPollIntervalMs
        );
        if (!isReady) {
          console.warn("[MobileRecorder] Device readiness timeout, continuing anyway...");
        }

        // 2. Clear app state if package is selected
        if (appPackage) {
          await fetch(`${AGENT_URL}/app/stop`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packageName: appPackage }),
          });
        }

        toast.info("Device reset to fresh state");
      } catch (err) {
        console.warn("[MobileRecorder] Failed to reset device state:", err);
      } finally {
        setIsPreparingDevice(false);
      }

      toast.success("Device connected", {
        description: "Live preview active. Tap, type, or navigate on the device to record actions",
      });
    } catch (err: any) {
      // Suppress noisy connection logs
      const isConnectionError = err.name === 'TypeError' || err.message?.includes('fetch');
      if (isConnectionError) {
        console.debug("[connectDevice] Agent unreachable");
      } else {
        console.error("[connectDevice] Error:", err);
      }

      setMirrorError("Local helper not reachable. Start with: npm start in public/mobile-automation");
      setMirrorLoading(false);
    }
  }, [selectedDevice, startScreenshotStream, advancedConfig.emulatorReadyTimeoutMs, advancedConfig.emulatorReadyPollIntervalMs, advancedConfig.deviceReadyTimeoutMs, advancedConfig.deviceReadyPollIntervalMs, appPackage]);

  const disconnectDevice = useCallback(() => {
    setMirrorActive(false);
    stopMjpegStream();
    stopScreenshotStream();
    if (mirrorImage && mirrorImage.startsWith("blob:")) {
      URL.revokeObjectURL(mirrorImage);
    }
    setMirrorImage(null);
    setMirrorError(null);
    toast.info("Device Disconnected");
  }, [mirrorImage, stopMjpegStream, stopScreenshotStream]);

  /* =====================================================
   * START RECORDING
   * ===================================================== */

  const startRecording = async () => {
    let canRecord = setupState.device;

    if (!canRecord) {
      const verified = await verifySetup();
      canRecord = Boolean(verified?.device);

      if (!verified) {
        toast.error("Complete setup before recording", {
          description: "Local agent not reachable at http://localhost:3001",
        });
        return;
      }

      if (!canRecord) {
        toast.error("Complete setup before recording", {
          description: "No ADB device detected",
        });
        return;
      }
    }

    if (!selectedDevice) {
      toast.error("Select a device first");
      return;
    }

    // For emulated devices, ensure emulator is running before starting recording
    if (!selectedDevice.real_mobile) {
      try {
        const emulatorStatusRes = await fetch(`${AGENT_URL}/setup/status`);
        const emulatorStatusData = await emulatorStatusRes.json();

        if (!emulatorStatusData.emulator) {
          toast.error("Emulator not running", {
            description: "Please start the emulator first before recording",
          });
          return;
        }
      } catch (emulatorError) {
        console.warn("[startRecording] Could not check emulator status:", emulatorError);
        toast.error("Cannot verify emulator status", {
          description: "Please ensure the emulator is running",
        });
        return;
      }
    }

    try {
      const response = await fetch(`${AGENT_URL}/recording/start`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to start recording");
      }

      setActions([]);
      setGeneratedScriptCache("");
      setRecording(true);

      toast.success("Recording started", {
        description: `Connected to ${selectedDevice.name || selectedDevice.device}`,
      });
      setCaptureMode(true);
    } catch (err) {
      // Suppress noisy connection logs
      console.debug("[MobileRecorder] Start recording failed - likely agent offline");
      toast.error("Failed to start recording", {
        description: "Make sure the agent is running (npm start)",
      });
    }
  };

  /* =====================================================
   * STOP RECORDING
   * ===================================================== */

  const stopRecording = async () => {
    try {
      const response = await fetch(`${AGENT_URL}/recording/stop`, {
        method: "POST",
      });

      const data = await response.json();
      setRecording(false);
      setIsPaused(false);
      setCaptureMode(false);

      // Merge any steps from server that we might have missed
      if (data.steps && data.steps.length > 0) {
        setActions((prev) => {
          const existingIds = new Set(prev.map((a) => a.timestamp));
          const newSteps = data.steps
            .filter((s: any) => !existingIds.has(s.timestamp))
            .map((s: any) => ({
              id: s.id || crypto.randomUUID(),
              type: s.type as ActionType,
              description: s.description,
              locator: s.locator,
              coordinates: s.coordinates,
              timestamp: s.timestamp,
              enabled: true
            }));

          if (newSteps.length === 0) return prev;
          return [...prev, ...normalizeActionsForLocatorHealing(newSteps as RecordedAction[])];
        });
      }

      toast.success("Recording stopped", {
        description: `${actions.length} actions captured`,
      });
    } catch (err) {
      // Suppress noisy connection logs
      console.debug("[MobileRecorder] Stop recording failed - likely agent offline");
      toast.error("Failed to stop recording");
      setRecording(false);
    }
  };

  const refreshSteps = async () => {
    try {
      const response = await fetch(`${AGENT_URL}/recording/steps`);
      const data = await response.json();

      if (data.success && data.steps) {
        const mappedSteps = data.steps.map((s: any) => ({
          id: crypto.randomUUID(),
          type: s.type as ActionType,
          description: s.description,
          locator: s.locator,
          coordinates: s.coordinates,
          timestamp: s.timestamp,
        }));
        setActions(normalizeActionsForLocatorHealing(mappedSteps as RecordedAction[]));
        toast.success(`Loaded ${mappedSteps.length} steps`);
      }
    } catch (err) {
      toast.error("Failed to refresh steps");
    }
  };

  const friendlyErrorMessage = (error: string): string => {
    const lowerError = error.toLowerCase();
    if (lowerError.includes('timeout')) return 'Timeout while waiting for element';
    if (lowerError.includes('not found') || lowerError.includes('no element')) return 'Element not found on screen';
    if (lowerError.includes('execution failed')) return 'Action could not be executed';
    if (lowerError.includes('connection')) return 'Connection error to device';
    return error; // Return original if no match
  };

  const runAdbCommand = async (command: string) => {
    if (!selectedDevice) return false;
    try {

      const res = await fetch(`${AGENT_URL}/device/shell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDevice.id || selectedDevice.device,
          command
        })
      });
      return res.ok;
    } catch (e) {
      console.error("ADB command failed", e);
      return false;
    }
  };

	  const replaySingleAction = async (action: RecordedAction) => {
    if (!selectedDevice) {
      toast.error("Select a device first");
      return;
    }

	    setReplaying(true);
	    toast.info(`Running step: ${action.type}`);
	    replayStopRequestedRef.current = false;
	    showReplayPulse(action);

	    try {

	      setExecutionLogs(prev => prev.map(log =>
	        log.id === action.id ? { ...log, status: "running", error: undefined } : log
	      ));

	      replayAbortRef.current?.abort();
	      const ac = new AbortController();
	      replayAbortRef.current = ac;
	        const res = await fetch(`${AGENT_URL}/recording/replay`, {
	          method: "POST",
	          headers: { "Content-Type": "application/json" },
	          body: JSON.stringify({
	            deviceId: selectedDevice.id || selectedDevice.device,
	            steps: [action],
	            startIndex: 0,
	            strict: true,
	            screenSettleDelayMs: advancedConfig.screenSettleDelayMs,
	            verifyUiChange: true,
	            failOnNoChange: true
	          }),
	          signal: ac.signal
	        });

	      const data = await res.json();
	      if (!res.ok || !data.success) {
	        throw new Error(data.error || "Step failed");
	      }

      setReplaying(false);
      setReplayIndex(null);

	    } catch (err: any) {
	      console.error("Single step replay error", err);
	      setReplaying(false);

	      const msg = err?.name === "AbortError" || replayStopRequestedRef.current ? "Stopped by user" : (err.message || "Step failed");
	      toast.error(`Step failed: ${msg}`);
	      setExecutionLogs(prev => prev.map(log =>
	        log.id === action.id ? { ...log, status: "error", error: msg } : log
	      ));
	    }
	  };

	  const replayActions = async (startIndex: number = 0) => {
	    const enabledActions = actions.filter(a => a.enabled !== false);
    if (!enabledActions.length) {
      toast.error("No enabled actions to replay");
      return;
    }

    if (!selectedDevice) {
      toast.error("Select a device first");
      return;
    }
	    setReplaying(true);
	    setLastReplayStatus(null);
	    setActiveTab("history");
	    replayStopRequestedRef.current = false;
	    let lastFailedStep = -1;
	    let failureReason = "";

    if (startIndex === 0) {
      setReplayStartTime(Date.now());
      if (appPackage) {
        toast.info(`Clearing app data for ${appPackage}...`);
        await runAdbCommand(`pm clear ${appPackage}`);
      }
      setExecutionLogs(enabledActions.map(a => ({
        id: a.id,
        description: a.description,
        status: "pending"
      })));
      toast.info("Starting replay...");
    } else {
      toast.info(`Resuming replay from Step ${startIndex + 1}...`);
      setExecutionLogs(prev => prev.map((log, idx) =>
        idx >= startIndex ? { ...log, status: "pending", error: undefined, duration: undefined } : log
      ));
    }
    setExecutionLogs(prev => prev.map(log => ({ ...log, error: undefined })));

	    try {
	      for (let i = startIndex; i < enabledActions.length; i++) {
	        if (replayStopRequestedRef.current) {
	          throw new Error("Stopped by user");
	        }
	        const action = enabledActions[i];
	        setReplayIndex(i);
	        showReplayPulse(action);

        // Update step status to running
        setExecutionLogs(prev => prev.map((log, idx) =>
          idx === i ? { ...log, status: "running" } : log
        ));

	        const startStepTime = Date.now();
	        replayAbortRef.current?.abort();
	        const ac = new AbortController();
	        replayAbortRef.current = ac;
	        const res = await fetch(`${AGENT_URL}/recording/replay`, {
	          method: "POST",
	          headers: { "Content-Type": "application/json" },
	          body: JSON.stringify({
	            deviceId: selectedDevice.id || selectedDevice.device,
	            steps: [action],
	            startIndex: 0,
	            screenSettleDelayMs: advancedConfig.screenSettleDelayMs,
	            strict: true,
	            verifyUiChange: true,
	            failOnNoChange: true
	          }),
	          signal: ac.signal
	        });

        const data = await res.json();
        const duration = Date.now() - startStepTime;

	        if (!res.ok || !data.success) {
	          const errorMsg = data.error || "Action failed";
          // Update step status to error
          setExecutionLogs(prev => prev.map((log, idx) =>
            idx === i ? { ...log, status: "error", error: errorMsg } : log
          ));
	          throw new Error(errorMsg);
	        }

        // Update step status to success
        setExecutionLogs(prev => prev.map((log, idx) =>
          idx === i ? { ...log, status: "success", duration } : log
        ));

        // Add a small delay between steps for visual clarity and device settling
        await new Promise(resolve => setTimeout(resolve, 500));
      }

	      setLastReplayStatus("PASS");
      setReplaying(false);
      setReplayIndex(null);
      await saveExecutionToHistory("SUCCESS");
      toast.success("Replay completed successfully!");

	    } catch (err: any) {
	      console.error("[MobileRecorder] Replay error:", err);
	      setLastReplayStatus("FAIL");
	      setReplaying(false);
	      setReplayIndex(null);
	      const msg = err?.name === "AbortError" || replayStopRequestedRef.current ? "Stopped by user" : (err.message || "Replay failed");
	      toast.error(`Replay failed: ${msg}`);
	      await saveExecutionToHistory("FAILED", undefined, msg);
	    }
	  };


  const saveExecutionToHistory = async (status: "SUCCESS" | "FAILED", failedIndex?: number, reason?: string) => {
    try {
      const duration = replayStartTime ? Date.now() - replayStartTime : 0;

      await ExecutionHistoryService.saveTestExecution({
        status,
        duration_ms: duration,
        failed_step_index: failedIndex,
        error_message: reason,
        results: {
          steps: executionLogs,
          device: selectedDevice?.device
        }
      });


      await ExecutionHistoryService.saveSuiteExecution({
        status,
        duration_ms: duration,
        error_message: reason,
        failed_step_index: failedIndex
      });

    } catch (err) {
      console.error("[MobileRecorder] Unexpected error saving history:", err);
    }
  };

  //FORCE real-time script generation during recording

  const generatedScript = useMemo(() => {
    if (savedManualScript) return savedManualScript;

    const enabledActions = actions.filter(a => a.enabled !== false);
    if (!enabledActions.length) return null;

	    return `import io.appium.java_client.AppiumBy;
import io.appium.java_client.android.AndroidDriver;
import io.appium.java_client.android.options.UiAutomator2Options;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.remote.RemoteWebElement;
import java.util.Arrays;
import java.util.List;
import java.util.function.Supplier;
import java.net.MalformedURLException;
import java.net.URL;
import java.time.Duration;

    /**
     * Auto-generated by Mobile Recorder
     * Platform: Android (Appium Java)
     * Generated: ${new Date().toISOString()}
     */
	    public class RecordedMobileTest {
	      private static WebElement findWithFallback(AndroidDriver driver, Duration timeout, List<Supplier<WebElement>> suppliers) throws InterruptedException {
	        long end = System.currentTimeMillis() + timeout.toMillis();
	        RuntimeException last = null;
	        while (System.currentTimeMillis() < end) {
	          for (Supplier<WebElement> s : suppliers) {
	            try {
	              WebElement el = s.get();
	              if (el != null) return el;
	            } catch (Exception e) {
	              last = new RuntimeException(e);
	            }
	          }
	          Thread.sleep(200);
	        }
	        if (last != null) throw last;
	        throw new RuntimeException("Element not found");
	      }

	      public static void main(String[] args) throws MalformedURLException, InterruptedException {
	        UiAutomator2Options options = new UiAutomator2Options();
      options.setPlatformName("Android");
      options.setAutomationName("UiAutomator2");
      options.setDeviceName("${selectedDevice?.device || "your-device-id"}");
      options.setAppPackage("com.example.app"); // Replace with your app package
      options.setAppActivity(".MainActivity");  // Replace with your app activity
      options.setNoReset(true);
      options.setEnsureWebviewsHavePages(true);

        AndroidDriver driver = new AndroidDriver(
        new URL("http://127.0.0.1:4723"), options
      );
      driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10));

      try {
${enabledActions
        .map((a, index) => {
          const stepNum = index + 1;
          const comment = `            // Step ${stepNum}: ${a.description}`;
          let javaCode = "";
          const javaStr = (s: string) =>
            String(s ?? "")
              .replace(/\\/g, "\\\\")
              .replace(/"/g, '\\"')
              .replace(/\r?\n/g, "\\n");
	          const xpathFor = (action: RecordedAction) => {
	            if (action.smartXPath) return action.smartXPath;
	            if (action.xpath) return action.xpath;

	            if (action.locatorStrategy === "xpath" && action.locator && (action.locator.startsWith("//") || action.locator.startsWith("//*"))) {
	              return action.locator;
	            }

	            if (action.elementId) return `//*[@resource-id='${action.elementId}']`;
	            if (action.elementContentDesc) return `//*[@content-desc='${action.elementContentDesc}']`;
	            if (action.elementText) return `//*[@text='${action.elementText}']`;

	            // If the backend didn't provide an XPath, avoid guessing from `locator` because it may be "x,y".
	            return "";
	          };

	          const locatorSuppliersFor = (action: RecordedAction) => {
	            const out: Array<{ strategy: string; value: string }> = [];
	            const push = (strategy: string, value: string) => {
	              const v = String(value || "");
	              if (!v) return;
	              const key = `${strategy}:${v}`;
	              if ((push as any)._seen?.has(key)) return;
	              (push as any)._seen = (push as any)._seen || new Set<string>();
	              (push as any)._seen.add(key);
	              out.push({ strategy, value: v });
	            };

	            const lb = action.locatorBundle as any;
	            if (lb?.primary?.strategy && lb?.primary?.value) push(lb.primary.strategy, lb.primary.value);
	            if (Array.isArray(lb?.fallbacks)) {
	              for (const f of lb.fallbacks) {
	                if (f?.strategy && f?.value) push(f.strategy, f.value);
	              }
	            }

	            // Backward-compatible fallbacks if bundle missing
	            const xp = xpathFor(action);
	            if (xp) push("xpath", xp);
	            if (action.elementId) push("id", action.elementId);
	            if (action.elementContentDesc) push("accessibilityId", action.elementContentDesc);
	            if (action.elementText) push("text", action.elementText);

	            return out;
	          };

	          const javaSupplierExpr = (c: { strategy: string; value: string }) => {
	            const v = javaStr(c.value);
	            if (c.strategy === "accessibilityId") return `() -> driver.findElement(AppiumBy.accessibilityId("${v}"))`;
	            if (c.strategy === "id") return `() -> driver.findElement(AppiumBy.id("${v}"))`;
	            if (c.strategy === "text") {
	              // Prefer contains for text to reduce brittleness; fallback chain still includes other strategies.
	              return `() -> driver.findElement(AppiumBy.androidUIAutomator("new UiSelector().textContains(\\\"${v}\\\")"))`;
	            }
	            // xpath and default
	            return `() -> driver.findElement(AppiumBy.xpath("${v}"))`;
	          };

	          switch (a.type) {
	            case "tap": {
	              const suppliers = locatorSuppliersFor(a);
	              if (suppliers.length) {
	                const supplierList = suppliers.map(javaSupplierExpr).join(",\n                ");
	                javaCode = `WebElement el${stepNum} = findWithFallback(driver, Duration.ofSeconds(7), Arrays.asList(\n                ${supplierList}\n            ));\n            el${stepNum}.click();`;
	              } else {
	                javaCode = `throw new RuntimeException("Tap step missing stable locator (no xpath/id/a11y/text available)");`;
	              }
	              break;
	            }

	            case "input": {
              const valueEnv = `System.getenv("INPUT_${stepNum}")`;
              const escapedValue = (typeof a.value === "string")
                ? a.value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r?\n/g, "\\n")
                : "";
              const valueStr = a.value ? `"${escapedValue}"` : valueEnv;

	              const suppliers = locatorSuppliersFor(a);
	              if (suppliers.length) {
	                const supplierList = suppliers.map(javaSupplierExpr).join(",\n                ");
	                javaCode = `WebElement input${stepNum} = findWithFallback(driver, Duration.ofSeconds(7), Arrays.asList(\n                ${supplierList}\n            ));\n            input${stepNum}.sendKeys(${valueStr});`;
	              } else {
	                javaCode = `throw new RuntimeException("Input step missing stable locator (no xpath/id/a11y/text available)");`;
	              }
	              break;
	            }

	            case "longPress":
	              {
	                const suppliers = locatorSuppliersFor(a);
	                if (suppliers.length) {
	                  const supplierList = suppliers.map(javaSupplierExpr).join(",\n                ");
	                  javaCode = `WebElement lp${stepNum} = findWithFallback(driver, Duration.ofSeconds(7), Arrays.asList(\n                ${supplierList}\n            ));\n            driver.executeScript(\"mobile: longClickGesture\", java.util.Map.of(\n                \"elementId\", ((RemoteWebElement) lp${stepNum}).getId(),\n                \"duration\", 1000\n            ));`;
	                } else {
	                  javaCode = `throw new RuntimeException(\"LongPress step missing stable locator (no xpath/id/a11y/text available)\");`;
	                }
	                break;
	              }
	              break;

            case "scroll":
              if (a.coordinates) {
                javaCode = `// Coordinate Scroll/Swipe action
            driver.executeScript("mobile: swipeGesture", java.util.Map.of(
                "left", ${a.coordinates.x}, "top", ${a.coordinates.y},
                "width", 200, "height", 200,
                "direction", "${a.coordinates.y > (a.coordinates.endY || 0) ? 'up' : 'down'}",
                "percent", 1.0
            ));`;
              } else {
                javaCode = `// Directional Scroll action
            driver.executeScript("mobile: scrollGesture", java.util.Map.of(
                "left", 100, "top", 100, "width", 200, "height", 200,
                "direction", "${a.value || 'down'}",
                "percent", 1.0
            ));`;
              }
              break;

            case "pressKey":
              javaCode = `driver.pressKey(new io.appium.java_client.android.nativekey.KeyEvent(io.appium.java_client.android.nativekey.AndroidKey.VIRTUAL_KEY_${a.description.split(': ').pop()}));`;
              if (a.value === "4") javaCode = `driver.pressKey(new io.appium.java_client.android.nativekey.KeyEvent(io.appium.java_client.android.nativekey.AndroidKey.BACK));`;
              if (a.value === "3") javaCode = `driver.pressKey(new io.appium.java_client.android.nativekey.KeyEvent(io.appium.java_client.android.nativekey.AndroidKey.HOME));`;
              if (a.value === "187") javaCode = `driver.pressKey(new io.appium.java_client.android.nativekey.KeyEvent(io.appium.java_client.android.nativekey.AndroidKey.APP_SWITCH));`;
              break;

            case "hideKeyboard":
              javaCode = `driver.hideKeyboard();`;
              break;

            case "wait":
              javaCode = `Thread.sleep(${a.value || 1000});`;
              break;

            case "doubleTap":
              javaCode = `// Double Tap action
            driver.executeScript("mobile: doubleClickGesture", java.util.Map.of(
                "x", ${a.coordinates?.x},
                "y", ${a.coordinates?.y}
            ));`;
              break;


            case "swipe":
              javaCode = `// Swipe action
            driver.executeScript("mobile: swipeGesture", java.util.Map.of(
                "left", 100, "top", 100, "width", 200, "height", 200,
                "direction", "up",
                "percent", 1.0
            ));`;
              break;

            case "clearCache":
              javaCode = `driver.executeScript("mobile: shell", java.util.Map.of("command", "pm clear ${a.value}"));`;
              break;

            case "assert":
              if (a.assertionType === "visible") {
                javaCode = `assert driver.findElement(AppiumBy.xpath("${a.locator}")).isDisplayed();`;
              } else if (a.assertionType === "text_equals") {
                javaCode = `assert driver.findElement(AppiumBy.xpath("${a.locator}")).getText().equals("${a.value}");`;
              } else if (a.assertionType === "enabled") {
                javaCode = `assert driver.findElement(AppiumBy.xpath("${a.locator}")).isEnabled();`;
              } else if (a.assertionType === "disabled") {
                javaCode = `assert !driver.findElement(AppiumBy.xpath("${a.locator}")).isEnabled();`;
              } else {
                javaCode = `// Manual Assertion: ${a.description}`;
              }
              break;

            default:
              return "";
          }

          return `${comment}\n            ${javaCode}`;
        })
        .join("\n\n")
      }
      } finally {
        driver.quit();
      }
    }
  }`;
  }, [actions, savedManualScript, selectedDevice]);

  useEffect(() => {
    if (generatedScript !== generatedScriptCache) {
      setGeneratedScriptCache(generatedScript);
    }
  }, [
    generatedScript,
    generatedScriptCache,
  ]);
  // Always prefer live cached script
  const liveGeneratedScript = useMemo(() => {
    if (savedManualScript) return savedManualScript;
    return generatedScriptCache || generatedScript;
  }, [savedManualScript, generatedScriptCache, generatedScript]);

  const handleSaveScript = async () => {
    try {
      const steps = editableScript.split(/\/\/ Step \d+:/).slice(1);

      const newActions = actions.map((action, index) => {
        if (index >= steps.length) return action;

        const stepContent = steps[index];
        const updatedAction = { ...action };


        const descMatch = stepContent.match(/\s*([^\r\n]+)/);
        if (descMatch && descMatch[1]) {
          updatedAction.description = descMatch[1].trim();
        }


        const locatorMatch = stepContent.match(/AppiumBy\.(id|xpath|androidUIAutomator)\("([^"]+)"\)/);
        if (locatorMatch) {
          const type = locatorMatch[1];
          const value = locatorMatch[2];

          if (type === "id") {
            updatedAction.elementId = value;
            updatedAction.locator = value;
          } else if (type === "xpath") {
            updatedAction.locator = value;
          } else if (type === "androidUIAutomator") {
            const textMatch = value.match(/text\("([^"]+)"\)/);
            if (textMatch) updatedAction.elementText = textMatch[1];
          }
        }


        const inputMatch = stepContent.match(/\.sendKeys\("([^"]+)"\)/);
        if (inputMatch) {
          updatedAction.value = inputMatch[1];
        }


        const clickMatch = stepContent.match(/"x", (\d+),[\s\S]*"y", (\d+)/);
        if (clickMatch && updatedAction.coordinates) {
          updatedAction.coordinates = {
            ...updatedAction.coordinates,
            x: parseInt(clickMatch[1]),
            y: parseInt(clickMatch[2])
          };
        }

        return updatedAction;
      });

      setActions(newActions);
      setSavedManualScript(editableScript);
      if (currentScenarioId) {
        saveManualScriptForScenario(currentScenarioId, editableScript);
        const persistResult = await ScenarioService.saveManualScript(currentScenarioId, editableScript);
        if (!persistResult.success && persistResult.error !== "manual_script_column_missing") {
          toast.error("Script saved locally, but cloud sync failed");
        } else if (persistResult.success) {
          toast.success("Script saved and synced to cloud");
        } else {
          toast.success("Script saved locally");
        }
      } else {
        toast.success("Script saved locally. Save scenario to sync across devices.");
      }
      setIsEditingScript(false);
    } catch (err) {
      console.error("[handleSaveScript] Error:", err);
      toast.error("Failed to parse and save script");
    }
  };

  const startEditingScript = () => {
    setEditableScript(savedManualScript || generatedScript || "");
    setIsEditingScript(true);
  };
  const copyScript = () => {
    if (!liveGeneratedScript) {
      toast.error("No script available to copy");
      return;
    }
    navigator.clipboard.writeText(liveGeneratedScript);
    toast.success("Script copied to clipboard");
  };

  const downloadScript = () => {
    if (!liveGeneratedScript) {
      toast.error("No script available to download");
      return;
    }
    const blob = new Blob([liveGeneratedScript], { type: "text/x-java-source" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RecordedMobileTest_${Date.now()}.java`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Java script downloaded");
  };

  const handleConfirmInput = async () => {
    if (!inputText || String(inputText).trim().length === 0) {
      setShowInputPanel(false);
      return;
    }

    // Keep behavior consistent with the disabled Send button:
    // never send an input step without a target (coords/field).
    if (!inputCoords || typeof inputCoords.x !== "number" || typeof inputCoords.y !== "number") {
      toast.error("Tap the target input field on the device screen first");
      return;
    }

    try {
      setInputPending(true);

      const response = await retryDeviceAction(async () => {
        const r = await fetch(`${AGENT_URL}/device/input`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x: inputCoords?.x,
            y: inputCoords?.y,
            text: inputText
          }),
        });

        if (!r.ok) {
          const jj = await r.json().catch(() => ({}));
          throw new Error(jj.error || "Failed to input text");
        }

        const data = await r.json().catch(() => ({}));
        return { response: r, data };
      }, advancedConfig.maxRetries, advancedConfig.retryDelayMs);


      if (response.data?.verified === false) {
        console.warn("[Input] Backend reported input verification failed");
        toast.warning("Text input may not have been fully captured");
      } else {
        toast.success("Text input captured");
        // Auto-hide keyboard after successful input
        hideKeyboard();
      }

      setSavedManualScript(null);


    } catch (err: any) {
      console.error("Input failed after retries:", err);
      toast.error(err.message || "Failed to input text");
    } finally {
      setInputPending(false);
      setShowInputPanel(false);
      setInputTargetMeta(null);
      setInputTargetBounds(null);

      setInputText("");
      setInputCoords(null);
    }
  };

  const hideKeyboard = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/device/hide-keyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: selectedDevice?.id || selectedDevice?.device }),
      });

      if (res.ok) {
        toast.success("Keyboard hidden");
      } else {
        toast.error("Failed to hide keyboard");
      }
    } catch (error) {
      console.error("[MobileRecorder] Hide keyboard error:", error);
      toast.error("Failed to hide keyboard");
    }
  };

  const moveAction = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === actions.length - 1) return;

    const newActions = [...actions];
    const targetIndex = direction === "up" ? index - 1 : index + 1;


    [newActions[index], newActions[targetIndex]] = [newActions[targetIndex], newActions[index]];

    setActions(newActions);
  };


  const previewInput = async (step: RecordedAction, overrideValue?: string) => {
    const text = (typeof overrideValue !== 'undefined') ? overrideValue : step.value;
    if (!text || String(text).trim().length === 0) {
      toast.error("No value to preview");
      return;
    }

    if (!step.coordinates || typeof step.coordinates.x !== 'number' || typeof step.coordinates.y !== 'number') {
      toast.error("No coordinates available for this step");
      return;
    }

    try {
      setPreviewPendingId(step.id);
      const r = await fetch(`${AGENT_URL}/device/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: step.coordinates.x, y: step.coordinates.y, text }),
      });

      if (!r.ok) {
        const jj = await r.json().catch(() => ({}));
        toast.error(jj.error || 'Failed to send preview input');
      } else {
        toast.success('Preview input sent to device');
      }
    } catch (err) {
      console.error('Preview input failed:', err);
      toast.error('Failed to send preview input');
    } finally {
      setPreviewPendingId(null);
    }
  };
  const loadUiHierarchy = async () => {
    try {
      const response = await fetch(`${AGENT_URL}/device/ui`);
      const data = await response.json();

      if (data.success && data.xml) {
        setUiXml(data.xml);
        toast.success("UI hierarchy loaded");
      } else {
        toast.error("Failed to load UI hierarchy");
      }
    } catch (err) {
      console.error("[loadUiHierarchy] Error:", err);
      toast.error("Failed to load UI hierarchy");
    }
  };

  const uploadApk = async (file: File) => {
    if (!file) {
      toast.error("Please select an APK file");
      return;
    }
    if (!file.name.toLowerCase().endsWith('.apk')) {
      toast.error("Please select a valid APK file");
      return;
    }

    setApkUploading(true);

    try {
      const formData = new FormData();
      formData.append('apk', file);

      const response = await fetch(`${AGENT_URL}/app/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setUploadedApk({ path: data.apkPath, name: file.name });
        toast.success("APK uploaded successfully");
      } else {
        toast.error(data.error || "Failed to upload APK");
      }
    } catch (err) {
      console.error("[uploadApk] Error:", err);
      toast.error("Failed to upload APK");
    } finally {
      setApkUploading(false);
    }
  };

  const installApk = async () => {
    if (!uploadedApk) {
      toast.error("No APK uploaded to install");
      return;
    }

    const deviceId = selectedDevice?.id || selectedDevice?.device;
    if (!deviceId) {
      toast.error("Please select or connect a device first");
      return;
    }

    setApkInstalling(true);
    const toastId = toast.loading(`Installing ${uploadedApk.name} on ${selectedDevice.name || deviceId}...`, {
      description: "This may take a minute for devices."
    });

    try {
      // Step 1: Trigger installation
      const res = await fetch(`${AGENT_URL}/app/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apkPath: uploadedApk.path,
          deviceId: deviceId
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Installation successful", {
          id: toastId,
          description: `${uploadedApk.name} is now ready to use.`
        });
        setIsAppInstalled(true);
        refreshAppPackages();
        setUploadedApk(prev => prev ? { ...prev, installed: true } : null);
      } else {
        throw new Error(data.error || "ADB installation failed");
      }
    } catch (err: any) {
      console.error("[installApk] Error:", err);
      toast.error("Installation failed", {
        id: toastId,
        description: err.message || "Failed to install APK. Check device connection and storage."
      });
    } finally {
      setApkInstalling(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setApkUploading(true);
    const toastId = toast.loading(`Uploading ${file.name}...`);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch(`${AGENT_URL}/app/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64,
          fileName: file.name,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUploadedApk({ path: data.path, name: file.name });
        toast.success("APK uploaded successfully. Ready to install.", { id: toastId });
        refreshAppPackages();
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (err: any) {
      console.error("[handleFileUpload] Error:", err);
      toast.error(err.message || "Failed to upload APK", { id: toastId });
    } finally {
      setApkUploading(false);
      e.target.value = '';
    }
  };

  const handleClearApp = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/app/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName: appPackage }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Cleared data for ${appPackage}`);

        if (recording && !isPaused) {
          setActions(prev => [...prev, {
            id: crypto.randomUUID(),
            type: "clearCache",
            description: `Clear Data: ${getAppFriendlyName(appPackage)}`,
            locator: "system",
            value: appPackage,
            timestamp: Date.now(),
            enabled: true
          }]);
        }
      } else {
        throw new Error(data.error || "Failed to clear app data");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleStopApp = async () => {
    if (!appPackage) return;
    try {
      const res = await fetch(`${AGENT_URL}/app/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName: appPackage }),
      });
      if (res.ok) {
        toast.success(`Stopped ${appPackage} `);

        if (recording && !isPaused) {
          setActions(prev => [...prev, {
            id: crypto.randomUUID(),
            type: "stopApp",
            description: `Force Stop: ${getAppFriendlyName(appPackage)}`,
            locator: "system",
            value: appPackage,
            timestamp: Date.now(),
            enabled: true
          }]);
        }
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleOpenAppSettings = async () => {
    if (!appPackage) {
      toast.error("Select an app first");
      return;
    }
    toast.info(`Opening Android settings for ${appPackage}...`);
    const success = await runAdbCommand(`am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:${appPackage}`);
    if (success) {
      toast.success("Settings opened on device");
    } else {
      toast.error("Failed to open app settings");
    }
  };

  const checkAppInstallation = async (pkg: string) => {
    if (!pkg) return;
    setCheckingInstall(true);
    try {
      const deviceId = selectedDevice?.id || selectedDevice?.device;
      const qs = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
      const res = await fetch(`${AGENT_URL}/app/check-install/${pkg}${qs}`);
      const data = await res.json();
      if (data.success) {
        setIsAppInstalled(data.installed);
      }
    } catch (err) {
      console.error("Check install error:", err);
    } finally {
      setCheckingInstall(false);
    }
  };

  const fetchInstalledPackages = async () => {
    setLoadingPackages(true);
    try {
      const deviceId = selectedDevice?.id || selectedDevice?.device;
      const qs = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
      const res = await fetch(`${AGENT_URL}/app/installed-packages${qs}`);
      if (!res.ok) {
        throw new Error(`Server error: ${res.status} `);
      }
      const data = await res.json();
      if (data.success && data.packages) {
        setInstalledPackages(data.packages);
        return data.packages;
      }
      return [];
    } catch (err) {
      // Suppress noisy connection logs
      console.debug("[fetchInstalledPackages] Agent unreachable");
      return null;
    } finally {
      setLoadingPackages(false);
    }
  };

  const handleDoubleTap = async (x: number, y: number) => {
    try {
      await retryDeviceAction(async () => {
        const res = await fetch(`${AGENT_URL}/device/tap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, y, count: 2 }),
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to double tap");
        }
        return data;
      }, advancedConfig.maxRetries, advancedConfig.retryDelayMs);
    } catch (err: any) {
      console.error("Double tap failed after retries:", err);
      toast.error(err.message || "Failed to double tap");
    }
  };

  // Find this function (approx line 1130) and replace it completely
  const handleDirectionalSwipe = async (direction: "up" | "down" | "left" | "right") => {
    try {
      const width = deviceSize?.width || 1080;
      const height = deviceSize?.height || 1920;
      const centerX = Math.round(width / 2);
      const centerY = Math.round(height / 2);

      let startX, startY, endX, endY;
      let duration = 260;

      // Use short vertical travel for natural in-app scrolling.
      switch (direction) {
        case "up":
          startX = centerX;
          startY = Math.round(height * 0.62);
          endX = centerX;
          endY = Math.round(height * 0.42);
          duration = 280;
          break;
        case "down":
          startX = centerX;
          startY = Math.round(height * 0.42);
          endX = centerX;
          endY = Math.round(height * 0.62);
          duration = 280;
          break;
        case "left":
          startX = Math.round(width * 0.9);
          startY = centerY;
          endX = Math.round(width * 0.1);
          endY = centerY;
          duration = 240;
          break;
        case "right":
          startX = Math.round(width * 0.1);
          startY = centerY;
          endX = Math.round(width * 0.9);
          endY = centerY;
          duration = 240;
          break;
      }

      await handleSwipe({
        x1: startX,
        y1: startY,
        x2: endX,
        y2: endY,
        duration,
        description: `Swipe ${direction}`
      });

    } catch (err: any) {
      console.error("[handleDirectionalSwipe] Error:", err);
      toast.error(`Failed to swipe ${direction}`);
    }
  };
  const handleUndo = () => {
    if (actions.length === 0) {
      toast.info("No actions to undo");
      return;
    }
    const lastAction = actions[actions.length - 1];
    setActions(prev => prev.slice(0, -1));
    toast.success(`Removed: ${lastAction.description} `);
  };

  const handleClearCache = async () => {
    if (!appPackage) {
      toast.error("Select an app first");
      return;
    }

    toast.promise(
      (async () => {
        const success = await runAdbCommand(`pm clear ${appPackage} `);
        if (!success) throw new Error("ADB command failed");
        return true;
      })(),
      {
        loading: `Wiping app state for ${appPackage}...`,
        success: `Successfully wiped ${getAppFriendlyName(appPackage)} `,
        error: "Failed to clear app cache/data",
      }
    );
  };

  const handleAssertion = async (type: "visible" | "text_equals" | "enabled" | "disabled" | "toast" | "screen_loaded") => {
    if (!recording || isPaused) {
      toast.warning("Start recording to add assertions");
      return;
    }

    const descriptionMap = {
      visible: "Assert Element Visible",
      text_equals: "Assert Text Equals",
      enabled: "Assert Element Enabled",
      disabled: "Assert Element Disabled",
      toast: "Assert Toast Message",
      screen_loaded: "Assert Screen Loaded"
    };

    // Use backend API to add assertion step
    try {
      const assertionLocator =
        selectedNode?.resourceId ||
        selectedNode?.contentDesc ||
        selectedNode?.text ||
        selectedNode?.locator ||
        selectedNode?.xpath ||
        "system";

      const response = await fetch(`${AGENT_URL}/recording/add-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "assert",
          description: descriptionMap[type],
          locator: assertionLocator,
          value: selectedNode?.text || "",
          assertionType: type
        })
      });
      if (response.ok) {
        toast.success(`Added Assertion: ${descriptionMap[type]} `);
      } else {
        throw new Error("Failed to add assertion");
      }
    } catch (err: any) {
      console.error("Assertion step error:", err);
      toast.error("Failed to add assertion");
    }
  };

  const handleLongPress = async (x: number, y: number) => {
    try {
      await retryDeviceAction(async () => {
        const res = await fetch(`${AGENT_URL}/device/long-press`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, y, duration: 1000 }),
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to long press");
        }
        return data;
      }, advancedConfig.maxRetries, advancedConfig.retryDelayMs);
    } catch (err: any) {
      console.error("Long press failed after retries:", err);
      toast.error(err.message || "Failed to long press");
    }
  };

  const handleSwipe = async (coords?: { x1: number, y1: number, x2: number, y2: number, duration?: number, description?: string }) => {
    try {
      const payload = coords || { x1: 500, y1: 1500, x2: 500, y2: 500, duration: 500 };
      const res = await fetch(`${AGENT_URL}/device/swipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to swipe");
      }
      toast.success((payload as any).description || "Swiped successfully");
    } catch (err) {
      toast.error("Failed to swipe");
    }
  };

  const handleKeyPress = async (keyCode: number, keyName: string) => {
    try {
      if (!recording || isPaused) {
        // No toast warning here because System Keys are often used for navigation even when not recording
      }

      await retryDeviceAction(async () => {
        const res = await fetch(`${AGENT_URL}/device/key`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyCode, keyName }),
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to press key");
        }
        return data;
      }, advancedConfig.maxRetries, advancedConfig.retryDelayMs);

      toast.success(`Pressed ${keyName} `);
    } catch (err: any) {
      console.error(`Key press failed after retries: `, err);
      toast.error(err.message || `Failed to press ${keyName} `);
    }
  };

  const handleOpenApp = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/app/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName: appPackage }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Launched ${appPackage} `);
        // Note: Step recording is handled by the backend via SSE stream
        // No need to manually add the step here to avoid duplicates
      } else {
        throw new Error(data.error || "Failed to launch app");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const refreshAppPackages = async () => {
    try {
      setLoadingPackages(true);
      const packages = await fetchInstalledPackages();

      if (!packages) {
        toast.error("Failed to fetch app list");
        return;
      }

      if (packages.length === 0) {
        toast.info("No user apps found on device");
        setInstalledPackages([]);
        return;
      }
      if (appPackage && !packages.includes(appPackage)) {
        setAppPackage("");
        setIsAppInstalled(null);
        toast.info("Selected app is no longer installed. Selection reset.");
      }

      toast.success(`App list refreshed(${packages.length} apps found)`);
    } catch (err) {
      toast.error("Failed to refresh apps");
    } finally {
      setLoadingPackages(false);
    }
  };

  const uninstallApp = async () => {
    if (!appPackage) {
      toast.error("No app selected to uninstall");
      return;
    }

    const confirm = window.confirm(
      `Are you sure you want to uninstall ?\n\n${appPackage} `
    );

    if (!confirm) return;

    try {
      const res = await fetch(`${AGENT_URL}/device/uninstall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName: appPackage }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Uninstall failed");
      }
      toast.success("App uninstalled successfully");
      await refreshAppPackages();
      setAppPackage("");
      setIsAppInstalled(false);

    } catch (err: any) {
      console.error("Uninstall error:", err);
      toast.error(err.message || "Failed to uninstall app");
    }
  };
  // Guided Tour Logic
  const startTour = () => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      steps: [
        {
          element: '#device-selector-header',
          popover: {
            title: 'Device Selection',
            description: 'Choose your target device here. The status indicator shows if the device is connected and ready for automation.',
            side: "bottom",
            align: 'start'
          }
        },
        {
          element: '#device-preview-card',
          popover: {
            title: 'Live Device Preview',
            description: 'Interact directly with this screen! <br/>• <b>Tap</b>: Click anywhere to tap <br/>• <b>Swipe</b>: Click and drag to swipe <br/>• <b>Input</b>: Click a text field to open the input panel',
            side: "right",
            align: 'start'
          }
        },
        {
          element: '#system-navigation-tools',
          popover: {
            title: 'System Navigation',
            description: 'Essential Android keys:<br/>• <b>Back</b>: Go to previous screen<br/>• <b>Home</b>: Return to home screen<br/>• <b>Recents</b>: View running apps<br/>• <b>Hide KB</b>: Dismiss the on-screen keyboard',
            side: "left",
            align: 'start'
          }
        },
        {
          element: '#interaction-tools',
          popover: {
            title: 'Interaction Tools',
            description: 'Advanced controls:<br/>• <b>Capture Mode</b>: Record taps without executing them immediately<br/>• <b>Undo</b>: Revert the last recorded action<br/>• <b>Swipe/Wait</b>: Manually add specific swipe or wait steps',
            side: "left",
            align: 'start'
          }
        },
        {
          element: '#app-control-section',
          popover: {
            title: 'App Management',
            description: 'Manage your target app:<br/>• <b>Launch/Stop</b>: Start or force-stop the selected app<br/>• <b>Clear Data</b>: Reset app state fully<br/>• <b>Upload APK</b>: Install new apps if none are found',
            side: "left",
            align: 'start'
          }
        },
        {
          element: '#recording-dashboard',
          popover: {
            title: 'Recording Controls',
            description: '• <b>Start</b>: Begin recording your session<br/>• <b>Replay</b>: Play back recorded actions immediately<br/>• <b>Pause/Resume</b>: Temporarily halt recording without stopping',
            side: "top",
            align: 'start'
          }
        },
        {
          element: '#actions-tabs',
          popover: {
            title: 'Data & History',
            description: '• <b>Actions</b>: View and edit the list of recorded steps<br/>• <b>Script</b>: Get the generated code for your automation<br/>• <b>History</b>: See logs of past executions',
            side: "top",
            align: 'start'
          }
        }
      ]
    });

    driverObj.drive();
  };

  // Auto-start tour on first visit - only when device is connected
  useEffect(() => {
    const hasSeenTour = localStorage.getItem("mobile_recorder_tour_seen");
    if (!hasSeenTour && mirrorActive) {
      const timer = setTimeout(() => {
        startTour();
        localStorage.setItem("mobile_recorder_tour_seen", "true");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [mirrorActive]);

  const handleDeviceSelection = async (device: SelectedDevice) => {
    if (recording) {
      try {
        await stopRecording();
        toast.info("Previous recording stopped due to device switch");
      } catch (err) {
        console.error("Failed to auto-stop recording:", err);
      }
    }
    setSelectedDevice(device);
  };
  return (
    <div className="space-y-4" id="recorder-container">
      {inspectorPortal}
      {/* NEW PREMIUM HEADER ROW */}
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-4 mb-4" id="device-selector-header">
        {/* LEFT: Title & Device Selector Grouped Tightly */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Title Block with subtle gradient and icon */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shadow-inner">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-0.5">
              <h2 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                Mobile Recorder
              </h2>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest opacity-70 leading-none">
                  Live interaction & logic recording
                </p>
              </div>
            </div>
          </div>

          {/* Vertical Divider (Visual separation) */}
          <div className="hidden md:block h-10 w-px bg-white/[0.08] mx-1" />
          {/* DEVICE SELECTOR CONTROL - MATCHING DASHBOARD PATTERN */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 py-1 px-3 rounded-lg border border-border bg-card/40 backdrop-blur-md shadow-card transition-all duration-200 hover:bg-muted/30 group">
	                  <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hidden lg:block">
                  Device
                </span>
                <div className="h-3 w-px bg-border/40 hidden lg:block" />
              </div>

              <div className="flex items-center">
                {/* Scaled down slightly to fit compact row */}
                <div className="scale-95 origin-left">
                  <DeviceSelector
                    onSelect={handleDeviceSelection}
                    selectedDeviceFromSetup={selectedDeviceFromSetup}
                    disabled={!!selectedDeviceFromSetup}
                    refreshKey={deviceRefreshKey}
                  />
                </div>

                {selectedDevice && (
                  <div className="ml-2 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  </div>
                )}

                {!selectedDeviceFromSetup && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 ml-1 transition-all"
                    onClick={() => {
                      setDeviceRefreshKey(prev => prev + 1);
                      toast.info("Refreshing device list...");
                    }}
                    title="Refresh device list"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT: Status Badge & Recording Guide */}
        <div className="flex items-center gap-4">
          {mirrorActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={startTour}
              className="h-9 px-4 text-sm font-bold text-primary hover:bg-primary/10 gap-2 rounded-lg border border-primary/20 shadow-sm transition-all group"
            >
              <HelpCircle className="h-4 w-4 group-hover:rotate-12 transition-transform" />
              Recording Guide
            </Button>
          )}

          {/* Recording Status Badge */}
          {recording && (
            <Badge
              variant={isPaused ? "secondary" : (connectionStatus === "connected" ? "default" : "destructive")}
              className={`h-8 px-4 rounded-lg text-[10px] font-black tracking-widest shadow-sm ${!isPaused && "animate-pulse"}`}
            >
              {isPaused ? "PAUSED" : (connectionStatus === "connected" ? "REC" : "RECORDING")}
            </Badge>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MAESTRO-STYLE EMULATOR WINDOW */}
        {/* FIXED SIZE MAESTRO-STYLE EMULATOR WINDOW */}
        <div
          className="lg:col-span-1 h-fit lg:sticky lg:top-24 flex flex-col rounded-xl overflow-hidden border border-zinc-800 shadow-card bg-zinc-950/50 backdrop-blur-sm mx-auto transition-all duration-300 hover:shadow-elegant"
          style={{ width: `${previewDimensions.width}px` }}
          id="device-preview-card"
        >

          {/* 1. EMULATOR HEADER BAR */}
          <div className="relative z-20 flex items-center justify-between px-4 py-3 bg-[#18181b] border-b border-zinc-800 select-none h-[52px]">
            <div className="flex items-center gap-3">
              {/* Device Name */}
              <div className="flex items-center gap-2 overflow-hidden">
                <Smartphone className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <span className="text-xs font-bold text-zinc-200 tracking-wide font-mono truncate max-w-[120px]" title={selectedDevice?.name || selectedDevice?.device}>
                  {selectedDevice?.name || selectedDevice?.device || "No Device"}
                </span>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md"
                onClick={connectDevice}
                title="Refresh Connection"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${mirrorLoading ? "animate-spin" : ""}`} />
              </Button>
              {mirrorActive && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-md"
                  onClick={disconnectDevice}
                  title="Disconnect Device"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* 2. EMULATOR VIEWPORT (FIXED HEIGHT, DYNAMIC WIDTH) */}
          <div
            className="relative bg-[#09090b] flex flex-col items-center justify-center overflow-hidden group transition-all duration-500"
            style={{ width: `${previewDimensions.width}px`, height: `${previewDimensions.height}px` }}
          >

            {/* --- STATUS OVERLAYS (Loading / Preparing) --- */}
            {(mirrorLoading || isPreparingDevice) && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="h-12 w-12 border-[3px] border-zinc-800/60 border-t-primary rounded-full animate-spin" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-bold text-zinc-200">{isPreparingDevice ? 'Booting Agent...' : 'Connecting...'}</p>
                    <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Please Wait</p>
                  </div>
                </div>
              </div>
            )}

            {/* --- MAIN CONTENT --- */}
            {!mirrorActive ? (
              // EMPTY STATE
              <div className="flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in-95 duration-500 opacity-60 hover:opacity-100 transition-opacity p-6">
                <div className="w-24 h-40 border-2 border-dashed border-zinc-800 rounded-xl flex items-center justify-center bg-zinc-900/20">
                  <Smartphone className="h-8 w-8 text-zinc-700" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-zinc-400">No Active Session</p>
                  <p className="text-[10px] text-zinc-600 max-w-[200px] mx-auto leading-relaxed">Select a device from the toolbar to initialize the system view.</p>
                </div>
                <Button
                  onClick={connectDevice}
                  className="h-9 px-6 text-[11px] font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg shadow-card hover:shadow-elegant transition-all duration-300 gap-2 group"
                >
                  <Zap className="h-3.5 w-3.5 fill-current group-hover:animate-pulse" />
                  Connect Device
                </Button>
              </div>
            ) : mirrorError ? (
              // ERROR STATE
              <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                <div className="p-3 bg-red-500/10 rounded-lg">
                  <WifiOff className="h-8 w-8 text-red-500/50" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-red-500">Signal Lost</h3>
                  <p className="text-[10px] text-zinc-500 font-mono max-w-[220px] mx-auto">{mirrorError}</p>
                </div>
                <Button variant="outline" size="sm" onClick={connectDevice} className="border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white mt-2">
                  Retry Connection
                </Button>
              </div>
            ) : (
              // ACTIVE SCREEN STREAM
              <div className="relative w-full h-full flex items-center justify-center bg-[#000]">
                {enableMjpeg && mirrorActive && !mjpegActive && (
                  <div className="absolute left-3 top-3 z-30">
                    <Badge variant="outline" className="text-[10px] h-6 px-2 border-amber-500/50 text-amber-400 bg-amber-500/10">
                      Live stream off, using snapshots
                    </Badge>
                  </div>
                )}



	                {/* INPUT TARGET HIGHLIGHT (visual cue for auto text entry) */}
	                {captureMode && showInputPanel && (inputTargetBounds || inputCoords) && (
	                  <div
	                    className="absolute pointer-events-none z-30 rounded-md border-2 border-emerald-400/70 bg-emerald-400/10 shadow-[0_0_18px_rgba(16,185,129,0.25)]"
                    style={(() => {
                      const devW = deviceSize?.width || 1080;
                      const devH = deviceSize?.height || 1920;
                      const containerW = previewDimensions.width;
                      const containerH = previewDimensions.height;
                      const { displayW, displayH, offsetX, offsetY } = getContainMetrics(containerW, containerH, devW, devH);

                      if (inputTargetBounds) {
                        const left = offsetX + (inputTargetBounds.x1 / devW) * displayW;
                        const top = offsetY + (inputTargetBounds.y1 / devH) * displayH;
                        const width = ((inputTargetBounds.x2 - inputTargetBounds.x1) / devW) * displayW;
                        const height = ((inputTargetBounds.y2 - inputTargetBounds.y1) / devH) * displayH;
                        return { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` };
                      }

                      if (inputCoords) {
                        const left = offsetX + (inputCoords.x / devW) * displayW;
                        const top = offsetY + (inputCoords.y / devH) * displayH;
                        return { left: `${left}px`, top: `${top}px`, width: `14px`, height: `14px`, transform: "translate(-50%, -50%)" };
                      }

                      return {};
                    })()}
	                  />
	                )}

                {/* INSPECTOR HIGHLIGHT OVERLAY (element-specific) */}
                {(() => {
                  if (!inspectorModeEnabled || !captureMode || !mirrorImage) return null;

                  const active =
                    (pinnedInspect && hasBounds(pinnedInspect)) ? pinnedInspect :
                      (tapInspect && hasBounds(tapInspect)) ? tapInspect :
                        (hoverInspect && hasBounds(hoverInspect)) ? hoverInspect :
                          null;

                  const devW = deviceSize?.width || 1080;
                  const devH = deviceSize?.height || 1920;
                  const containerW = previewDimensions.width;
                  const containerH = previewDimensions.height;
                  const { displayW, displayH, offsetX, offsetY } = getContainMetrics(containerW, containerH, devW, devH);

                  const boundsStr = String(active?.element?.bounds || "");
                  const m = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);

                  const leftPx = m ? clamp(offsetX + (parseInt(m[1], 10) / devW) * displayW, 0, containerW) : null;
                  const topPx = m ? clamp(offsetY + (parseInt(m[2], 10) / devH) * displayH, 0, containerH) : null;
                  const widthPx = m ? clamp(((parseInt(m[3], 10) - parseInt(m[1], 10)) / devW) * displayW, 0, containerW) : null;
                  const heightPx = m ? clamp(((parseInt(m[4], 10) - parseInt(m[2], 10)) / devH) * displayH, 0, containerH) : null;

                  const showFocus = leftPx != null && topPx != null && widthPx != null && heightPx != null;
                  const centerX = showFocus ? leftPx + widthPx / 2 : 0;
                  const centerY = showFocus ? topPx + heightPx / 2 : 0;

                  return (
                    <>
                      {showFocus && (
                        <>
                          <div
                            className="absolute pointer-events-none z-34 rounded-xl border border-primary/70 bg-primary/12"
                            style={{
                              left: `${leftPx}px`,
                              top: `${topPx}px`,
                              width: `${widthPx}px`,
                              height: `${heightPx}px`,
                              boxShadow: inspectorSpotlight
                                ? "0 0 24px rgba(59,130,246,0.34)"
                                : "0 0 14px rgba(59,130,246,0.26)",
                            }}
                          />
                          <div
                            className="absolute pointer-events-none z-35 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70"
                            style={{ left: `${centerX}px`, top: `${centerY}px` }}
                          >
                            <div className="absolute inset-2 rounded-full bg-white/55" />
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
                {/* REPLAY VISUAL FEEDBACK (step pulse) */}
                {replayPulse && mirrorImage && (
                  <div className="absolute inset-0 pointer-events-none z-40">
                    {(() => {
                      const devW = deviceSize?.width || 1080;
                      const devH = deviceSize?.height || 1920;
                      const containerW = previewDimensions.width;
                      const containerH = previewDimensions.height;
                      const { displayW, displayH, offsetX, offsetY } = getContainMetrics(containerW, containerH, devW, devH);
                      const left = offsetX + (replayPulse.x / devW) * displayW;
                      const top = offsetY + (replayPulse.y / devH) * displayH;
                      return (
                        <div
                          className="absolute -translate-x-1/2 -translate-y-1/2"
                          style={{ left: `${left}px`, top: `${top}px` }}
                        >
                          <div className="relative">
                            <div className="h-10 w-10 rounded-full border-2 border-emerald-400/80 shadow-[0_0_18px_rgba(16,185,129,0.45)] animate-ping" />
                            <div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-emerald-300/90 bg-emerald-400/10" />
                            {replayPulse.label && (
                              <div className="absolute left-1/2 top-12 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200 shadow">
                                {replayPulse.label}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
{mirrorImage && (
	                  <img
                      ref={mjpegImgRef}
	                    src={mirrorImage}
                    alt="Device Screen"
                    className={`w-full h-full object-contain select-none transition-all duration-200 ${captureMode ? 'cursor-pointer' : 'cursor-default'}`}
                    onError={() => {
                      if (mjpegActive) {
                        setMjpegActive(false);
                        setMjpegFailed(true);
                        startScreenshotStream();
                        toast.info("Live stream off, using snapshots");
                      }
                    }}
                    onLoad={() => {
                      setMirrorError(null);
                    }}
                    // --- INTERACTION LOGIC ---
	                    onContextMenu={(e) => {
	                      if (!captureMode || !inspectorModeEnabled) return;
	                      e.preventDefault();
	                      // Toggle pin (video-style "right click to inspect/pin")
	                      if (pinnedInspect) {
	                        setPinnedInspect(null);
	                        toast.info("Inspector unpinned");
	                        return;
	                      }

	                      const boundsStr = String(hoverInspect?.element?.bounds || "");
	                      if (!hoverInspect || !boundsStr.includes("[")) {
	                        toast.info("No element to pin yet (hover an element first)");
	                        return;
	                      }

	                      setPinnedInspect(hoverInspect);
	                      setInspectorPanelOpen(true);
	                      toast.success("Inspector pinned");
	                    }}
                    onMouseMove={(e) => {
                      if (!captureMode || !inspectorModeEnabled) return;
                      const now = Date.now();
                      if (now - lastHoverInspectTsRef.current < 60) return;
                      lastHoverInspectTsRef.current = now;

                      const el = e.currentTarget as HTMLImageElement;
                      const rect = el.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
	                      const clickY = e.clientY - rect.top;
	                      const finalDev = deviceSize || { width: 1080, height: 1920 };

                        const { displayW, displayH, offsetX, offsetY } = getContainMetrics(rect.width, rect.height, finalDev.width, finalDev.height);
                        const withinX = clickX - offsetX;
                        const withinY = clickY - offsetY;
                        // If pointer is outside the actual rendered image content, don’t “guess” a target.
                        if (withinX < 0 || withinY < 0 || withinX > displayW || withinY > displayH) {
                          setHoverInspect(null);
                          return;
                        }
                        const deviceX = Math.round((withinX / displayW) * finalDev.width);
                        const deviceY = Math.round((withinY / displayH) * finalDev.height);

                      hoverInspectAbortRef.current?.abort();
                      const ac = new AbortController();
                      hoverInspectAbortRef.current = ac;
                      const reqId = ++hoverRequestIdRef.current;
                      const timeout = setTimeout(() => ac.abort(), 700);

                    fetch(`${AGENT_URL}/device/inspect`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ x: deviceX, y: deviceY, mode: "hover", preferCache: true, preferXPath: true }),
                        signal: ac.signal
                      })
                        .then(r => r.json())
                        .then((data) => {
                          if (reqId !== hoverRequestIdRef.current) return;
                          if (!data?.success || !data.inspect) return;
                          const b = String(data.inspect?.element?.bounds || "");
                          if (b && b.includes("[")) {
                            setHoverInspect(data.inspect);
                          } else {
                            setHoverInspect(null);
                          }
                        })
                        .catch(() => { })
                        .finally(() => clearTimeout(timeout));
                    }}
	                    onMouseDown={(e) => {
	                      if (!captureMode) return;
	                      // Right click is reserved for "inspect/pin" (handled in onContextMenu).
	                      if (e.button !== 0) return;
                      const el = e.currentTarget as HTMLImageElement;
                      const rect = el.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const clickY = e.clientY - rect.top;
                      const finalDev = deviceSize || { width: 1080, height: 1920 };

                      const { displayW, displayH, offsetX, offsetY } = getContainMetrics(rect.width, rect.height, finalDev.width, finalDev.height);
                      const withinX = clamp(clickX - offsetX, 0, displayW);
                      const withinY = clamp(clickY - offsetY, 0, displayH);

                      const deviceX = Math.round((withinX / displayW) * finalDev.width);
                      const deviceY = Math.round((withinY / displayH) * finalDev.height);

                      pressCoordsRef.current = { x: deviceX, y: deviceY };
                      isDraggingRef.current = true;
                      longPressHappenedRef.current = false;

                      longPressTimerRef.current = setTimeout(() => {
                        if (isDraggingRef.current) {
                          handleLongPress(deviceX, deviceY);
                          longPressHappenedRef.current = true;
                          isDraggingRef.current = false;
                        }
                      }, 700);
                    }}
                    onMouseUp={async (e) => {
                      if (!captureMode || !pressCoordsRef.current) return;
                      // Avoid recording actions on right/middle click.
                      if (e.button !== 0) {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                        isDraggingRef.current = false;
                        pressCoordsRef.current = null;
                        return;
                      }

                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }

                      const el = e.currentTarget as HTMLImageElement;
                      const rect = el.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const clickY = e.clientY - rect.top;
                      const finalDev = deviceSize || { width: 1080, height: 1920 };

                      const { displayW, displayH, offsetX, offsetY } = getContainMetrics(rect.width, rect.height, finalDev.width, finalDev.height);
                      const withinX = clamp(clickX - offsetX, 0, displayW);
                      const withinY = clamp(clickY - offsetY, 0, displayH);

                      const deviceX = Math.round((withinX / displayW) * finalDev.width);
                      const deviceY = Math.round((withinY / displayH) * finalDev.height);

                      const startX = pressCoordsRef.current.x;
                      const startY = pressCoordsRef.current.y;
                      const dist = Math.sqrt(Math.pow(deviceX - startX, 2) + Math.pow(deviceY - startY, 2));

                      // 1. Handle Swipe
                      if (dist > 30) {
                        isDraggingRef.current = false;
                        const description = Math.abs(deviceX - startX) > Math.abs(deviceY - startY)
                          ? (deviceX > startX ? "Swipe Right" : "Swipe Left")
                          : (deviceY > startY ? "Swipe Down" : "Swipe Up");

                        handleSwipe({ x1: startX, y1: startY, x2: deviceX, y2: deviceY, description });
                        pressCoordsRef.current = null;
                        return;
                      }

                      // 2. Handle Long Press
                      if (longPressHappenedRef.current) {
                        isDraggingRef.current = false;
                        pressCoordsRef.current = null;
                        return;
                      }

                      isDraggingRef.current = false;

                      // 3. Execute Tap & Force Check
                      try {
                        const { res, json } = await retryDeviceAction(async () => {
                          const response = await fetch(`${AGENT_URL}/device/tap`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ x: deviceX, y: deviceY }),
                          });
                          const data = await response.json().catch(() => ({}));
                          if (!response.ok) throw new Error(data.error || "Tap failed");
                          return { res: response, json: data };
                        }, advancedConfig.maxRetries, advancedConfig.retryDelayMs);

	                        if (res.ok) {
	                          const step = json.step || {};
	                          const meta = step.elementMetadata || {};
                          const resourceId = String(meta.resourceId || step.elementId || "").toLowerCase();
                          const className = String(meta.class || step.elementClass || "").toLowerCase();

	                          // DEBUG: See exactly what your app is reporting in the Console (F12)
	                          console.log("Tap Metadata:", meta);

	                          if (inspectorModeEnabled) {
	                            const lb = step.locatorBundle || null;
	                            if (tapInspectDismissRef.current) {
	                              clearTimeout(tapInspectDismissRef.current);
	                              tapInspectDismissRef.current = null;
	                            }

	                            // Prefer bounds-bearing element for highlight; if missing, ask inspector endpoint once (best-effort).
	                            const metaBounds = String(meta?.bounds || "");
	                            let elementForInspect = meta;
	                            if (!metaBounds || !metaBounds.includes("[")) {
	                              try {
	                                const ir = await fetch(`${AGENT_URL}/device/inspect`, {
	                                  method: "POST",
	                                  headers: { "Content-Type": "application/json" },
	                                  body: JSON.stringify({ x: deviceX, y: deviceY, mode: "tap", preferCache: true }),
	                                });
	                                const ij = await ir.json().catch(() => ({}));
	                                if (ij?.success && ij?.inspect?.element?.bounds) {
	                                  elementForInspect = ij.inspect.element;
	                                }
	                              } catch { /* ignore */ }
	                            }
	                            const boundsStr = String(elementForInspect?.bounds || "");
	                            if (boundsStr && boundsStr.includes("[")) {
	                              setTapInspect({
	                                element: elementForInspect || meta,
	                                locatorBundle: lb,
	                                locators: lb ? [lb.primary, ...(lb.fallbacks || [])] : [],
	                                best: lb?.primary || null,
	                                reliabilityScore: (typeof step.reliabilityScore === "number") ? step.reliabilityScore : undefined,
	                                smartXPath: step.smartXPath || step.xpath || "",
	                                xpath: step.xpath || ""
	                              });
	                              tapInspectDismissRef.current = setTimeout(() => {
	                                setTapInspect(null);
	                                tapInspectDismissRef.current = null;
	                              }, 4000);
	                            } else {
	                              setTapInspect(null);
	                            }
	                          }

                          const isInput =
                            // Standard Checks
                            step.isInputCandidate ||
                            className.includes("edittext") ||
                            className.includes("textfield") ||
                            className.includes("textinput") ||
                            className.includes("input") ||
                            resourceId.includes("search") ||
                            resourceId.includes("input") ||

                            // NEW: Aggressive Checks for Custom/Hybrid Apps
                            className.includes("webkit") || // WebViews
                            className === "android.view.view" || // Generic Views (React Native/Flutter)

                            // Fallback: If it has an ID but is NOT a layout or simple text label
                            (resourceId.length > 0 &&
                              !className.includes("layout") &&
                              !className.includes("textview") &&
                              !className.includes("button") &&
                              !className.includes("image"));

                          if (recording && !isPaused && isInput) {
                            // Capture element hint + bounds for UX cue (highlight + label)
                            const boundsStr = String(meta.bounds || "");
                            const boundsMatch = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
                            if (boundsMatch) {
                              setInputTargetBounds({
                                x1: parseInt(boundsMatch[1], 10),
                                y1: parseInt(boundsMatch[2], 10),
                                x2: parseInt(boundsMatch[3], 10),
                                y2: parseInt(boundsMatch[4], 10),
                              });
                            } else {
                              setInputTargetBounds(null);
                            }

                            setInputTargetMeta({
                              resourceId: meta.resourceId || step.elementId,
                              text: meta.text || step.elementText,
                              class: meta.class || step.elementClass,
                              contentDesc: meta.contentDesc || step.elementContentDesc,
                              bounds: meta.bounds,
                            });

                            toast.info("Text entry detected", {
                              description: "Type your text and press Enter (or Send)"
                            });
                            setInputText("");
                            setInputCoords({ x: deviceX, y: deviceY });
                            setInputPending(false);
                            setShowInputPanel(true);
                          } else {
                            setInputTargetMeta(null);
                            setInputTargetBounds(null);
                            // OPTIONAL: Fallback if auto-detect STILL fails
                            // You can uncomment this to force it open on EVERY tap if needed:
                            // setInputCoords({ x: deviceX, y: deviceY });
                            // setShowInputPanel(true);
                          }
	                        }
	                      } catch (err: any) {
	                        toast.error(err.message || "Interaction failed");
	                      }
	                      pressCoordsRef.current = null;
	                    }}
	                    onMouseLeave={() => {
	                      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
	                      isDraggingRef.current = false;
	                      pressCoordsRef.current = null;
	                      if (!pinnedInspect) setHoverInspect(null);
	                    }}
	                    draggable={false}
	                  />
	                )}
              </div>
            )}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          {mirrorActive && (
            <Collapsible open={showQuickStart} onOpenChange={setShowQuickStart} className="w-full">
              <Card className="bg-card/50 backdrop-blur-sm shadow-card hover:shadow-elegant rounded-xl overflow-hidden transition-all duration-300 border-border animate-in fade-in slide-in-from-right-4">
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-2.5 px-4 border-b border-secondary/20 flex flex-row items-center justify-between cursor-pointer hover:bg-primary/[0.03] transition-colors">
                    <div className="flex flex-row items-baseline gap-2 flex-1 min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                        <Terminal className="h-4 w-4 text-primary" />
                        Device Control
                      </CardTitle>
                      <span className="text-[12px] font-mono text-muted-foreground truncate opacity-70" title={selectedDevice?.name || selectedDevice?.device || "No Device Selected"}>
                        {selectedDevice?.name || selectedDevice?.device || "No Device Selected"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[12px] font-bold uppercase tracking-wider text-primary">
                        <Wand2 className="h-3 w-3" />
                        {showQuickStart ? "Hide" : "Guide"}
                      </div>
                      <ChevronDown className={`h-3.5 w-3.5 text-primary transition-transform ${showQuickStart ? "rotate-180" : ""}`} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                {showQuickStart && (
                  <CollapsibleContent>
                    <div className="mx-4 mt-3 mb-6 space-y-6 animate-in fade-in slide-in-from-top-2 duration-500">
                      <div className="relative space-y-5">
                        {/* Vertical line connecting steps */}
                        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary/30 via-primary/10 to-transparent" />

                        {/* Step 1: Ready Your App */}
                        <div className="relative flex items-start gap-4 group">
                          <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-[10px] font-bold text-primary shadow-sm transition-transform group-hover:scale-110">
                            1
                          </div>
                          <div className="flex-1 space-y-1.5 pb-2">
                            <h4 className="text-sm font-bold leading-none tracking-tight text-foreground/90">Ready Your App</h4>
                            <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Use <b>Package Control</b> to select your app. If it's missing, upload the APK and install it. Use <span className="text-primary/80 font-medium">Wipe Data</span> for a clean test state.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Step 2: Start Capturing */}
                        <div className="relative flex items-start gap-4 group">
                          <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-[10px] font-bold text-primary shadow-sm transition-transform group-hover:scale-110">
                            2
                          </div>
                          <div className="flex-1 space-y-1.5 pb-2">
                            <h4 className="text-sm font-bold leading-none tracking-tight text-foreground/90">Start Capturing</h4>
                            <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Toggle <span className="text-primary font-bold">Start Capture: ON</span> to enable interaction. Click <span className="text-primary font-bold">Initiate Recording</span>—every tap, scroll, and key press will be captured in real-time.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Step 3: Validate & Finish */}
                        <div className="relative flex items-start gap-4 group">
                          <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-[10px] font-bold text-primary shadow-sm transition-transform group-hover:scale-110">
                            3
                          </div>
                          <div className="flex-1 space-y-1.5">
                            <h4 className="text-sm font-bold leading-none tracking-tight text-foreground/90">Validate & Finish</h4>
                            <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Add <b>Assertions</b> to verify screen state. Click <span className="text-destructive font-bold">Stop Test</span> when done to review your sequence, edit the script, or save the scenario to history.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pro Tips Section */}
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            <Wand2 className="h-3.5 w-3.5 text-amber-600" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Pro Tip</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            Use the <b>Undo</b> button to instantly remove accidental actions without stopping the recording.
                          </p>
                        </div>
                        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                            <Terminal className="h-3.5 w-3.5 text-indigo-600" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Shortcuts</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            The <b>Input Panel</b> is the best way to send verified text—avoid using the device keyboard when recording.
                          </p>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                )}

                <CardContent className="p-0">
                  {/* --- TOP ROW: PACKAGE SELECTION & STATUS --- */}
                  <div className="p-3 border-b border-border/40 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        {installedPackages.length === 0 ? (
                          <div className="h-9 flex items-center justify-between px-3 border border-dashed border-muted-foreground/30 rounded-lg bg-background/50 text-[10px] text-muted-foreground">
                            <span>No apps detected</span>
                            <Button
                              variant="link"
                              className="h-auto p-0 text-[10px] text-primary font-bold hover:no-underline"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              Upload APK
                            </Button>
                          </div>
                        ) : (
                          <div className="relative group flex items-center gap-2">
                            <div className="relative flex-1">
                              <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary" />
                              <Select
                                value={appPackage}
                                onValueChange={(val) => {
                                  setAppPackage(val);
                                  // Update Recently Used
                                  const recentStr = localStorage.getItem("mobile_recorder_recent_apps") || "[]";
                                  const recent = JSON.parse(recentStr);
                                  const updated = [val, ...recent.filter((id: string) => id !== val)].slice(0, 5);
                                  localStorage.setItem("mobile_recorder_recent_apps", JSON.stringify(updated));
                                }}
                              >
                                <SelectTrigger className="h-11 text-[12px] font-bold bg-background pl-9 border-border/80 shadow-md focus:ring-1 focus:ring-primary/30 rounded-lg group transition-all hover:bg-muted/30">
                                  <div className="flex flex-col items-start leading-tight truncate">
                                    <SelectValue placeholder="Choose App to Record" />
                                  </div>
                                </SelectTrigger>
                                <SelectContent className="max-h-[400px]">
                                  {/* RENDER SORTED LIST */}
                                  {(() => {
                                    const recentStr = localStorage.getItem("mobile_recorder_recent_apps") || "[]";
                                    const recentIds = JSON.parse(recentStr);

                                    // Sort Alphabetical by Friendly Name
                                    const sorted = [...installedPackages].sort((a, b) => {
                                      const nameA = getAppFriendlyName(a).toLowerCase();
                                      const nameB = getAppFriendlyName(b).toLowerCase();
                                      return nameA < nameB ? -1 : 1;
                                    });

                                    // Move recent apps to top
                                    const final = [
                                      ...sorted.filter(pkg => recentIds.includes(pkg)),
                                      ...sorted.filter(pkg => !recentIds.includes(pkg))
                                    ];

                                    return final.map((pkg) => (
                                      <SelectItem key={pkg} value={pkg} className="py-2.5 px-3 focus:bg-primary/10 transition-colors">
                                        <div className="flex flex-col gap-0.5">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-foreground">{getAppFriendlyName(pkg)}</span>
                                            {recentIds.includes(pkg) && (
                                              <Badge variant="outline" className="h-3.5 px-1 text-[8px] font-black uppercase text-primary border-primary/20 bg-primary/5">Recent</Badge>
                                            )}
                                          </div>
                                          <span className="text-[10px] font-mono text-muted-foreground font-medium opacity-90">{pkg}</span>
                                        </div>
                                      </SelectItem>
                                    ));
                                  })()}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 border border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all rounded-lg"
                              onClick={() => fileInputRef.current?.click()}
                              title="Upload New APK (Update/Reinstall)"
                            >
                              <Upload className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0 border-border/60 hover:bg-background hover:text-primary shadow-sm transition-colors"
                        onClick={refreshAppPackages}
                        disabled={loadingPackages}
                        title="Refresh App List"
                      >
                        <RefreshCw className={`h-4 w-4 text-muted-foreground ${loadingPackages ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                  </div>

                  {/* --- MIDDLE: UNIFIED CONTROL CENTER (No Tabs) --- */}
                  <div className="p-4 space-y-5 rounded-xl bg-gradient-to-br from-card/90 via-card/75 to-card/90 border border-border/70 shadow-card">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      <Smartphone className="h-3.5 w-3.5 text-primary" />
                      Device Controls
                    </div>

                    {/* 1. SYSTEM NAVIGATION (Top Row) */}
                    <div className="space-y-3 px-1" id="system-navigation-tools">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2 mb-1">
                        <Smartphone className="h-3.5 w-3.5 text-primary" /> System Navigation
                      </div>
                      <div className="grid grid-cols-4 gap-2.5">
                        <Button
                          variant="outline"
                          className="h-9 text-[10px] font-semibold gap-2 bg-card/85 hover:bg-primary/10 hover:text-primary border-border/60 group transition-all duration-200 rounded-lg shadow-sm hover:shadow-md"
                          onClick={() => handleKeyPress(4, "Back")}
                          title="Back Button"
                        >
                          <RotateCcw className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:-translate-x-0.5 transition-all" />
                          Back
                        </Button>
                        <Button
                          variant="outline"
                          className="h-9 text-[10px] font-semibold gap-2 bg-card/85 hover:bg-primary/10 hover:text-primary border-border/60 group transition-all duration-200 rounded-lg shadow-sm hover:shadow-md"
                          onClick={() => handleKeyPress(3, "Home")}
                          title="Home Button"
                        >
                          <Circle className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                          Home
                        </Button>
                        <Button
                          variant="outline"
                          className="h-9 text-[10px] font-semibold gap-2 bg-card/85 hover:bg-primary/10 hover:text-primary border-border/60 group transition-all duration-200 rounded-lg shadow-sm hover:shadow-md"
                          onClick={() => handleKeyPress(187, "Recents")}
                          title="Recent Apps"
                        >
                          <ListChecks className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          Tasks
                        </Button>
                        <Button
                          variant="outline"
                          className="h-9 text-[10px] font-semibold gap-2 bg-card/85 hover:bg-amber-500/10 hover:text-amber-600 border-border/60 group transition-all duration-200 rounded-lg shadow-sm hover:shadow-md"
                          onClick={hideKeyboard}
                          title="Hide Soft Keyboard"
                        >
                          <Keyboard className="h-4 w-4 text-muted-foreground group-hover:text-amber-600 transition-colors" />
                          Hide KB
                        </Button>
                      </div>
                    </div>

                    <div className="h-px bg-border/40 w-full" />

                    {/* 2. CAPTURE & INTERACTION (Prominent) */}
                    <div id="interaction-tools" className="space-y-3 px-1">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2 mb-2">
                        <MousePointer2 className="h-3.5 w-3.5 text-primary" /> Interaction Tools
                      </div>
                      <div className="flex gap-3">
                        <Button
                          variant={captureMode ? "default" : "secondary"}
                          className={`h-10 flex-1 text-[11px] font-bold tracking-wider gap-2 transition-all shadow-md rounded-lg ${captureMode ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-primary/25' : 'bg-card/85 text-foreground border border-border/70 hover:bg-primary/10 hover:text-primary'}`}
                          onClick={() => setCaptureMode(!captureMode)}
                        >
                          <MousePointer2 className={`h-4 w-4 ${captureMode ? 'animate-bounce' : ''}`} />
                          {captureMode ? "CAPTURE ACTIVE" : "START CAPTURE"}
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 flex-1 text-[11px] font-semibold tracking-wide gap-2 bg-card/85 border-border/60 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 rounded-lg shadow-sm hover:shadow-md transition-all"
                          onClick={handleUndo}
                          title="Undo Last Action"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Undo Last
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <Button variant="outline" className="h-9 text-[10px] font-semibold bg-card/85 border-dashed hover:bg-blue-500/5 hover:text-blue-600 hover:border-blue-200 group rounded-lg shadow-sm hover:shadow-md transition-all" onClick={() => setShowInputPanel(!showInputPanel)}>
                          <Type className="h-4 w-4 mr-2 text-muted-foreground group-hover:text-blue-500 transition-colors" /> Input
                        </Button>
                        <Button
                          variant="outline"
                          className="h-9 text-[10px] font-semibold bg-card/85 border-dashed hover:bg-amber-500/5 hover:text-amber-600 hover:border-amber-200 group rounded-lg shadow-sm hover:shadow-md transition-all"
                          onClick={() => {
                            if (!recording || isPaused) {
                              toast.warning("Start recording first");
                              return;
                            }

                            // FIX: Add step directly to local state (Bypass server)
                            const waitStep: RecordedAction = {
                              id: crypto.randomUUID(),
                              type: "wait",
                              description: "Wait (2s)",
                              value: "2000",
                              locator: "system",
                              timestamp: Date.now(),
                              enabled: true
                            };

                            setActions(prev => [...prev, waitStep]);
                            toast.info("Added Wait");
                          }}
                        >
                          <Clock className="h-4 w-4 mr-2 text-muted-foreground group-hover:text-amber-500 transition-colors" /> Wait
                        </Button>
                      </div>
                      {/* Find the div with "grid grid-cols-2" around line 1836 and REPLACE it with this: */}
                      <div className="grid grid-cols-2 gap-2.5 mt-3">
                        <Button
                          variant="ghost"
                          className="h-9 text-[10px] font-semibold bg-card/80 border border-border/40 hover:bg-primary/10 hover:text-primary rounded-lg shadow-sm transition-all"
                          onClick={() => handleDirectionalSwipe("up")}
                        >
                          <ChevronUp className="h-4 w-4 mr-2" /> Swipe Up
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-9 text-[10px] font-semibold bg-card/80 border border-border/40 hover:bg-primary/10 hover:text-primary rounded-lg shadow-sm transition-all"
                          onClick={() => handleDirectionalSwipe("down")}
                        >
                          <ChevronDown className="h-4 w-4 mr-2" /> Swipe Down
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-9 text-[10px] font-semibold bg-card/80 border border-border/40 hover:bg-primary/10 hover:text-primary rounded-lg shadow-sm transition-all"
                          onClick={() => handleDirectionalSwipe("left")}
                        >
                          <ArrowLeft className="h-4 w-4 mr-2" /> Swipe Left
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-9 text-[10px] font-semibold bg-card/80 border border-border/40 hover:bg-primary/10 hover:text-primary rounded-lg shadow-sm transition-all"
                          onClick={() => handleDirectionalSwipe("right")}
                        >
                          <ArrowRight className="h-4 w-4 mr-2" /> Swipe Right
                        </Button>
                      </div>
                    </div>

                    <div className="h-px bg-border/40 w-full" />

                    {/* 3. APP MANAGEMENT */}
                    <div id="app-control-section" className="space-y-3">
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-2">
                        <Package className="h-3.5 w-3.5 text-primary" /> App Management
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          className="h-8 text-[10px] font-semibold justify-start px-3 gap-2 border-primary/25 text-primary hover:bg-primary/10 hover:text-primary transition-colors rounded-lg"
                          onClick={handleOpenApp}
                          disabled={!appPackage}
                          title="Launch the selected app"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" /> Launch App
                        </Button>
                        <Button
                          variant="outline"
                          className="h-8 text-[10px] font-semibold justify-start px-3 gap-2 border-destructive/25 text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-colors rounded-lg"
                          onClick={handleStopApp}
                          disabled={!appPackage}
                          title="Force stop the selected app"
                        >
                          <Square className="h-3.5 w-3.5 fill-current" /> Force Stop
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          className="h-8 text-[10px] font-semibold justify-start px-3 gap-2 hover:bg-amber-500/10 hover:text-amber-700 hover:border-amber-500/30 rounded-lg"
                          onClick={handleClearApp}
                          disabled={!appPackage}
                        >
                          <Trash2 className="h-3.5 w-3.5 opacity-70" /> Clear Data
                        </Button>
                        <Button
                          variant="outline"
                          className="h-8 text-[10px] font-semibold justify-start px-3 gap-2 hover:bg-blue-500/10 hover:text-blue-700 hover:border-blue-500/30 rounded-lg"
                          onClick={handleClearCache}
                          disabled={!appPackage}
                        >
                          <RefreshCw className="h-3.5 w-3.5 opacity-70" /> Clear Cache
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <Button
                          variant="ghost"
                          className="h-8 text-[10px] font-semibold justify-start px-2 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive border border-transparent hover:border-destructive/20 rounded-lg"
                          onClick={uninstallApp}
                          disabled={!appPackage}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Uninstall
                        </Button>
                        <Button variant="ghost" className="h-8 text-[10px] justify-start text-muted-foreground hover:text-foreground px-2 rounded-lg" onClick={handleOpenAppSettings} disabled={!appPackage}>
                          <Settings className="h-3.5 w-3.5 mr-2" /> App Info
                        </Button>
                      </div>

                      {/* APK Upload (Persistent Workflow) */}
                      <div className="mt-2 pt-2 border-t border-dashed border-border/50 space-y-2">
                        <Button
                          variant="outline"
                          className="w-full h-8 text-[10px] font-semibold border-dashed border-border/60 hover:bg-primary/5 hover:text-primary hover:border-primary/20 transition-all rounded-lg"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={apkUploading}
                        >
                          {apkUploading ? (
                            <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="mr-2 h-3.5 w-3.5" />
                          )}
                          {installedPackages.length > 0 ? "Upload APK (Update/New)" : "Upload APK"}
                        </Button>

                        {uploadedApk && (
                          <div className={`animate-in fade-in slide-in-from-top-1 duration-300 mt-3 rounded-xl border p-2 transition-colors ${
                            // CHANGE COLOR: Darker Green on Success
                            (uploadedApk as any).installed
                              ? "bg-emerald-500/10 border-emerald-500/30"
                              : "bg-green-500/5 border-green-500/20"
                            }`}>
                            <div className="flex items-center justify-between px-2 py-1 mb-2">
                              <span className={`text-[10px] font-medium truncate max-w-[200px] flex items-center gap-2 ${(uploadedApk as any).installed ? "text-emerald-700 dark:text-emerald-400" : "text-green-700 dark:text-green-400"
                                }`}>
                                {/* ICON CHANGE: Package -> Checkmark */}
                                {(uploadedApk as any).installed ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <Package className="h-3.5 w-3.5" />
                                )}

                                {/* TEXT CHANGE: Ready -> Installed */}
                                {(uploadedApk as any).installed ? (
                                  <span className="font-bold">Successfully Installed: {uploadedApk.name}</span>
                                ) : (
                                  <span>Ready: {uploadedApk.name}</span>
                                )}
                              </span>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-muted-foreground hover:bg-black/5 rounded-full"
                                onClick={() => setUploadedApk(null)}
                                title="Dismiss"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>

                            <Button
                              variant="default"
                              className={`w-full h-9 text-[10px] font-black uppercase tracking-widest shadow-md transition-all rounded-lg gap-2 ${
                                // BUTTON STYLE CHANGE: Disable and Darken on Success
                                (uploadedApk as any).installed
                                  ? "bg-emerald-600 hover:bg-emerald-600 opacity-90 cursor-default"
                                  : "bg-green-600 hover:bg-green-700"
                                }`}
                              onClick={(uploadedApk as any).installed ? undefined : installApk}
                              disabled={apkInstalling || (uploadedApk as any).installed}
                            >
                              {apkInstalling ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (uploadedApk as any).installed ? (
                                <CheckCircle className="h-3.5 w-3.5 fill-current" />
                              ) : (
                                <Play className="h-3.5 w-3.5 fill-current" />
                              )}

                              {/* BUTTON TEXT CHANGE */}
                              {(uploadedApk as any).installed
                                ? "Installation Complete"
                                : (appPackage ? "Update Existing App" : "Install New APK")}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* --- BOTTOM: COMMAND BAR (Always Visible) --- */}
                  <div className="p-3 bg-muted/10 border-t border-border/40 backdrop-blur-sm" id="recording-dashboard">
                    {!recording ? (
                      <div className="flex gap-2">
                        <Button
                          onClick={startRecording}
                          disabled={!mirrorActive}
                          className="h-10 flex-1 text-[11px] font-black tracking-widest bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all gap-2"
                        >
                          <div className="w-2 h-2 rounded-full bg-white animate-pulse shadow-sm" />
                          START RECORDING
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => replayActions(0)}
                          disabled={actions.length === 0 || replaying}
                          className="h-10 flex-1 text-[11px] font-black tracking-widest border-border/60 hover:bg-background shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all gap-2"
                        >
                          <RotateCcw className="h-4 w-4" />
                          REPLAY
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant={isPaused ? "default" : "outline"}
                          onClick={async () => {
                            try {
                              const endpoint = isPaused ? "/recording/resume" : "/recording/pause";
                              const res = await fetch(`${AGENT_URL}${endpoint}`, { method: "POST" });
                              if (res.ok) setIsPaused(!isPaused);
                            } catch (err) { }
                          }}
                          className={`h-10 flex-1 text-[11px] font-black tracking-widest transition-all gap-2 ${isPaused ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md' : 'border-amber-500/50 text-amber-600 hover:bg-amber-50/50'}`}
                        >
                          {isPaused ? <><Play className="h-4 w-4 fill-current" /> RESUME</> : <><Pause className="h-4 w-4 fill-current" /> PAUSE</>}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={stopRecording}
                          className="h-10 flex-1 text-[11px] font-black tracking-widest shadow-md hover:shadow-lg hover:bg-destructive/90 transition-all gap-2"
                        >
                          <Square className="h-4 w-4 fill-current" /> STOP
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Collapsible>
          )}
          {showInputPanel && (
            <Card className="bg-card/95 backdrop-blur-md shadow-xl border-primary/20 border-2 rounded-xl overflow-hidden animate-in slide-in-from-top-4 mb-4 z-50">
              <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between bg-primary/5 border-b border-primary/10">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-primary/20 rounded-md">
                    <Type className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <CardTitle className="text-xs font-bold text-foreground">Text Input</CardTitle>
                    {inputCoords && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Target: ({inputCoords.x}, {inputCoords.y})
                      </span>
                    )}
                    {inputTargetMeta && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Field: {inputTargetMeta.resourceId || inputTargetMeta.contentDesc || inputTargetMeta.text || "input"}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive rounded-full"
                  onClick={() => {
                    setShowInputPanel(false);
                    setInputTargetMeta(null);
                    setInputTargetBounds(null);
                  }}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="py-4 px-4 flex gap-3 items-start">
                <div className="flex-1 space-y-2">
                  <Input
                    ref={inputFieldRef}
                    value={inputText}
                    onChange={(e: any) => setInputText(e.target.value)}
                    placeholder="Type text to send..."
                    className="h-10 font-medium text-sm focus-visible:ring-primary bg-background"
                    autoFocus={true}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmInput();
                      if (e.key === 'Escape') {
                        setShowInputPanel(false);
                        setInputTargetMeta(null);
                        setInputTargetBounds(null);
                      }
                    }}
                  />
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] text-muted-foreground">Press <kbd className="font-mono bg-muted px-1 rounded border">Enter</kbd> to send</p>
                    {!inputCoords && <span className="text-[10px] text-amber-500 animate-pulse font-bold">Tap screen to set target</span>}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    onClick={handleConfirmInput}
                    disabled={inputPending || !inputCoords || inputText.length === 0}
                    className="h-10 px-4 gap-2 font-bold shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
                    size="sm"
                  >
                    {inputPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                    Send
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full" id="actions-tabs">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="actions" className="flex items-center gap-2">
                <MousePointer2 className="h-4 w-4" />
                Actions
              </TabsTrigger>
              <TabsTrigger value="script" className="flex items-center gap-2">
                <Copy className="h-4 w-4" />
                Script
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="actions" className="mt-0 outline-none">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <Card className="bg-gradient-to-br from-card/85 via-card/70 to-card/85 backdrop-blur-md shadow-card hover:shadow-elegant rounded-xl overflow-hidden transition-all duration-300 border-border/70">
                <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <MousePointer2 className="h-5 w-5 text-primary" />
                        Captured Actions
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {currentScenarioName ? (
                        <Badge variant="outline" className="text-primary border-primary/20 h-5 px-1.5 gap-1">
                          <FileIcon className="h-3 w-3" /> {currentScenarioName}
                        </Badge>
                      ) : (
                        <span>{actions.length} steps captured</span>
                      )}
                      
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => {
                        fetchScenarios();
                        setIsLoadDialogOpen(true);
                      }}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Load
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      disabled={actions.length === 0}
                      onClick={() => {
                        setSaveScenarioName(currentScenarioName || "");
                        setIsSaveDialogOpen(true);
                      }}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={actions.length === 0}
                      onClick={() => {
                        if (confirm("Clear all recorded actions?")) {
                          setActions([]);
                          setCurrentScenarioId(null);
                          setCurrentScenarioName("");
                        }
                      }}
                      className="h-8 text-xs bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border-none"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Clear
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {actions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl border-muted/20 bg-gradient-to-b from-muted/10 to-transparent">
                      <p>No actions recorded yet</p>
                      <p className="text-xs mt-1">Start recording and interact with your device</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[450px] pr-4">
                      <div className="space-y-3">
	                        {actions.map((a, i) => {
                            const locatorScore = typeof (a as any).reliabilityScore === "number" ? Number((a as any).reliabilityScore) : null;
                            const isCriticalLocator =
                              (["tap", "input", "longPress", "assert"] as string[]).includes(a.type) &&
                              locatorScore != null &&
                              locatorScore <= 10;
                            return (
	                          <div
	                            key={a.id}
	                            data-action-index={i}
	                            data-action-id={a.id}
	                            className={`group flex items-start gap-3 p-3 border rounded-lg transition-all duration-200 hover:shadow-sm backdrop-blur-[1px] ${isCriticalLocator
                                  ? "bg-gradient-to-br from-red-500/10 to-rose-500/5 border-red-500/30 ring-1 ring-red-500/20 shadow-[0_8px_24px_rgba(239,68,68,0.14)]"
                                  : replayIndex === i
                                    ? 'bg-primary/5 border-primary ring-1 ring-primary/20'
                                    : 'bg-gradient-to-r from-muted/35 to-muted/20 border-transparent hover:border-border/70 hover:bg-muted/50'
                                }`}
	                          >
                            <div className="flex flex-col items-center gap-1 mt-0.5">
                              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${replayIndex === i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors'}`}>
                                {i + 1}
                              </div>
                              <div className="w-[1px] flex-1 bg-muted group-last:hidden" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2">
                                  {a.type === "tap" && <span title="Tap action - Click on screen element"><MousePointer2 className="h-3.5 w-3.5 text-blue-500" /></span>}
                                  {a.type === "input" && <span title="Text input - Enter text into field"><Type className="h-3.5 w-3.5 text-green-500" /></span>}
                                  {(a.type === "scroll" || a.type === "swipe") && <span title="Swipe/Scroll action - Navigate screen"><Move className="h-3.5 w-3.5 text-purple-500" /></span>}
                                  {a.type === "wait" && <span title="Wait/Delay - Pause execution"><Clock className="h-3.5 w-3.5 text-amber-500" /></span>}
                                  {a.type === "hideKeyboard" && <span title="Hide Keyboard"><Keyboard className="h-3.5 w-3.5 text-gray-500" /></span>}
                                  <span className="font-semibold text-sm leading-none capitalize">{a.type === "hideKeyboard" ? "Hide Keyboard" : a.type}</span>
                                  {a.enabled === false && <Badge variant="secondary" className="h-4 text-[9px] px-1 opacity-70">Disabled</Badge>}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                                    title="Run this step only"
                                    disabled={replaying}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      replaySingleAction(a);
                                    }}
                                  >
                                    <Play className="h-3 w-3" />
                                  </Button>
                                  <div className="flex bg-muted/50 rounded-md mr-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 text-muted-foreground hover:text-primary disabled:opacity-30"
                                      disabled={i === 0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveAction(i, "up");
                                      }}
                                      title="Move step up"
                                    >
                                      <ChevronUp className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 text-muted-foreground hover:text-primary disabled:opacity-30"
                                      disabled={i === actions.length - 1}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveAction(i, "down");
                                      }}
                                      title="Move step down"
                                    >
                                      <ChevronDown className="h-3 w-3" />
                                    </Button>
                                  </div>

                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() =>
                                      setActions((prev) =>
                                        prev.filter((x) => x.id !== a.id)
                                      )
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>

                              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 break-words mb-1.5 line-clamp-2">
                                {a.description}
                              </p>
                              {!a.elementId && !a.elementText && !a.elementContentDesc && !a.xpath && a.type === "tap" && (
                                <div className="mb-2 flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded w-fit">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Coordinate fallback mode</span>
                                </div>
                              )}

                              <div className="flex flex-wrap gap-1.5 items-center">
                                {a.coordinates && (
                                  <Badge variant="outline" className="bg-muted/30 text-[10px] px-1.5 h-5 font-mono border-none">
                                    <Settings className="h-2.5 w-2.5 mr-1 opacity-50" />
                                    {a.coordinates.x}, {a.coordinates.y}
                                  </Badge>
                                )}
                                {a.elementId && (
                                  <Badge variant="outline" className="bg-blue-500/5 text-blue-600 dark:text-blue-400 text-[10px] px-1.5 h-5 font-mono border-blue-500/20">
                                    ID: {a.elementId.split('/').pop()}
                                  </Badge>
                                )}
	                                {a.elementText && (
	                                  <Badge variant="outline" className="bg-green-500/5 text-green-600 dark:text-green-400 text-[10px] px-1.5 h-5 border-green-500/20">
	                                    TXT: "{a.elementText.length > 20 ? a.elementText.substring(0, 20) + '...' : a.elementText}"
	                                  </Badge>
	                                )}
	                                {typeof (a as any).reliabilityScore === "number" && (
	                                  <Badge
	                                    variant="outline"
	                                    className={`text-[10px] px-1.5 h-5 border font-mono ${((a as any).reliabilityScore >= 80)
	                                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300"
	                                      : ((a as any).reliabilityScore >= 50)
	                                        ? "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300"
	                                        : "bg-red-500/10 text-red-700 border-red-500/25 dark:text-red-300"
	                                      }`}
	                                  >
	                                    SCORE: {(a as any).reliabilityScore}
	                                  </Badge>
	                                )}
                                  {isCriticalLocator && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 h-5 border-red-500/40 text-red-700 dark:text-red-300 bg-red-500/10">
                                      CRITICAL LOCATOR
                                    </Badge>
                                  )}
	                                {a.value && a.type !== "input" && (
	                                  <Badge variant="outline" className="bg-amber-500/5 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 h-5 border-amber-500/20 font-mono">
	                                    VAL: {a.value}
	                                  </Badge>
	                                )}
                                  {locatorSuggestionByActionId.has(a.id) && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 h-5 border-primary/30 text-primary bg-primary/10">
                                      AI suggests a more stable locator
                                    </Badge>
                                  )}
	                              </div>

	                              {(["tap", "input", "longPress", "assert"] as string[]).includes(a.type) && (
	                                <div className="mt-3 p-2 bg-background/40 rounded-lg border border-border/50">
	                                  {(() => {
	                                    const lb = (a as any).locatorBundle || null;
	                                    const best = lb?.primary || null;
	                                    const bestXpath =
	                                      (best?.strategy === "xpath" && best?.value) ? String(best.value) :
	                                        ((a as any).smartXPath && String((a as any).smartXPath).startsWith("//") ? String((a as any).smartXPath) :
	                                          (a.xpath && String(a.xpath).startsWith("//") ? String(a.xpath) : ""));
	                                    const locatorLabel =
	                                      (a.locatorStrategy && a.locatorStrategy !== "") ? `${a.locatorStrategy}: ${a.locator}` :
	                                        (best ? `${best.strategy}: ${best.value}` : a.locator);

	                                    if (editingLocatorStepId === a.id) {
	                                      return (
	                                        <div className="space-y-2">
	                                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Locator (XPath)</div>
	                                          <Input
	                                            value={editingLocatorValue}
	                                            onChange={(e: any) => setEditingLocatorValue(e.target.value)}
	                                            className="h-8 text-xs bg-background font-mono"
	                                            autoFocus
	                                            placeholder='//*/[@resource-id="..."]'
	                                            onKeyDown={(e: any) => {
	                                              if (e.key === "Enter") {
	                                                const v = editingLocatorValue.trim();
	                                                if (!v.startsWith("//")) {
	                                                  toast.error("Please enter a valid XPath starting with //");
	                                                  return;
	                                                }
                                                setActions((prev) => prev.map((p) => p.id === a.id ? ensureActionLocatorBundle({ ...p, locator: v, locatorStrategy: "xpath" }) : p));
                                                setSavedManualScript(null);
                                                setEditingLocatorStepId(null);
                                                toast.success("Locator updated");
                                                highlightElementByLocator(v, "xpath");
                                              }
                                              if (e.key === "Escape") setEditingLocatorStepId(null);
                                            }}
                                          />
	                                          <div className="flex items-center gap-2">
	                                            <Button
	                                              size="sm"
	                                              variant="outline"
	                                              className="h-8 px-2 text-xs"
	                                              onClick={() => {
	                                                const v = editingLocatorValue.trim();
	                                                if (!v) {
	                                                  toast.info("Enter a locator first");
	                                                  return;
	                                                }
	                                                highlightElementByLocator(v, "xpath");
	                                              }}
	                                            >
	                                              Highlight
	                                            </Button>
	                                            <Button
	                                              size="sm"
	                                              className="h-8 px-2 text-xs"
	                                              onClick={() => {
	                                                const v = editingLocatorValue.trim();
	                                                if (!v.startsWith("//")) {
	                                                  toast.error("Please enter a valid XPath starting with //");
	                                                  return;
	                                                }
                                                setActions((prev) => prev.map((p) => p.id === a.id ? ensureActionLocatorBundle({ ...p, locator: v, locatorStrategy: "xpath" }) : p));
                                                setSavedManualScript(null);
                                                setEditingLocatorStepId(null);
                                                toast.success("Locator updated");
                                                highlightElementByLocator(v, "xpath");
                                              }}
                                            >
                                              Save
                                            </Button>
	                                            <Button
	                                              size="sm"
	                                              variant="ghost"
	                                              className="h-8 px-2 text-xs"
	                                              onClick={() => setEditingLocatorStepId(null)}
	                                            >
	                                              Cancel
	                                            </Button>
	                                          </div>
	                                        </div>
	                                      );
	                                    }

	                                    return (
	                                      <div className="space-y-1.5">
	                                        <div className="flex items-center justify-between gap-2">
	                                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Locator</div>
	                                          <div className="flex items-center gap-1">
	                                            {!!bestXpath && (
	                                              <Button
	                                                size="sm"
	                                                variant="ghost"
	                                                className="h-6 text-[10px] px-1.5"
	                                                onClick={() => copyText(bestXpath, "XPath copied")}
	                                              >
	                                                <Copy className="h-3 w-3 mr-1" />
	                                                Copy XPath
	                                              </Button>
	                                            )}
	                                            <Button
	                                              size="sm"
	                                              variant="ghost"
	                                              className="h-6 text-[10px] px-1.5"
	                                              onClick={() => {
	                                                const seed = bestXpath || (a.locatorStrategy === "xpath" ? a.locator : "");
	                                                setEditingLocatorStepId(a.id);
	                                                setEditingLocatorValue(seed || "");
	                                              }}
	                                            >
	                                              <Edit className="h-3 w-3 mr-1" />
	                                              Edit
	                                            </Button>
	                                          </div>
	                                        </div>
	                                        <div className="text-[11px] font-mono text-muted-foreground break-all">
	                                          {locatorLabel ? (
                                              <button
                                                type="button"
                                                className="text-left underline-offset-2 hover:underline"
                                                onClick={() => highlightElementByLocator(a.locator || bestXpath || "", a.locatorStrategy, a.coordinates || null)}
                                                title="Highlight element for this locator"
                                              >
                                                {locatorLabel}
                                              </button>
                                            ) : <em>(no locator)</em>}
	                                        </div>
	                                        <div className="text-[10px] text-muted-foreground/80">
	                                          Tip: copy XPath from the Inspector panel and paste here to make replay + script more reliable.
	                                        </div>
                                          {locatorSuggestionByActionId.has(a.id) && (
                                            <div className="mt-2 rounded-md border border-primary/25 bg-primary/5 p-2">
                                              <div className="flex items-center justify-between gap-2">
                                                <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                                                  AI Suggested
                                                </div>
                                                <Button
                                                  size="sm"
                                                  className="h-6 text-[10px] px-2"
                                                  onClick={() => {
                                                    const suggestion = locatorSuggestionByActionId.get(a.id);
                                                    if (!suggestion) return;
                                                    applyAISuggestion(suggestion);
                                                  }}
                                                >
                                                  Use Suggestion
                                                </Button>
                                              </div>
                                              <p className="text-[10px] mt-1 text-muted-foreground">
                                                {locatorSuggestionByActionId.get(a.id)?.detail}
                                              </p>
                                            </div>
                                          )}
                                          {isCriticalLocator && (
                                            <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2">
                                              <div className="text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
                                                Critical Locator Resolution
                                              </div>
                                              <p className="text-[10px] mt-1 text-muted-foreground">
                                                Score is 10 or below. Replace generic selectors with context-aware locator (id/a11y/text + ancestor/parent), then keep coordinates as last fallback.
                                              </p>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="mt-2 h-6 text-[10px] px-2 border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-500/10"
                                                onClick={() => applyStableLocatorForAction(a, i)}
                                              >
                                                Apply Stable Locator
                                              </Button>
                                            </div>
                                          )}
	                                      </div>
	                                    );
	                                  })()}
	                                </div>
	                              )}

	                              {a.type === "input" && (
	                                <div className="mt-3 p-2 bg-muted/30 rounded-lg border border-dashed border-muted">
                                  {editingStepId === a.id ? (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={editingValue}
                                        onChange={(e: any) => setEditingValue(e.target.value)}
                                        className="h-8 text-xs bg-background"
                                        autoFocus
                                        onKeyDown={(e: any) => {
                                          if (e.key === "Enter") {
                                            setActions((prev) => prev.map((p) => p.id === a.id ? { ...p, value: editingValue } : p));
                                            setEditingStepId(null);
                                            toast.success("Updated");
                                          }
                                          if (e.key === "Escape") setEditingStepId(null);
                                        }}
                                      />
                                      <Button size="sm" className="h-8 px-2 text-xs" onClick={() => {
                                        setActions((prev) => prev.map((p) => p.id === a.id ? { ...p, value: editingValue } : p));
                                        setEditingStepId(null);
                                        toast.success("Updated");
                                      }}>Save</Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-xs font-mono text-muted-foreground truncate">
                                        {a.value ? <span>Value: <span className="text-zinc-900 dark:text-zinc-100 font-bold">"{a.value}"</span></span> : <em>(empty)</em>}
                                      </div>
                                      <div className="flex gap-1">
                                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={() => { setEditingStepId(a.id); setEditingValue(a.value || ""); }}>
                                          Edit
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" disabled={!a.value || previewPendingId === a.id} onClick={() => previewInput(a)}>
                                          Preview
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className={`h-6 text-[10px] px-1.5 ${a.enabled === false ? 'text-blue-500' : 'text-muted-foreground'}`}
                                          onClick={() =>
                                            setActions(prev =>
                                              prev.map(p =>
                                                p.id === a.id ? { ...p, enabled: !p.enabled } : p
                                              )
                                            )
                                          }
                                        >
                                          {a.enabled === false ? "Enable" : "Disable"}
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {a.type === "wait" && (
                                <div className="mt-3 p-2 bg-amber-500/5 rounded-lg border border-dashed border-amber-500/20">
                                  {editingStepId === a.id ? (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="number"
                                        value={editingValue}
                                        onChange={(e: any) => setEditingValue(e.target.value)}
                                        className="h-8 text-xs bg-background"
                                        placeholder="Duration in milliseconds"
                                        autoFocus
                                        onKeyDown={(e: any) => {
                                          if (e.key === "Enter") {
                                            const duration = parseInt(editingValue, 10);
                                            if (isNaN(duration) || duration < 0) {
                                              toast.error("Please enter a valid wait duration (ms)");
                                              return;
                                            }
                                            setActions((prev) => prev.map((p) => p.id === a.id ? {
                                              ...p,
                                              value: editingValue,
                                              description: `Wait for ${duration}ms`
                                            } : p));
                                            setEditingStepId(null);
                                            toast.success("Wait duration updated");
                                          }
                                          if (e.key === "Escape") setEditingStepId(null);
                                        }}
                                      />
                                      <Button size="sm" className="h-8 px-2 text-xs" onClick={() => {
                                        const duration = parseInt(editingValue, 10);
                                        if (isNaN(duration) || duration < 0) {
                                          toast.error("Please enter a valid wait duration (ms)");
                                          return;
                                        }
                                        // FIX: Add step directly to local state instead of relying on fetch
                                        const waitStep: RecordedAction = {
                                          id: crypto.randomUUID(),
                                          type: "wait",
                                          description: "Wait",
                                          value: "3000",
                                          locator: "system",
                                          timestamp: Date.now(),
                                          enabled: true
                                        };
                                        setActions((prev) => prev.map((p) => p.id === a.id ? {
                                          ...p,
                                          value: editingValue,
                                          description: `Wait for ${duration}ms`
                                        } : p));
                                        setEditingStepId(null);
                                        toast.success("Wait duration updated");
                                      }}>Save</Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-xs font-mono text-muted-foreground truncate">
                                        {a.value ? (
                                          <span>
                                            Duration: <span className="text-amber-700 dark:text-amber-400 font-bold">{a.value}ms</span>
                                            {' '}(<span className="text-xs opacity-70">{(parseInt(a.value, 10) / 1000).toFixed(1)}s</span>)
                                          </span>
                                        ) : (
                                          <em>(no duration set)</em>
                                        )}
                                      </div>
                                      <div className="flex gap-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 text-[10px] px-1.5"
                                          onClick={() => {
                                            setEditingStepId(a.id);
                                            setEditingValue(a.value || "2000");
                                          }}
                                        >
                                          Edit Duration
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className={`h-6 text-[10px] px-1.5 ${a.enabled === false ? 'text-blue-500' : 'text-muted-foreground'}`}
                                          onClick={() =>
                                            setActions(prev =>
                                              prev.map(p =>
                                                p.id === a.id ? { ...p, enabled: !p.enabled } : p
                                              )
                                            )
                                          }
                                        >
                                          {a.enabled === false ? "Enable" : "Disable"}
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
                </Card>

                <Card className="bg-card/40 border-border/60 shadow-sm h-fit">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Wand2 className="h-4 w-4 text-primary" />
                        AI Suggestions
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowAISuggestions((prev) => !prev)}
                      >
                        {showAISuggestions ? "Hide" : "Show"}
                      </Button>
                    </div>
                    <CardDescription>
                      Optional and non-destructive. Suggestions never auto-apply.
                    </CardDescription>
                  </CardHeader>
                  {showAISuggestions && (
                    <CardContent className="space-y-3">
                      {lowScoreLocatorInsights.length > 0 && (
                        <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-2 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                                Critical Locator Scores (&lt;=10)
                              </p>
                            <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-700 dark:text-red-300">
                              {lowScoreLocatorInsights.length} step(s)
                            </Badge>
                          </div>
                          {lowScoreLocatorInsights.slice(0, 3).map((insight) => (
                            <div key={`${insight.stepIndex}-${insight.score}`} className="rounded-md border border-red-500/25 bg-background/70 p-2">
                              <p className="text-[11px] font-semibold">{insight.title}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">{insight.issue}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">Fix: {insight.resolution}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {lastAIChange && (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2">
                          <p className="text-xs font-medium">Last AI change: {lastAIChange.title}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 h-7 text-xs"
                            onClick={undoLastAIChange}
                          >
                            Undo
                          </Button>
                        </div>
                      )}

                      {aiSuggestions.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                          No active suggestions right now. Continue recording or replay to get insights.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {aiSuggestions.slice(0, 8).map((suggestion) => (
                            <div key={suggestion.id} className="rounded-lg border p-2 bg-background/50">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Badge variant="outline" className="text-[10px]">AI Suggested</Badge>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] capitalize ${suggestion.severity === "high"
                                    ? "border-red-500/40 text-red-600"
                                    : suggestion.severity === "medium"
                                      ? "border-amber-500/40 text-amber-600"
                                      : "border-slate-400/50 text-slate-600"
                                    }`}
                                >
                                  {suggestion.severity}
                                </Badge>
                              </div>
                              <p className="text-xs font-semibold">{suggestion.title}</p>
                              <p className="text-[11px] text-muted-foreground mt-1">{suggestion.detail}</p>
                              <p className="text-[10px] mt-1 text-muted-foreground">
                                Why: {suggestion.reason} | Confidence: {Math.round(suggestion.confidence * 100)}%
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => applyAISuggestion(suggestion)}
                                >
                                  Apply
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => dismissAISuggestion(suggestion.id)}
                                >
                                  Ignore
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold">Test Reuse & Organization</p>
                          <Badge variant="outline" className="text-[10px]">AI Suggested</Badge>
                        </div>
                        <p className="text-[11px]">
                          Suggested name: <span className="font-semibold">{scenarioOrganizationSuggestion.suggestedName}</span>
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {scenarioOrganizationSuggestion.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {scenarioOrganizationSuggestion.suiteRecommendations.join(" | ")}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setSaveScenarioName(scenarioOrganizationSuggestion.suggestedName);
                              setIsSaveDialogOpen(true);
                            }}
                          >
                            Use Name
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => copyText(scenarioOrganizationSuggestion.tags.join(", "), "Suggested tags copied")}
                          >
                            Copy Tags
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="script" className="mt-0 outline-none">
              <Card className="bg-gradient-to-br from-card/90 via-card/75 to-card/90 backdrop-blur-md shadow-card hover:shadow-elegant rounded-xl overflow-hidden transition-all duration-300 border-border/70">
                <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Terminal className="h-5 w-5 text-primary" />
                      Generated Script
                    </CardTitle>
                    {!generatedScript && (
                      <p className="text-sm text-muted-foreground mt-1">Script will appear after recording</p>
                    )}
                  </div>
                  {generatedScript && (
                    <div className="flex gap-2">
                      {!isEditingScript ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => setShowScriptExplanation((prev) => !prev)}
                          >
                            <Wand2 className="h-3.5 w-3.5 mr-1" />
                            {showScriptExplanation ? "Hide Explanation" : "Explain Script"}
                          </Button>
                          <Button variant="outline" size="sm" className="h-8" onClick={startEditingScript}>Edit</Button>
                          <Button variant="ghost" size="sm" className="h-8" onClick={copyScript}><Copy className="h-3.5 w-3.5 mr-1" />Copy</Button>
                          <Button variant="ghost" size="sm" className="h-8" onClick={downloadScript}><Download className="h-3.5 w-3.5 mr-1" />Download</Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="default" className="h-8" onClick={handleSaveScript}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setIsEditingScript(false)}>Cancel</Button>
                        </>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {generatedScript && showScriptExplanation && (
                    <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <Badge variant="outline" className="text-[10px]">AI Suggested</Badge>
                        Script Understanding
                      </div>
                      <p className="text-xs">{scriptExplanation.summary}</p>
                      {scriptExplanation.riskySteps.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold text-amber-600">Risky Steps</p>
                          {scriptExplanation.riskySteps.slice(0, 4).map((risk) => (
                            <p key={`${risk.stepIndex}-${risk.reason}`} className="text-[11px] text-muted-foreground">
                              Step {risk.stepIndex + 1}: {risk.reason}
                            </p>
                          ))}
                        </div>
                      )}
                      {scriptExplanation.waitRecommendations.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold text-primary">Wait & Flakiness Guidance</p>
                          {scriptExplanation.waitRecommendations.map((advice) => (
                            <p key={advice} className="text-[11px] text-muted-foreground">{advice}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {generatedScript ? (
                    <ScrollArea className="h-[450px]">
                      <div className="mb-2 rounded-t-xl border border-border/50 bg-zinc-900/90 px-3 py-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Automation IDE</span>
                      </div>
                      {isEditingScript ? (
                        <textarea
                          value={editableScript}
                          onChange={(e) => setEditableScript(e.target.value)}
                          className="w-full h-full min-h-[400px] bg-zinc-950/95 text-zinc-200 p-4 rounded-b-xl rounded-t-none text-xs font-mono border border-zinc-800 focus:ring-1 focus:ring-emerald-400/50 overflow-y-auto shadow-inner"
                          spellCheck={false}
                        />
                      ) : (
                        <pre className="bg-gradient-to-br from-[#0b1220] via-[#0d1426] to-[#090c18] text-slate-100 p-4 rounded-b-xl rounded-t-none text-xs overflow-x-auto font-mono border border-zinc-800 shadow-inner leading-relaxed whitespace-pre-wrap">
                          <code
                            className="block"
                            dangerouslySetInnerHTML={{ __html: syntaxHighlightScript(generatedScriptCache || generatedScript || "") }}
                          />
                        </pre>
                      )}
                    </ScrollArea>
                  ) : (
                    <div className="h-[450px] flex items-center justify-center border border-dashed rounded-xl bg-muted/5 border-muted/20">
                      <p className="text-sm text-muted-foreground">Start recording to see the automated script</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-0 outline-none">
              <Card className="bg-gradient-to-br from-card/90 via-card/75 to-card/90 backdrop-blur-md shadow-card hover:shadow-elegant rounded-xl overflow-hidden transition-all duration-300 border border-border/70">
                <CardHeader className="flex flex-row items-center justify-between border-b border-muted/10 pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20 shadow-inner">
                      <ListChecks className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Execution Log</CardTitle>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Instant Feedback</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {lastReplayStatus && !replaying && (
                      <Badge
                        variant={lastReplayStatus === "PASS" ? "default" : "destructive"}
                        className={`h-7 px-3 text-xs font-bold shadow-sm ${lastReplayStatus === "PASS"
                          ? "bg-green-500 hover:bg-green-600 text-white border-none"
                          : "bg-red-500 hover:bg-red-600 text-white border-none"
                          }`}
                      >
                        {lastReplayStatus === "PASS" ? "PASSED" : "FAILED"}
                      </Badge>
                    )}

	                    {replaying && (
	                      <div className="flex items-center gap-2">
	                        <Badge variant="secondary" className="animate-pulse bg-primary/10 text-primary border-primary/20">
	                          <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
	                          Running Replay
	                        </Badge>
	                        <Button
	                          variant="destructive"
	                          size="sm"
	                          className="h-8 text-xs font-bold shadow-md hover:shadow-lg transition-all"
	                          onClick={stopReplay}
	                        >
	                          <Square className="h-3.5 w-3.5 mr-1.5" />
	                          Stop
	                        </Button>
	                      </div>
	                    )}
                    {!replaying && executionLogs.length > 0 && (
                      <div className="flex items-center gap-2">
                        {lastReplayStatus === "FAIL" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const failedIndex = executionLogs.findIndex(log => log.status === "error");
                              if (failedIndex !== -1) {
                                replayActions(failedIndex);
                              } else {
                                toast.error("Could not find failed step to resume from");
                              }
                            }}
                            className="h-8 text-xs font-bold shadow-md hover:shadow-lg transition-all bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 hover:border-amber-500/30 border"
                          >
                            <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
                            Resume Replay
                          </Button>
                        )}

                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            replayActions(0);
                          }}
                          className="h-8 text-xs font-bold shadow-md hover:shadow-lg transition-all"
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                          Restart Replay
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {executionLogs.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-xl border-muted/10">
                      <History className="h-12 w-12 mx-auto mb-4 opacity-10" />
                      <p className="text-sm font-medium">No execution history for this session yet.</p>
                      <p className="text-xs mt-1 text-muted-foreground/60">Start a replay or step-replay to see real-time updates.</p>
                    </div>
                  ) : (
                    <>
                      {lastReplayStatus === "FAIL" && executionLogs.some(log => log.status === "error") && (
                        <div className="mb-4 p-4 bg-gradient-to-r from-red-500/10 via-red-500/5 to-card border border-destructive/30 rounded-xl shadow-card animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-destructive/15 rounded-full shadow-inner border border-destructive/30">
                              <AlertCircle className="h-5 w-5 text-destructive" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-bold text-sm text-destructive mb-1">
                                Replay Failed
                              </h4>
                              <p className="text-xs text-destructive/80">
                                {(() => {
                                  const failedIndex = executionLogs.findIndex(log => log.status === "error");
                                  const failedLog = executionLogs[failedIndex];
                                  return `Test stopped at Step ${failedIndex + 1}: "${failedLog?.description || 'Unknown step'}"`;
                                })()}
                              </p>
                              {executionLogs.find(log => log.status === "error")?.error && (
                                <p className="text-xs mt-2 font-medium text-destructive">
                                  <span className="opacity-70">Reason:</span> {executionLogs.find(log => log.status === "error")?.error}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                const failedIndex = executionLogs.findIndex(log => log.status === "error");
                                const element = document.querySelector(`[data-step-index="${failedIndex}"]`);
                                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                            >
                              Jump to Failed Step
                            </Button>
                          </div>
                        </div>
                      )}

                      <ScrollArea className="h-[480px] pr-4">
                        <div className="space-y-3">
	                          {executionLogs.map((log, i) => (
                            <div
                              key={`${log.id}-${i}`}
                              data-step-index={i}
                              className={`group relative overflow-hidden p-4 border rounded-xl transition-all duration-300 shadow-sm ${
                                log.status === "error"
                                  ? "bg-gradient-to-r from-red-500/12 via-red-500/6 to-card border-red-500/30 shadow-lg"
                                  : log.status === "running"
                                    ? "bg-gradient-to-r from-primary/12 via-primary/6 to-card border-primary/35 ring-1 ring-primary/12 shadow-lg translate-x-[1px]"
                                  : log.status === "success"
                                      ? "bg-gradient-to-r from-emerald-500/12 via-emerald-500/6 to-card border-emerald-500/25 shadow-md"
                                      : "bg-card/70 border-border/60 hover:border-border opacity-90 hover:opacity-100"
                              }`}
                            >
                              {log.status === "running" && (
                                <div className="absolute top-0 left-0 w-1 h-full bg-primary animate-pulse" />
                              )}
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    {log.status === "pending" && <Clock className="h-4 w-4 text-muted-foreground/30" />}
                                    {log.status === "running" && <RefreshCw className="h-4 w-4 text-primary animate-spin" />}
                                    {log.status === "success" && <CheckCircle className="h-4 w-4 text-green-500" />}
                                    {log.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-[10px] font-mono font-bold text-muted-foreground/50">STEP {i + 1}</span>
                                      {log.duration && (
                                        <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono border-muted/30">
                                          {log.duration}ms
                                        </Badge>
                                      )}
                                    </div>
                                    <p className={`font-semibold text-sm leading-snug ${log.status === "error" ? "text-destructive" : "text-zinc-800 dark:text-zinc-200"}`}>
                                      {log.description}
                                    </p>
                                  </div>
                                </div>
                              </div>

	                              {log.status === "error" && log.error && (
	                                <div className="mt-3 p-3 bg-destructive/10 rounded-lg text-xs text-destructive border border-destructive/20 animate-in fade-in slide-in-from-top-2 duration-300">
                                  <div className="flex items-center gap-2 mb-1">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    <span className="font-bold uppercase tracking-tight text-[10px]">Failure Reason</span>
                                  </div>
	                                  <p className="leading-relaxed font-medium opacity-90">{log.error}</p>
	                                  <div className="mt-3 flex flex-wrap gap-2">
	                                    <Button
	                                      variant="outline"
	                                      size="sm"
	                                      className="h-7 text-xs"
	                                      disabled={replaying}
	                                      onClick={() => {
	                                        const enabledActions = actions.filter(a => a.enabled !== false);
	                                        const a = enabledActions[i];
	                                        if (!a) return toast.error("Step not found");
	                                        replaySingleAction(a);
	                                      }}
	                                    >
	                                      <Play className="h-3.5 w-3.5 mr-1.5" />
	                                      Re-run Step
	                                    </Button>
	                                    <Button
	                                      variant="secondary"
	                                      size="sm"
	                                      className="h-7 text-xs"
	                                      disabled={replaying}
	                                      onClick={() => replayActions(i)}
	                                    >
	                                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
	                                      Continue From Here
	                                    </Button>
	                                    <Button
	                                      variant="outline"
	                                      size="sm"
	                                      className="h-7 text-xs"
	                                      onClick={() => {
	                                        setActiveTab("actions");
	                                        setTimeout(() => {
	                                          const element = document.querySelector(`[data-action-index="${i}"]`);
	                                          element?.scrollIntoView({ behavior: "smooth", block: "center" });
	                                        }, 50);
	                                      }}
	                                    >
	                                      <Edit className="h-3.5 w-3.5 mr-1.5" />
	                                      Edit Step
	                                    </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() =>
                                          setExpandedFailureInsightIndex((prev) => (prev === i ? null : i))
                                        }
                                      >
                                        <HelpCircle className="h-3.5 w-3.5 mr-1.5" />
                                        Why did this fail?
                                      </Button>
	                                  </div>
                                    {expandedFailureInsightIndex === i && (
                                      <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-2 text-foreground">
                                        {(() => {
                                          const analysis = explainReplayFailure(
                                            log.error || "",
                                            enabledReplayActions[i] || null
                                          );
                                          return (
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px]">AI Suggested</Badge>
                                                <span className="text-xs font-semibold">{analysis.title}</span>
                                              </div>
                                              <p className="text-xs text-muted-foreground">{analysis.explanation}</p>
                                              {analysis.suggestedFixes.slice(0, 3).map((fix) => (
                                                <p key={fix} className="text-[11px] text-muted-foreground">
                                                  - {fix}
                                                </p>
                                              ))}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}
	                                </div>
	                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
            {showAskAI && (
              <Card className="w-[340px] max-w-[92vw] border-primary/20 shadow-xl bg-background/95 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-primary" />
                      Ask AI
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setShowAskAI(false)}
                    >
                      Close
                    </Button>
                  </div>
                  <CardDescription className="text-xs">
                    Help-style guidance only. No auto changes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="rounded-md border border-border/60 bg-muted/10 p-2">
                    <p className="text-[11px] font-semibold mb-1">Phase 3: Context Coach</p>
                    {coachHints.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No blockers detected right now.</p>
                    ) : (
                      <div className="space-y-1">
                        {coachHints.slice(0, 3).map((hint) => (
                          <p key={hint.id} className="text-[11px] text-muted-foreground">
                            - {hint.title}: {hint.detail}
                          </p>
                        ))}
                      </div>
                    )}
                    {!hasAssertionStep && actions.length > 0 && (
                      <Button
                        size="sm"
                        className="mt-2 h-7 text-[10px]"
                        onClick={addOutcomeAssertionStep}
                      >
                        Add Outcome Assertion
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {[
                      "Why is recording not capturing?",
                      "Why did replay fail?",
                      "What does this button do?",
                    ].map((q) => (
                      <Button
                        key={q}
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => askAI(q)}
                      >
                        {q}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={askAIQuestion}
                      onChange={(e) => setAskAIQuestion(e.target.value)}
                      placeholder="Ask about recording, replay, or script..."
                      className="h-8 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") askAI(askAIQuestion);
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => askAI(askAIQuestion)}
                    >
                      Ask
                    </Button>
                  </div>
                  {askAIAnswer && (
                    <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs whitespace-pre-line space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          AI Guidance
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            disabled={askAIFeedbackSubmitted}
                            onClick={() => void submitAIFeedback("helpful")}
                          >
                            Helpful
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            disabled={askAIFeedbackSubmitted}
                            onClick={() => void submitAIFeedback("not_helpful")}
                          >
                            Not helpful
                          </Button>
                        </div>
                      </div>
                      <div>{askAIAnswer}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Button
              onClick={() => setShowAskAI((prev) => !prev)}
              className="h-10 px-4 text-xs font-semibold shadow-lg"
            >
              <HelpCircle className="h-4 w-4 mr-1.5" />
              Ask AI
            </Button>
          </div>
        </div>
        <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Scenario</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Scenario Name</label>
                  <Input
                    value={saveScenarioName}
                    onChange={(e) => setSaveScenarioName(e.target.value)}
                    placeholder="e.g. Login Flow v1"
                  />
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">AI Suggested</span>
                    <Badge variant="outline" className="text-[10px]">Optional</Badge>
                  </div>
                  <div className="text-xs">
                    Name hint: <span className="font-semibold">{scenarioOrganizationSuggestion.suggestedName}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {scenarioOrganizationSuggestion.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                    ))}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Suite hint: {scenarioOrganizationSuggestion.suiteRecommendations.join(" | ")}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setSaveScenarioName(scenarioOrganizationSuggestion.suggestedName)}
                    >
                      Use Name
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        copyText(
                          scenarioOrganizationSuggestion.tags.join(", "),
                          "Scenario tags copied"
                        )
                      }
                    >
                      Copy Tags
                    </Button>
                  </div>
                </div>

                {currentScenarioId && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2 bg-muted p-2 rounded">
                    <Info className="h-4 w-4" />
                    <span>Saving will update the existing scenario "<strong>{currentScenarioName}</strong>".</span>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              {currentScenarioId && (
                <Button variant="secondary" onClick={() => {
                  setCurrentScenarioId(null);
                  handleSaveScenario();
                }}>
                  Save as New
                </Button>
              )}
              <Button onClick={handleSaveScenario}>
                <Save className="h-4 w-4 mr-2" />
                {currentScenarioId ? "Update" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={isLoadDialogOpen} onOpenChange={setIsLoadDialogOpen}>
          <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Load Scenario</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto py-2">
              {loadingScenarios ? (
                <div className="flex justify-center p-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : scenarios.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p>No saved scenarios found.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scenarios.map(sc => (
                    <div key={sc.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer group" onClick={() => loadScenario(sc)}>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate">{sc.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(sc.updated_at || sc.created_at || "").toLocaleDateString()} • {Array.isArray(sc.steps) ? sc.steps.length : 0} steps
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => deleteScenario(sc.id, e)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".apk"
          className="hidden"
        />
      </div >
    </div >
  );
}

function FileIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  )
}
