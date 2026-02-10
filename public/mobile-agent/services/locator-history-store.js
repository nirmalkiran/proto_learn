import fs from "fs";
import path from "path";
import os from "os";

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

export class LocatorHistoryStore {
  constructor(opts = {}) {
    this.enabled = opts.enabled ?? (process.env.WISPR_HEALING_HISTORY_ENABLED !== "0");
    this.baseDir = opts.baseDir || getBaseDir();
    this.elementsDir = path.join(this.baseDir, "locator-history", "elements");
    ensureDir(this.elementsDir);
  }

  _fileForPackage(appPackage) {
    const safe = safeString(appPackage || "global").replace(/[^a-zA-Z0-9_.-]/g, "_");
    return path.join(this.elementsDir, `${safe}.jsonl`);
  }

  appendRecord(appPackage, record) {
    if (!this.enabled) return;
    try {
      const filePath = this._fileForPackage(appPackage);
      const line = JSON.stringify({ ts: Date.now(), ...record }) + "\n";
      fs.appendFileSync(filePath, line, "utf-8");
    } catch {
      // ignore
    }
  }

  loadRecentByFingerprint(appPackage, fingerprint, limit = 50) {
    if (!this.enabled) return [];
    try {
      const filePath = this._fileForPackage(appPackage);
      if (!fs.existsSync(filePath)) return [];
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const out = [];
      for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
        try {
          const obj = JSON.parse(lines[i]);
          if (obj.fingerprint === fingerprint) out.push(obj);
        } catch { }
      }
      return out;
    } catch {
      return [];
    }
  }
}

