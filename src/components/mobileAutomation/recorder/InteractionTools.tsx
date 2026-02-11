import { MousePointer2, RotateCcw, Type, Clock, SquareStack, ChevronUp, ChevronDown, ArrowLeft, ArrowRight, Circle, Keyboard, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  captureMode: boolean;
  onToggleCapture: () => void;
  onUndo: () => void;
  onToggleInput: () => void;
  onAddWait: () => void;
  onSwipe: (dir: "up" | "down" | "left" | "right") => void;
  onBack: () => void;
  onHome: () => void;
  onRecents: () => void;
  onHideKeyboard: () => void;
};

export default function InteractionTools({
  captureMode,
  onToggleCapture,
  onUndo,
  onToggleInput,
  onAddWait,
  onSwipe,
  onBack,
  onHome,
  onRecents,
  onHideKeyboard,
}: Props) {
  return (
    <div
      id="interaction-tools" className="w-full min-w-0 rounded-xl border border-border bg-card shadow-sm p-2"
    >

      <div className="flex flex-col items-center justify-between gap-2 pb-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Interaction Tools
        </div>

        <div className="flex flex-col flex-wrap items-center gap-4">
          <div className="grid grid-cols-3 grid-rows-3 gap-1 shrink-0">
            <span />
            <button onClick={() => onSwipe("up")} className="h-8 w-8 rounded-md bg-background border border-border hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 shadow-sm transition-all duration-200" aria-label="Swipe up" title="Swipe up">
              <ChevronUp className="h-4 w-4 mx-auto text-foreground" />
            </button>
            <span />
            <button onClick={() => onSwipe("left")} className="h-8 w-8 rounded-md bg-background border border-border hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 shadow-sm transition-all duration-200" aria-label="Swipe left" title="Swipe left">
              <ArrowLeft className="h-4 w-4 mx-auto text-foreground" />
            </button>
            <button
              onClick={onToggleCapture}
              className={`h-8 w-8 rounded-md border shadow-sm transition-all duration-200 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${captureMode
                  ? "bg-primary text-primary-foreground border-primary/60 shadow-[0_6px_16px_rgba(59,130,246,0.25)] ring-1 ring-primary/30"
                  : "bg-background border-border text-foreground hover:border-primary/40 hover:bg-primary/10"
                }`}
              aria-label="Toggle capture"
              title={captureMode ? "Capture on" : "Capture off"}
            >
              <MousePointer2 className="h-4 w-4" />
            </button>
            <button onClick={() => onSwipe("right")} className="h-8 w-8 rounded-md bg-background border border-border hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 shadow-sm transition-all duration-200" aria-label="Swipe right" title="Swipe right">
              <ArrowRight className="h-4 w-4 mx-auto text-foreground" />
            </button>
            <span />
            <button onClick={() => onSwipe("down")} className="h-8 w-8 rounded-md bg-background border border-border hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 shadow-sm transition-all duration-200" aria-label="Swipe down" title="Swipe down">
              <ChevronDown className="h-4 w-4 mx-auto text-foreground" />
            </button>
            <span />
          </div>

          <div className="flex gap-1">
            <Button variant="secondary" size="sm" className="h-8 rounded-full border border-border bg-background text-[13px] font-medium hover:bg-accent hover:text-accent-foreground hover:border-primary/30 transition-all duration-200 whitespace-nowrap" onClick={onUndo}>
              <RotateCcw className="size-3" />
              Undo
            </Button>
            <Button variant="secondary" size="sm" className="h-8 rounded-full border border-border bg-background text-[13px] font-medium hover:bg-accent hover:text-accent-foreground hover:border-primary/30 transition-all duration-200 whitespace-nowrap" onClick={onAddWait}>
              <Clock className="size-3" />
              Wait
            </Button>
            <Button variant="outline" size="sm" className="h-8 rounded-full border-border bg-background text-[13px] font-medium hover:border-primary/50 hover:bg-primary/10 transition-all duration-200 whitespace-nowrap px-3.5" onClick={onToggleInput}>
              <Type className="size-3" />
              Input
            </Button>
          </div>
        </div>
      </div>

      <div className="border border-dashed my-5"></div>

      <div className="flex flex-col items-center justify-between gap-2 pb-1">
        <div className="flex items-center justify-between gap-2 pb-1">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            System Navigation
          </div>
        </div>

        <div className="flex items-center overflow-hidden rounded-md border border-border bg-background">
          <button
            type="button"
            aria-label="Back"
            className="h-8 px-2.5 flex items-center gap-1 border-r border-border text-[11px] font-medium text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-accent-foreground"
            onClick={onBack}
          >
         <Play className="h-4 w-4 rotate-180"/>Back
          </button>
          <button
            type="button"
            aria-label="Home"
            className="h-8 px-2.5 flex items-center gap-1 border-r border-border text-[11px] font-medium text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-accent-foreground"
            onClick={onHome}
          >
            <Circle className="h-4 w-4" />
            Home
          </button>
          <button
            type="button"
            aria-label="Recent Apps"
            className="h-8 px-2.5 flex items-center gap-1 border-r border-border text-[11px] font-medium text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-accent-foreground"
            onClick={onRecents}
          >
            <SquareStack className="h-4 w-4" />
            Recent Apps
          </button>
          <button
            type="button"
            aria-label="Hide Keyboard"
            className="h-8 px-2.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-accent-foreground"
            onClick={onHideKeyboard}
          >
            <Keyboard className="h-4 w-4" />
            Keyboard
          </button>
        </div>
      </div>
    </div>
  );
}
