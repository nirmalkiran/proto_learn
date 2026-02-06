import deviceController from "../controllers/device-controller.js";
import { getUIHierarchy, adbCommand } from "../utils/adb-utils.js";
import {
  parseHierarchyNodesFast,
  pickBestNodeAtPoint,
  toElementMetadataFromAttrs,
  computeElementFingerprint,
  scoreLocatorCandidates,
  countMatches,
} from "../utils/ui-hierarchy-fast.js";
import { buildSmartXPathCandidates } from "./smart-xpath-builder.js";
import { HierarchySnapshotStore } from "./hierarchy-snapshot-store.js";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function parseXPathCriteria(xpath) {
  const s = String(xpath || "");
  const criteria = { eq: {}, contains: {} };
  const eqRegex = /@([a-zA-Z-]+)\s*=\s*(concat\([^)]+\)|"[^"]*"|'[^']*')/g;
  let m;
  while ((m = eqRegex.exec(s)) !== null) {
    criteria.eq[m[1]] = decodeXpathLiteral(m[2]);
  }
  const containsRegex = /contains\(\s*@([a-zA-Z-]+)\s*,\s*(concat\([^)]+\)|"[^"]*"|'[^']*')\s*\)/g;
  while ((m = containsRegex.exec(s)) !== null) {
    criteria.contains[m[1]] = decodeXpathLiteral(m[2]);
  }
  return criteria;
}

function decodeXpathLiteral(raw) {
  const value = String(raw || "").trim();
  if (value.startsWith("concat(") && value.endsWith(")")) {
    const inner = value.slice(7, -1);
    const parts = inner.match(/'[^']*'|"[^"]*"/g) || [];
    return parts.map(p => p.slice(1, -1)).join("");
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function matchesCriteria(attrs, criteria) {
  if (!attrs || !criteria) return false;
  for (const [k, v] of Object.entries(criteria.eq || {})) {
    if (String(attrs[k] || "") !== String(v || "")) return false;
  }
  for (const [k, v] of Object.entries(criteria.contains || {})) {
    if (!String(attrs[k] || "").includes(String(v || ""))) return false;
  }
  return true;
}

function findMatchingNodesByXPath(nodes, xpath) {
  const criteria = parseXPathCriteria(xpath);
  const matches = [];
  for (const n of nodes) {
    if (matchesCriteria(n.attrs, criteria)) matches.push(n);
  }
  return matches;
}

function estimateXPathMatches(nodes, xpath) {
  const criteria = parseXPathCriteria(xpath);
  let count = 0;
  for (const n of nodes) {
    if (matchesCriteria(n.attrs, criteria)) count++;
  }
  return count;
}

async function getFocusedScreenContext(deviceId) {
  const enabled = process.env.WISPR_INSPECTOR_CONTEXT === "1";
  if (!enabled) return { ts: Date.now() };

  try {
    // Use dumpsys window to find current focus/app (best-effort; varies by Android versions)
    const { stdout } = await adbCommand(["shell", "dumpsys", "window", "windows"], { deviceId, timeout: 2000 });
    const focusLine =
      stdout.split("\n").find(l => l.includes("mCurrentFocus")) ||
      stdout.split("\n").find(l => l.includes("mFocusedApp")) ||
      "";
    const pkgMatch = focusLine.match(/([a-zA-Z0-9_\\.]+)\/[a-zA-Z0-9_\\.\\$]+/);
    const activityMatch = focusLine.match(/([a-zA-Z0-9_\\.]+\/[a-zA-Z0-9_\\.\\$]+)/);
    return {
      package: pkgMatch ? pkgMatch[1] : "",
      activity: activityMatch ? activityMatch[1] : "",
      window: focusLine.trim(),
      ts: Date.now()
    };
  } catch {
    return { ts: Date.now() };
  }
}

export class InspectorService {
  constructor(opts = {}) {
    this.cacheTtlMs = Number.isFinite(opts.cacheTtlMs)
      ? opts.cacheTtlMs
      : (parseInt(process.env.WISPR_INSPECTOR_CACHE_TTL_MS || "1500", 10) || 1500);
    this.throttleMs = Number.isFinite(opts.throttleMs)
      ? opts.throttleMs
      : (parseInt(process.env.WISPR_INSPECTOR_THROTTLE_MS || "80", 10) || 80);

    this.snapshotStore = opts.snapshotStore || new HierarchySnapshotStore({});
    this._xmlCache = new Map(); // deviceId -> { xml, snapshotId, ts }
    this._throttle = new Map(); // deviceId -> { ts, promise }
  }

  async _resolveDeviceId(deviceId) {
    // Reuse existing device resolution logic to stay aligned with other endpoints.
    return await deviceController._resolveTargetDeviceId(deviceId);
  }

  _getCachedXml(deviceId) {
    const item = this._xmlCache.get(deviceId);
    if (!item) return null;
    if (Date.now() - item.ts > this.cacheTtlMs) return null;
    return item;
  }

  _setCachedXml(deviceId, xml, snapshotId = null) {
    this._xmlCache.set(deviceId, { xml, snapshotId, ts: Date.now() });
  }

  async _getXml(deviceId, preferCache) {
    if (preferCache) {
      const cached = this._getCachedXml(deviceId);
      if (cached?.xml) return { xml: cached.xml, fromCache: true, snapshotId: cached.snapshotId || null };
    }

    const xml = await getUIHierarchy(deviceId);
    if (xml && typeof xml === "string" && xml.includes("<hierarchy")) {
      const { snapshotId } = this.snapshotStore.saveSnapshotXml(xml, { deviceId });
      this._setCachedXml(deviceId, xml, snapshotId || null);
      return { xml, fromCache: false, snapshotId: snapshotId || null };
    }

    // fallback to last cached good xml (even if stale) when hierarchy fails
    const cachedAny = this._xmlCache.get(deviceId);
    if (cachedAny?.xml) return { xml: cachedAny.xml, fromCache: true, snapshotId: cachedAny.snapshotId || null };

    return { xml: null, fromCache: false, snapshotId: null };
  }

  async inspectAtPoint(params) {
    const x = safeNum(params?.x);
    const y = safeNum(params?.y);
    if (x == null || y == null) throw new Error("Coordinates required");

    const deviceId = await this._resolveDeviceId(params?.deviceId);
    const mode = params?.mode === "tap" ? "tap" : "hover";
    const preferCache = Boolean(params?.preferCache) || mode === "hover";
    const preferXPath = Boolean(params?.preferXPath) || mode === "hover";

    // Throttle hover traffic per-device (tap is never throttled)
    if (mode === "hover") {
      const last = this._throttle.get(deviceId);
      if (last && Date.now() - last.ts < this.throttleMs && last.promise) {
        return await last.promise;
      }
    }

    const work = (async () => {
      const { xml, fromCache, snapshotId } = await this._getXml(deviceId, preferCache);
      if (!xml) {
        return {
          x, y, deviceId,
          element: null,
          locators: [],
          best: null,
          reliabilityScore: 0,
          hierarchySnapshotId: null,
          screenContext: { ts: Date.now() },
          fromCache,
        };
      }

      const nodes = parseHierarchyNodesFast(xml);
      const nodeAtPoint = pickBestNodeAtPoint(nodes, x, y, { tolerance: 8, radius: 28 });
      let element = nodeAtPoint ? toElementMetadataFromAttrs(nodeAtPoint.attrs) : null;
      let resolvedBy = "coordinates";

      const buildXpathLocators = (meta) => {
        const xpathCandidates = buildSmartXPathCandidates(meta);
        return xpathCandidates.map(c => {
          const matchCount = nodes.length ? estimateXPathMatches(nodes, c.value) : 0;
          let score = c.score;
          if (matchCount === 1) score += 10;
          else if (matchCount >= 5) score -= 10;
          return {
            strategy: "xpath",
            value: c.value,
            score: clamp(score, 0, 100),
            source: "inspector",
            reason: c.reason,
            matchCount
          };
        });
      };

      let xpathLocators = buildXpathLocators(element);
      if (preferXPath && xpathLocators.length) {
        const unique = xpathLocators.find(l => l.matchCount === 1);
        if (unique?.value) {
          const matches = findMatchingNodesByXPath(nodes, unique.value);
          if (matches.length === 1) {
            element = toElementMetadataFromAttrs(matches[0].attrs);
            resolvedBy = "xpath";
          }
        }
      }

      if (resolvedBy === "xpath") {
        // Recompute XPath candidates based on resolved element
        xpathLocators = buildXpathLocators(element);
      }

      const elementFingerprint = element ? computeElementFingerprint(element) : "";

      // Build candidate locators
      const baseLocators = scoreLocatorCandidates({ meta: element, nodes });

      // Merge locators (de-dupe by strategy+value)
      const merged = [];
      const seen = new Set();
      for (const c of [...baseLocators, ...xpathLocators]) {
        const key = `${c.strategy}:${c.value}`;
        if (!c.value || seen.has(key)) continue;
        seen.add(key);
        merged.push(c);
      }
      merged.sort((a, b) => (b.score || 0) - (a.score || 0));

      const best = merged[0] || null;
      const reliabilityScore = clamp(Math.round((best?.score || 0) * 0.9 + (element ? 10 : 0)), 0, 100);
      const screenContext = await getFocusedScreenContext(deviceId);

      const locatorBundle = best ? {
        version: 1,
        fingerprint: elementFingerprint,
        primary: best,
        fallbacks: merged.slice(1, 5),
      } : null;

      const smartXPath = merged.find(l => l.strategy === "xpath")?.value || "";

      return {
        x, y, deviceId,
        element,
        elementFingerprint,
        locatorBundle,
        locators: merged,
        best,
        reliabilityScore,
        smartXPath,
        resolvedBy,
        hierarchySnapshotId: snapshotId || null,
        screenContext,
        fromCache,
        nodeCount: nodes.length
      };
    })();

    if (mode === "hover") {
      this._throttle.set(deviceId, { ts: Date.now(), promise: work });
    }

    return await work;
  }
}

export default new InspectorService();
