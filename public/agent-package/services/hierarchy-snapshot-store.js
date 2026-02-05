import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import zlib from "zlib";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeString(v) {
  return (v == null) ? "" : String(v);
}

function getBaseDir() {
  const isWin = process.platform === "win32";
  const localAppData = process.env.LOCALAPPDATA;
  if (isWin && localAppData) return path.join(localAppData, "wispr");
  if (isWin) return path.join(os.homedir(), "AppData", "Local", "wispr");
  return path.join(os.homedir(), ".wispr");
}

export function normalizeXmlForHash(xml) {
  // Stable enough for snapshot IDs across dumps while avoiding huge CPU costs.
  return safeString(xml).replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export function sha256Hex(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export class HierarchySnapshotStore {
  constructor(opts = {}) {
    this.enabled = opts.enabled ?? (process.env.WISPR_SNAPSHOT_STORE_ENABLED !== "0");
    this.retention = Number.isFinite(opts.retention) ? opts.retention : (parseInt(process.env.WISPR_SNAPSHOT_RETENTION || "200", 10) || 200);
    this.baseDir = opts.baseDir || getBaseDir();
    this.snapshotsDir = path.join(this.baseDir, "locator-history", "snapshots");
    this.elementsDir = path.join(this.baseDir, "locator-history", "elements");
    this.metaDir = path.join(this.baseDir, "locator-history", "meta");
    ensureDir(this.snapshotsDir);
    ensureDir(this.elementsDir);
    ensureDir(this.metaDir);
  }

  computeSnapshotId(xml) {
    return sha256Hex(normalizeXmlForHash(xml));
  }

  snapshotPath(snapshotId) {
    return path.join(this.snapshotsDir, `${snapshotId}.xml.gz`);
  }

  saveSnapshotXml(xml, extraMeta = {}) {
    if (!this.enabled) return { snapshotId: null, saved: false };
    if (!xml || typeof xml !== "string" || !xml.includes("<hierarchy")) return { snapshotId: null, saved: false };

    const snapshotId = this.computeSnapshotId(xml);
    const filePath = this.snapshotPath(snapshotId);

    // Write-once (content-addressed)
    if (!fs.existsSync(filePath)) {
      const gz = zlib.gzipSync(Buffer.from(xml, "utf-8"));
      fs.writeFileSync(filePath, gz);
    }

    // Best-effort metadata sidecar
    try {
      const metaPath = path.join(this.metaDir, `${snapshotId}.json`);
      if (!fs.existsSync(metaPath)) {
        fs.writeFileSync(metaPath, JSON.stringify({ snapshotId, ts: Date.now(), ...extraMeta }, null, 2));
      }
    } catch {
      // ignore
    }

    this.pruneRetention().catch(() => { });
    return { snapshotId, saved: true };
  }

  getSnapshotXml(snapshotId) {
    if (!snapshotId) return null;
    const filePath = this.snapshotPath(snapshotId);
    if (!fs.existsSync(filePath)) return null;
    const gz = fs.readFileSync(filePath);
    return zlib.gunzipSync(gz).toString("utf-8");
  }

  async pruneRetention() {
    if (!this.enabled) return;
    const files = fs.readdirSync(this.snapshotsDir)
      .filter(f => f.endsWith(".xml.gz"))
      .map(f => {
        const full = path.join(this.snapshotsDir, f);
        const stat = fs.statSync(full);
        return { full, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    for (let i = this.retention; i < files.length; i++) {
      try { fs.unlinkSync(files[i].full); } catch { }
    }
  }
}

