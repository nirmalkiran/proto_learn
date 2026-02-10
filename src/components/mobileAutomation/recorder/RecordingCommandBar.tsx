import { Button } from "@/components/ui/button";
import { RotateCcw, Play, Pause, Square } from "lucide-react";

type Props = {
  recording: boolean;
  replaying: boolean;
  mirrorActive: boolean;
  isPaused: boolean;
  actionsCount: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onReplay: () => void;
  onTogglePause: () => void;
};

export default function RecordingCommandBar({
  recording,
  replaying,
  mirrorActive,
  isPaused,
  actionsCount,
  onStartRecording,
  onStopRecording,
  onReplay,
  onTogglePause,
}: Props) {
  return (
    <div className="w-fit rounded-xl border border-border bg-card px-2.5 py-2 shadow-sm" id="recording-dashboard">
      {!recording ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="hidden md:flex items-center text-[11px] font-medium text-muted-foreground">
            Ready to record your mobile interactions
          </div>
          <div className="flex flex-col sm:flex-row gap-2 md:justify-end">
            <Button
              variant="outline"
              onClick={onReplay}
              disabled={actionsCount === 0 || replaying}
              className="h-9 min-w-[140px] rounded-full border-border bg-background px-4 text-[13px] font-semibold text-foreground transition-all duration-200 hover:bg-accent hover:border-primary/30"
            >
              <RotateCcw className="mr-1.5 h-[18px] w-[18px]" />
              Replay
            </Button>
            <Button
              onClick={onStartRecording}
              disabled={!mirrorActive}
            className="h-10 w-full sm:w-fit min-w-[220px] rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90 shadow-[0_6px_20px_rgba(59,130,246,0.28)]"
            >
              <div className="mr-1.5 h-2 w-2 rounded-full bg-primary-foreground animate-pulse" />
              Start Recording
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="hidden md:flex items-center text-[11px] font-medium text-muted-foreground">
            {isPaused ? "Recording paused" : "Recording in progress"}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 md:justify-end">
            <Button
              variant={isPaused ? "default" : "outline"}
              onClick={onTogglePause}
              className={`h-9 min-w-[140px] rounded-full px-4 text-[13px] font-semibold transition-all duration-200 ease-in-out ${isPaused ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'border-border bg-background text-foreground hover:bg-accent hover:border-primary/30'}`}
            >
              {isPaused ? <><Play className="mr-1.5 h-[18px] w-[18px] fill-current" /> Resume</> : <><Pause className="mr-1.5 h-[18px] w-[18px] fill-current" /> Pause</>}
            </Button>
            <Button
              variant="destructive"
              onClick={onStopRecording}
            className="h-10 w-full sm:w-fit min-w-[220px] rounded-full px-4 text-[13px] font-semibold transition-all duration-200 ease-in-out text-white shadow-[0_6px_18px_rgba(239,68,68,0.2)]"
            >
              <Square className="mr-1.5 h-[18px] w-[18px] fill-current" /> Stop
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
