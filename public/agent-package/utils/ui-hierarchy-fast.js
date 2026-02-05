import crypto from "crypto";

function safeString(v) {
  return (v == null) ? "" : String(v);
}

export function parseBounds(boundsStr) {
  const s = safeString(boundsStr);
  const m = s.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!m) return null;
  const x1 = Number(m[1]), y1 = Number(m[2]), x2 = Number(m[3]), y2 = Number(m[4]);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return {
    x1, y1, x2, y2,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
    area: Math.max(0, (x2 - x1) * (y2 - y1)),
    cx: Math.floor((x1 + x2) / 2),
    cy: Math.floor((y1 + y2) / 2)
  };
}

export function parseNodeAttributesFromTag(tag) {
  const attrs = {};
  const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(tag)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

export function parseHierarchyNodesFast(xml) {
  const nodes = [];
  if (!xml || typeof xml !== "string") return nodes;

  const tagRegex = /<\/?node\b[^>]*>/g;
  const stack = [];
  let match;
  while ((match = tagRegex.exec(xml)) !== null) {
    const tag = match[0];
    const isClose = tag.startsWith("</");
    if (isClose) {
      stack.pop();
      continue;
    }

    const attrs = parseNodeAttributesFromTag(tag);
    const bounds = parseBounds(attrs.bounds);
    const depth = stack.length;
    const parentIndex = stack.length ? stack[stack.length - 1] : -1;

    const node = {
      index: nodes.length,
      parentIndex,
      depth,
      attrs,
      bounds,
    };
    nodes.push(node);

    const selfClosing = tag.endsWith("/>");
    if (!selfClosing) {
      stack.push(node.index);
    }
  }

  return nodes;
}

function boolAttr(attrs, key) {
  return safeString(attrs?.[key]) === "true";
}

function qualityScore(attrs) {
  const resourceId = safeString(attrs?.["resource-id"]);
  const contentDesc = safeString(attrs?.["content-desc"]);
  const text = safeString(attrs?.text);
  let score = 0;
  if (resourceId) score += 25;
  if (contentDesc) score += 20;
  if (text) score += 10;
  return score;
}

export function pickBestNodeAtPoint(nodes, x, y, opts = {}) {
  const tolerance = Number.isFinite(opts.tolerance) ? opts.tolerance : 6;
  let best = null;
  let bestScore = -Infinity;

  for (const n of nodes) {
    if (!n.bounds) continue;
    const b = n.bounds;
    const inBounds =
      x >= (b.x1 - tolerance) &&
      x <= (b.x2 + tolerance) &&
      y >= (b.y1 - tolerance) &&
      y <= (b.y2 + tolerance);
    if (!inBounds) continue;

    const attrs = n.attrs || {};
    const visible = boolAttr(attrs, "visible-to-user") || boolAttr(attrs, "visibleToUser");
    const interactive = boolAttr(attrs, "clickable") || boolAttr(attrs, "focusable") || boolAttr(attrs, "editable");
    const editable = boolAttr(attrs, "editable");

    let score = 0;
    if (visible) score += 20;
    if (interactive) score += 30;
    if (editable) score += 10;
    score += qualityScore(attrs);
    score += Math.min(n.depth, 10) * 2;

    // Prefer smaller elements (but don't over-penalize)
    score -= Math.min((b.area || 0) / 10000, 30);

    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  }

  if (best) return best;

  // Fallback: nearest within radius
  const radius = Number.isFinite(opts.radius) ? opts.radius : 28;
  for (const n of nodes) {
    if (!n.bounds) continue;
    const b = n.bounds;
    const dx = x < b.x1 ? (b.x1 - x) : (x > b.x2 ? (x - b.x2) : 0);
    const dy = y < b.y1 ? (b.y1 - y) : (y > b.y2 ? (y - b.y2) : 0);
    const dist = Math.hypot(dx, dy);
    if (dist > radius) continue;

    const attrs = n.attrs || {};
    const visible = boolAttr(attrs, "visible-to-user") || boolAttr(attrs, "visibleToUser");
    const interactive = boolAttr(attrs, "clickable") || boolAttr(attrs, "focusable") || boolAttr(attrs, "editable");

    let score = 0;
    if (visible) score += 10;
    if (interactive) score += 15;
    score += qualityScore(attrs);
    score -= dist; // closer is better
    score += Math.min(n.depth, 10);

    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  }

  return best;
}

export function toElementMetadataFromAttrs(attrs = {}) {
  return {
    resourceId: safeString(attrs["resource-id"] || attrs.resourceId),
    text: safeString(attrs.text),
    class: safeString(attrs.class),
    contentDesc: safeString(attrs["content-desc"] || attrs.contentDesc),
    bounds: safeString(attrs.bounds),
    clickable: safeString(attrs.clickable),
    enabled: safeString(attrs.enabled),
    focusable: safeString(attrs.focusable),
    focused: safeString(attrs.focused),
    editable: safeString(attrs.editable),
    scrollable: safeString(attrs.scrollable),
    visibleToUser: safeString(attrs["visible-to-user"] || attrs.visibleToUser),
    package: safeString(attrs.package),
  };
}

export function normalizeText(text) {
  const s = safeString(text).trim();
  return s.replace(/\s+/g, " ");
}

export function computeBoundsBucket(bounds) {
  if (!bounds) return "";
  // 50px grid buckets (device-independent enough for healing without needing screen size)
  const bx = Math.round(bounds.cx / 50) * 50;
  const by = Math.round(bounds.cy / 50) * 50;
  return `${bx},${by}`;
}

export function computeElementFingerprint(meta) {
  const cls = safeString(meta?.class);
  const rid = safeString(meta?.resourceId);
  const cd = safeString(meta?.contentDesc);
  const txt = normalizeText(meta?.text);
  const bucket = computeBoundsBucket(parseBounds(meta?.bounds));
  const key = [cls, rid, cd, txt, bucket].join("|");
  return crypto.createHash("sha256").update(key).digest("hex");
}

function looksDynamicText(text) {
  const s = normalizeText(text);
  if (!s) return true;
  const digitCount = (s.match(/\d/g) || []).length;
  if (digitCount / Math.max(1, s.length) > 0.25) return true;
  if (/\b\d{4,}\b/.test(s)) return true;
  return false;
}

export function scoreLocatorCandidates({ meta, nodes }) {
  const candidates = [];
  if (!meta) return candidates;

  const rid = safeString(meta.resourceId);
  const cd = safeString(meta.contentDesc);
  const txt = normalizeText(meta.text);

  if (cd) {
    candidates.push({
      strategy: "accessibilityId",
      value: cd,
      score: 95,
      source: "inspector",
      reason: "content-desc present"
    });
  }
  if (rid) {
    candidates.push({
      strategy: "id",
      value: rid,
      score: 92,
      source: "inspector",
      reason: "resource-id present"
    });
  }
  if (txt) {
    let base = 70;
    if (txt.length < 2) base = 30;
    if (txt.length > 60) base = 55;
    if (looksDynamicText(txt)) base -= 15;
    candidates.push({
      strategy: "text",
      value: txt,
      score: Math.max(10, Math.min(80, base)),
      source: "inspector",
      reason: looksDynamicText(txt) ? "text looks dynamic" : "text present"
    });
  }

  // Uniqueness boosts (best-effort): count matches in hierarchy
  if (Array.isArray(nodes) && nodes.length) {
    for (const c of candidates) {
      const matchCount = countMatches(nodes, c);
      // Favor uniqueness: +10 for unique, small penalty for many matches
      let adj = 0;
      if (matchCount === 1) adj = 10;
      else if (matchCount >= 5) adj = -10;
      else if (matchCount >= 2) adj = -3;
      c.score = Math.max(0, Math.min(100, c.score + adj));
      c.matchCount = matchCount;
    }
  }

  // Sort by score desc
  candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
  return candidates;
}

export function countMatches(nodes, candidate) {
  if (!candidate) return 0;
  const strategy = candidate.strategy;
  const value = safeString(candidate.value);
  if (!value) return 0;

  let count = 0;
  for (const n of nodes) {
    const a = n.attrs || {};
    if (strategy === "id") {
      if (safeString(a["resource-id"]) === value) count++;
    } else if (strategy === "accessibilityId") {
      if (safeString(a["content-desc"]) === value) count++;
    } else if (strategy === "text") {
      if (normalizeText(a.text) === value) count++;
    } else if (strategy === "xpath") {
      // We only generate "simple" xpaths in this system; ignore here.
    }
  }
  return count;
}

