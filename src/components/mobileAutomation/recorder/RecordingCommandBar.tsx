import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <Card
      className="w-full border border-border/70 bg-card/95 backdrop-blur-sm shadow-sm px-3 py-3 sticky top-0 z-30"
      id="recording-dashboard"
    >
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/60">
        <div className="text-[12px] font-semibold tracking-tight text-muted-foreground uppercase">
          Recording Controls
        </div>
        {recording && (
          <div className="text-[11px] font-medium text-muted-foreground">
            {isPaused ? "Paused" : "Recording"}
          </div>
        )}
      </div>

      {!recording ? (
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onReplay}
            disabled={actionsCount === 0 || replaying}
            className="flex-1 min-w-[160px] rounded-lg border-border bg-background text-[13px] font-semibold hover:bg-accent hover:border-primary/30"
          >
            <RotateCcw className="mr-1.5 h-[18px] w-[18px]" />
            Replay
          </Button>
          <Button
            onClick={onStartRecording}
            disabled={!mirrorActive}
            className="flex-1 min-w-[180px] rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 shadow-[0_6px_16px_rgba(59,130,246,0.28)]"
          >
            <div className="mr-1.5 h-2 w-2 rounded-full bg-primary-foreground animate-pulse" />
            Start Recording
          </Button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant={isPaused ? "default" : "outline"}
            onClick={onTogglePause}
            className={`h-10 flex-1 min-w-[140px] rounded-lg text-[13px] font-semibold transition-all duration-200 ease-in-out ${isPaused ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'border-border bg-background text-foreground hover:bg-accent hover:border-primary/30'}`}
          >
            {isPaused ? <><Play className="mr-1.5 h-[18px] w-[18px] fill-current" /> Resume</> : <><Pause className="mr-1.5 h-[18px] w-[18px] fill-current" /> Pause</>}
          </Button>
          <Button
            variant="destructive"
            onClick={onStopRecording}
            className="h-10 flex-1 min-w-[180px] rounded-lg text-[13px] font-semibold text-white transition-all duration-200 ease-in-out shadow-[0_6px_18px_rgba(239,68,68,0.2)]"
          >
            <Square className="mr-1.5 h-[18px] w-[18px] fill-current" /> Stop
          </Button>
        </div>
      )}
    </Card>
  );
}
