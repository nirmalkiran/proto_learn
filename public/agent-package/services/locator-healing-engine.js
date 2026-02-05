import { normalizeText, parseBounds, computeBoundsBucket } from "../utils/ui-hierarchy-fast.js";

function safeString(v) {
  return (v == null) ? "" : String(v);
}

function levenshtein(a, b) {
  const s = safeString(a);
  const t = safeString(b);
  if (s === t) return 0;
  const n = s.length, m = t.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const dp = new Array(m + 1);
  for (let j = 0; j <= m; j++) dp[j] = j;
  for (let i = 1; i <= n; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= m; j++) {
      const tmp = dp[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + cost
      );
      prev = tmp;
    }
  }
  return dp[m];
}

function similarity(a, b) {
  const s = safeString(a);
  const t = safeString(b);
  if (!s || !t) return 0;
  if (s === t) return 1;
  const dist = levenshtein(s, t);
  return 1 - dist / Math.max(s.length, t.length);
}

function tokenJaccard(a, b) {
  const sa = new Set(normalizeText(a).toLowerCase().split(/\s+/).filter(Boolean));
  const sb = new Set(normalizeText(b).toLowerCase().split(/\s+/).filter(Boolean));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const tok of sa) if (sb.has(tok)) inter++;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

function boundsBucketFromBoundsStr(boundsStr) {
  const b = parseBounds(boundsStr);
  return computeBoundsBucket(b);
}

export class LocatorHealingEngine {
  constructor(opts = {}) {
    this.enabled = opts.enabled ?? (process.env.WISPR_HEALING_ENABLED !== "0");
    this.threshold = Number.isFinite(opts.threshold) ? opts.threshold : (parseInt(process.env.WISPR_HEALING_THRESHOLD || "60", 10) || 60);
  }

  rankBestMatch(target, nodes) {
    if (!this.enabled) return null;
    if (!target || !Array.isArray(nodes) || !nodes.length) return null;

    const targetId = safeString(target.resourceId || target.elementId);
    const targetCd = safeString(target.contentDesc || target.elementContentDesc);
    const targetText = normalizeText(target.text || target.elementText);
    const targetClass = safeString(target.class || target.elementClass);
    const targetBucket = safeString(target.boundsBucket || boundsBucketFromBoundsStr(target.bounds || ""));

    let best = null;
    let bestScore = 0;

    for (const n of nodes) {
      const a = n.attrs || {};
      const rid = safeString(a["resource-id"]);
      const cd = safeString(a["content-desc"]);
      const txt = normalizeText(a.text);
      const cls = safeString(a.class);
      const bucket = boundsBucketFromBoundsStr(a.bounds);

      let score = 0;

      // Priority 1/2: exact then similarity
      if (targetCd && cd) {
        if (cd === targetCd) score += 100;
        else score += Math.floor(similarity(cd, targetCd) * 70);
      }
      if (targetId && rid) {
        if (rid === targetId) score += 95;
        else score += Math.floor(similarity(rid, targetId) * 65);
      }

      // Priority 3: text fuzzy
      if (targetText && txt) {
        const jac = tokenJaccard(txt, targetText);
        const sim = similarity(txt, targetText);
        score += Math.floor(Math.max(jac, sim) * 60);
      }

      // Priority 4: class
      if (targetClass && cls) {
        if (cls === targetClass) score += 20;
        else if (cls.includes(targetClass) || targetClass.includes(cls)) score += 10;
      }

      // Priority 6: bounds region bucket
      if (targetBucket && bucket && targetBucket === bucket) {
        score += 25;
      }

      if (score > bestScore) {
        bestScore = score;
        best = { node: n, score: bestScore };
      }
    }

    if (!best || best.score < this.threshold) return null;
    return best;
  }
}

