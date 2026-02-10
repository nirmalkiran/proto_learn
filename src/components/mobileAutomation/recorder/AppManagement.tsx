import { Button } from "@/components/ui/button";
import { Play, Square, Trash2, RefreshCw, Package, CheckCircle2, CheckCircle, Upload, X, Info } from "lucide-react";

type UploadedApk = { name: string; installed?: boolean } | null;

type Props = {
  appPackage: string;
  installedPackagesCount: number;
  apkUploading: boolean;
  apkInstalling: boolean;
  uploadedApk: UploadedApk;
  setUploadedApk: (apk: UploadedApk) => void;
  onLaunch: () => void;
  onForceStop: () => void;
  onClearData: () => void;
  onClearCache: () => void;
  onUninstall: () => void;
  onInfo: () => void;
  onUploadClick: () => void;
  onInstallApk: () => void;
  disabled: boolean;
};

export default function AppManagement({
  appPackage,
  installedPackagesCount,
  apkUploading,
  apkInstalling,
  uploadedApk,
  setUploadedApk,
  onLaunch,
  onForceStop,
  onClearData,
  onClearCache,
  onUninstall,
  onInfo,
  onUploadClick,
  onInstallApk,
  disabled,
}: Props) {
  const hasApk = !!uploadedApk;
  return (
    <div id="app-control-section" className="w-1/2 space-y-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          App Management
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-9 rounded-full border-primary/30 bg-primary/10 text-[13px] font-semibold text-primary transition-all duration-200 hover:bg-primary/20 hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
          onClick={onLaunch}
          disabled={disabled}
          title="Launch the selected app"
        >
          <Play className="mr-1.5 h-[18px] w-[18px] fill-current" /> Launch
        </Button>
        <Button
          variant="outline"
          className="h-9 rounded-full border-destructive/30 bg-destructive/10 text-[13px] font-semibold text-destructive transition-all duration-200 hover:bg-destructive/20 hover:border-destructive/60 focus-visible:ring-2 focus-visible:ring-destructive/30"
          onClick={onForceStop}
          disabled={disabled}
          title="Force stop the selected app"
        >
          <Square className="mr-1.5 h-[18px] w-[18px] fill-current" /> Force Stop
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-9 rounded-full border-border bg-background text-[13px] font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/20"
          onClick={onClearData}
          disabled={disabled}
        >
          <Trash2 className="mr-1.5 h-[18px] w-[18px]" /> Clear Data
        </Button>
        <Button
          variant="outline"
          className="h-9 rounded-full border-border bg-background text-[13px] font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/20"
          onClick={onClearCache}
          disabled={disabled}
        >
          <RefreshCw className="mr-1.5 h-[18px] w-[18px]" /> Clear Cache
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-9 rounded-full border-destructive/30 bg-destructive/10 text-[13px] font-semibold text-destructive transition-all duration-200 hover:bg-destructive/20 hover:border-destructive/60 focus-visible:ring-2 focus-visible:ring-destructive/30"
          onClick={onUninstall}
          disabled={disabled}
        >
          <Trash2 className="mr-1.5 h-[18px] w-[18px]" />
          Uninstall
        </Button>
        <Button
          variant="outline"
          className="h-9 rounded-full border-border bg-background text-[13px] font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/20"
          onClick={onInfo}
          disabled={disabled}
        >
          <Info className="mr-1.5 h-[18px] w-[18px]" />
          Info
        </Button>
      </div>

      <div className="pt-2 border-t border-dashed border-border space-y-1.5">
        <Button
          variant="outline"
          className="w-full h-9 rounded-full border-dashed border-border text-[13px] font-medium text-foreground transition-all duration-200 ease-in-out hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/20"
          onClick={onUploadClick}
          disabled={apkUploading}
        >
          {apkUploading ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {installedPackagesCount > 0 ? "Upload APK (Update/New)" : "Upload APK"}
        </Button>

        {hasApk && (
          <div className={`animate-in fade-in slide-in-from-top-1 duration-300 mt-2 rounded-lg border p-2 transition-all duration-150 ease-in-out ${
            (uploadedApk as any)?.installed
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-green-500/5 border-green-500/20"
            }`}>
            <div className="flex items-center justify-between px-1 py-1 mb-2">
              <span className={`text-[11px] font-medium truncate max-w-[220px] flex items-center gap-2 ${(uploadedApk as any)?.installed ? "text-emerald-700 dark:text-emerald-400" : "text-green-700 dark:text-green-400"
                }`}>
                {(uploadedApk as any)?.installed ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Package className="h-3.5 w-3.5" />
                )}

                {(uploadedApk as any)?.installed ? (
                  <span className="font-semibold">Installed: {(uploadedApk as any)?.name}</span>
                ) : (
                  <span>Ready: {(uploadedApk as any)?.name}</span>
                )}
              </span>

              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:bg-muted rounded"
                onClick={() => setUploadedApk(null)}
                title="Dismiss"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            <Button
              variant="default"
              className={`w-full h-9 rounded-full text-[13px] font-semibold transition-all duration-150 ease-in-out gap-2 ${
                (uploadedApk as any)?.installed
                  ? "bg-emerald-600 hover:bg-emerald-600 opacity-90 cursor-default"
                  : "bg-green-600 hover:bg-green-700"
                }`}
              onClick={(uploadedApk as any)?.installed ? undefined : onInstallApk}
              disabled={apkInstalling || (uploadedApk as any)?.installed}
            >
              {apkInstalling ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (uploadedApk as any)?.installed ? (
                <CheckCircle className="h-3.5 w-3.5 fill-current" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}

              {(uploadedApk as any)?.installed
                ? "Installation Complete"
                : (appPackage ? "Update Existing App" : "Install New APK")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
