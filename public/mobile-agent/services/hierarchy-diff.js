import { parseHierarchyNodesFast, normalizeText, parseBounds, computeBoundsBucket } from "../utils/ui-hierarchy-fast.js";

function safeString(v) {
  return (v == null) ? "" : String(v);
}

function nodeSignature(attrs) {
  const rid = safeString(attrs?.["resource-id"]);
  const cd = safeString(attrs?.["content-desc"]);
  const cls = safeString(attrs?.class);
  const txt = normalizeText(attrs?.text);
  const bucket = computeBoundsBucket(parseBounds(attrs?.bounds));
  return [rid, cd, cls, txt, bucket].join("|");
}

export function diffHierarchies(xmlA, xmlB) {
  const nodesA = parseHierarchyNodesFast(xmlA);
  const nodesB = parseHierarchyNodesFast(xmlB);

  const setA = new Set(nodesA.map(n => nodeSignature(n.attrs)));
  const setB = new Set(nodesB.map(n => nodeSignature(n.attrs)));

  let added = 0, removed = 0;
  for (const s of setB) if (!setA.has(s)) added++;
  for (const s of setA) if (!setB.has(s)) removed++;

  const total = Math.max(1, Math.max(setA.size, setB.size));
  const driftScore = Math.round(
    100 * clamp((removed * 1.2 + added * 0.8) / total, 0, 1)
  );

  const suggestions = [];
  if (driftScore >= 40) {
    suggestions.push("UI drift detected: prefer accessibilityId/resource-id over text");
    suggestions.push("Re-run inspector on affected screens to refresh locator bundles");
  }

  return {
    driftScore,
    changedNodesSummary: {
      fromCount: setA.size,
      toCount: setB.size,
      added,
      removed
    },
    suggestions
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

