import { normalizeText } from "../utils/ui-hierarchy-fast.js";

function safeString(v) {
  return (v == null) ? "" : String(v);
}

function xpathLiteral(value) {
  const s = safeString(value);
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  const parts = s.split('"');
  const concatParts = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length) concatParts.push(`"${parts[i]}"`);
    if (i !== parts.length - 1) concatParts.push(`'"'`);
  }
  return `concat(${concatParts.join(", ")})`;
}

function looksDynamic(text) {
  const s = normalizeText(text);
  if (!s) return true;
  const digitCount = (s.match(/\d/g) || []).length;
  if (digitCount / Math.max(1, s.length) > 0.25) return true;
  if (/^\d+$/.test(s)) return true;
  return false;
}

export function buildSmartXPathCandidates(meta, context = {}) {
  const candidates = [];
  if (!meta) return candidates;

  const cls = safeString(meta.class);
  const rid = safeString(meta.resourceId);
  const cd = safeString(meta.contentDesc);
  const txt = normalizeText(meta.text);

  // Strongest: resource-id, then content-desc, then text
  if (rid) {
    const clauses = [];
    if (cls) clauses.push(`@class=${xpathLiteral(cls)}`);
    clauses.push(`@resource-id=${xpathLiteral(rid)}`);
    candidates.push({
      value: `//*[${clauses.join(" and ")}]`,
      score: 85,
      reason: "resource-id anchored"
    });
    candidates.push({
      value: `//*[@resource-id=${xpathLiteral(rid)}]`,
      score: 82,
      reason: "resource-id only"
    });
  }

  if (cd) {
    const clauses = [];
    if (cls) clauses.push(`@class=${xpathLiteral(cls)}`);
    clauses.push(`@content-desc=${xpathLiteral(cd)}`);
    candidates.push({
      value: `//*[${clauses.join(" and ")}]`,
      score: 80,
      reason: "content-desc anchored"
    });
    candidates.push({
      value: `//*[@content-desc=${xpathLiteral(cd)}]`,
      score: 78,
      reason: "content-desc only"
    });
  }

  if (txt && !looksDynamic(txt)) {
    if (txt.length <= 40) {
      const clauses = [];
      if (cls) clauses.push(`@class=${xpathLiteral(cls)}`);
      clauses.push(`@text=${xpathLiteral(txt)}`);
      candidates.push({
        value: `//*[${clauses.join(" and ")}]`,
        score: 68,
        reason: "exact text"
      });
    } else {
      // partial for long strings
      const part = txt.slice(0, 24);
      const clauses = [];
      if (cls) clauses.push(`@class=${xpathLiteral(cls)}`);
      clauses.push(`contains(@text, ${xpathLiteral(part)})`);
      candidates.push({
        value: `//*[${clauses.join(" and ")}]`,
        score: 60,
        reason: "partial text"
      });
    }
  }

  // Optional anchor: parent id if caller provides it (future-proof)
  const parentId = safeString(context.parentResourceId);
  if (parentId && (rid || cd || txt)) {
    const childClauses = [];
    if (cls) childClauses.push(`@class=${xpathLiteral(cls)}`);
    if (rid) childClauses.push(`@resource-id=${xpathLiteral(rid)}`);
    else if (cd) childClauses.push(`@content-desc=${xpathLiteral(cd)}`);
    else if (txt) childClauses.push(`@text=${xpathLiteral(txt)}`);

    if (childClauses.length) {
      candidates.push({
        value: `//*[@resource-id=${xpathLiteral(parentId)}]//*[${childClauses.join(" and ")}]`,
        score: 72,
        reason: "parent anchor"
      });
    }
  }

  // De-dupe by value and sort
  const seen = new Set();
  const uniq = [];
  for (const c of candidates) {
    if (!c.value || seen.has(c.value)) continue;
    seen.add(c.value);
    uniq.push(c);
  }
  uniq.sort((a, b) => (b.score || 0) - (a.score || 0));
  return uniq;
}

