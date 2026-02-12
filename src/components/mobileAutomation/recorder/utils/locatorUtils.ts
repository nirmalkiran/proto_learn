import { ActionType, LocatorBundleV1, LocatorCandidate, LocatorStrategy, RecordedAction } from "../../types";

/**
 * Utility: clamp
 * Purpose: Constrains a number within an inclusive range.
 * Important: Used for device preview coordinate mapping.
 */
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * Utility: getContainMetrics
 * Purpose: Calculates contained dimensions and offsets for preserving aspect ratio.
 * Important: Do not alter math semantics or preview click mapping will drift.
 */
export const getContainMetrics = (
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

const LOCATOR_REQUIRED_ACTIONS: ActionType[] = ["tap", "input", "longPress", "assert"];

export const isLocatorRequiredAction = (action: RecordedAction): boolean =>
  LOCATOR_REQUIRED_ACTIONS.includes(action.type);

export const normalizeLocatorStrategy = (strategy?: string): LocatorStrategy | null => {
  if (!strategy) return null;
  const raw = String(strategy).trim();
  if (!raw) return null;
  if (
    raw === "id" ||
    raw === "accessibilityId" ||
    raw === "text" ||
    raw === "xpath" ||
    raw === "coordinates" ||
    raw === "androidUiAutomator"
  ) {
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
    pushUniqueCandidate(
      candidates,
      lb.primary.strategy,
      lb.primary.value,
      lb.primary.score || 90,
      lb.primary.source || "inspector",
      lb.primary.reason
    );
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
  const primary = existingPrimary?.strategy && existingPrimary?.value ? { ...existingPrimary } : { ...candidates[0] };
  const fallbacks = candidates.filter((c) => !(c.strategy === primary.strategy && c.value === primary.value));

  const fingerprint = action.locatorBundle?.fingerprint || action.elementFingerprint || `${action.type}:${action.id}`;
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

export const normalizeActionsForLocatorHealing = (actions: RecordedAction[]): RecordedAction[] =>
  actions.map((action) => ensureActionLocatorBundle(action));

export const isWeakClassOnlyXPath = (locator: string): boolean => {
  const raw = String(locator || "").trim();
  if (!raw.startsWith("//")) return false;
  return /@class\s*=/.test(raw) && !/@resource-id=|@content-desc=|@text=|contains\(@text|contains\(@resource-id|contains\(@content-desc/.test(raw);
};

export const deriveStableLocatorFromAction = (
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

export const inferLocatorStrategy = (locator: string, explicit?: string): LocatorStrategy => {
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
    const attrRegex = /([a-zA-Z0-9_:-]+)="([^"]*)"/g;
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
  const classMatch = raw.match(/^\/\/([a-zA-Z0-9._]+)/);
  if (classMatch) out.className = classMatch[1];

  const eqRegex = /@([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null = null;
  while ((m = eqRegex.exec(raw)) !== null) {
    out.eq[m[1]] = m[2];
  }
  const containsRegex = /contains\(\s*@([a-zA-Z-]+)\s*,\s*"([^"]*)"\s*\)/g;
  while ((m = containsRegex.exec(raw)) !== null) {
    out.contains[m[1]] = m[2];
  }
  return out;
};

export const findCenterFromLocatorInUiXml = (
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
      if (String(n[k] || "") !== String(v || "")) return false;
    }
    for (const [k, v] of Object.entries(f.contains)) {
      if (!String(n[k] || "").includes(String(v || ""))) return false;
    }
    return true;
  });
};
