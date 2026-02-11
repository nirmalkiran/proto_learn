/**
 * Purpose:
 * Main entry point for the Mobile No-Code Automation module.
 * Manages the high-level navigation (Tabs) between Setup, Recorder, and AI Assistant,
 * while maintaining shared connection state.
 */
import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Smartphone,
  Circle,
  Wand2,
  Settings,
  Cloud,
  BookOpen,
  ClipboardCheck,
  Download,
  RefreshCw,
  Terminal,
  Package,
  Info,
  AlertCircle,
  CheckCircle2,
  Copy,
} from "lucide-react";

import MobileRecorder from "./MobileRecorder";
import MobileSetupWizard from "./MobileSetupWizard";
import MobileAIAssistant from "./MobileAIAssistant";

import { SelectedDevice } from "./types";
import { toast } from "sonner";

const DEFAULT_PROJECT_ID = "c4a1b02d-7682-4c28-874b-6e9f9024c0e9";

interface MobileAutomationProps {
  projectId?: string;
}

export default function MobileAutomation({ projectId = DEFAULT_PROJECT_ID }: MobileAutomationProps) {

  /** Active tab */
  const [activeTab, setActiveTab] = useState("setup");
  const [roadmapOpen, setRoadmapOpen] = useState(false);
  const [toolkitOpen, setToolkitOpen] = useState(false);

  // Standardized shared state
  const [setupState, setSetupState] = useState({
    appium: false,
    emulator: false,
    device: false,
  });

  const [selectedDevice, setSelectedDevice] = useState<SelectedDevice | null>(null);

  return (
    <div className="space-y-6">

      <div className="flex items-center gap-4">
        <Smartphone className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Mobile No-Code Automation</h1>
          <p className="text-muted-foreground">
            Android automation for QAs
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRoadmapOpen(true)}
            id="prerequisites-guide"
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
          >
            Automation Roadmap
          </button>
          <span className="text-muted-foreground/40">|</span>
          <button
            type="button"
            onClick={() => setToolkitOpen(true)}
            id="complete-installation-guide"
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
          >
            Toolkit Installation
          </button>
          <Badge
            variant="outline"
            className="flex items-center gap-1 ml-2"
          >
            <Cloud className="h-3 w-3" />
            Local
          </Badge>
        </div>
      </div>

      <Dialog open={roadmapOpen} onOpenChange={setRoadmapOpen}>
        <DialogContent className="sm:max-w-[760px] max-h-[85vh] p-0 overflow-hidden">
          <div className="p-6 border-b border-border/60">
            <DialogHeader>
              <DialogTitle>Automation Roadmap</DialogTitle>
              <DialogDescription>
                A quick overview of the setup journey for Mobile No-Code Automation.
              </DialogDescription>
            </DialogHeader>
          </div>
          <ScrollArea className="max-h-[calc(85vh-88px)] w-full">
            <div className="p-6">
              <Card className="bg-card/40 backdrop-blur-sm border-primary/20 shadow-lg overflow-hidden">
                <div className="p-6">
                  <div className="relative">
                    <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-primary/10 hidden sm:block" />
                    <div className="space-y-8">
                      <div className="relative sm:pl-14">
                        <div className="absolute left-0 top-0 h-9 w-9 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground font-bold text-sm shadow-[0_4px_12px_rgba(var(--primary),0.3)] z-10 hidden sm:flex">
                          1
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-primary mb-2">
                            Foundation: System Prerequisites
                          </h4>
                          <p className="text-xs text-muted-foreground mb-4 leading-relaxed font-medium">
                            Ensure <strong>Node.js (v18+)</strong> and the{" "}
                            <strong>Android SDK</strong> are configured correctly.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Badge
                              variant="outline"
                              className="text-xs font-medium border-primary/10 py-0 h-6"
                            >
                              <Terminal className="h-3 w-3 mr-1 text-primary/60" />
                              npm start (Helper)
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-xs font-medium border-primary/10 py-0 h-6"
                            >
                              <Package className="h-3 w-3 mr-1 text-primary/60" />
                              Appium Server
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="relative sm:pl-14">
                        <div className="absolute left-0 top-0 h-9 w-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm border border-primary/20 z-10 hidden sm:flex">
                          2
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-primary mb-2">
                            Connection: Bridge the Gap
                          </h4>
                          <p className="text-xs text-muted-foreground mb-4 leading-relaxed font-medium">
                            Connect via USB for physical testing or initiate a
                            high-performance <strong>Android Emulator</strong>.
                          </p>
                          <div className="p-3 bg-amber-500/[0.03] border border-amber-500/10 rounded-2xl flex items-start gap-3 shadow-sm">
                            <Info className="h-4 w-4 text-amber-500 mt-0.5" />
                            <p className="text-xs text-amber-800/80 leading-normal font-medium italic">
                              Pro Tip: If your device is shy, a quick{" "}
                              <code>adb devices</code> usually resolves connection
                              issues.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="relative sm:pl-14">
                        <div className="absolute left-0 top-0 h-9 w-9 rounded-2xl bg-primary/5 text-primary/40 flex items-center justify-center font-bold text-sm border border-primary/10 z-10 hidden sm:flex">
                          3
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-primary mb-2">
                            Execution: Record & Refine
                          </h4>
                          <p className="text-xs text-muted-foreground mb-4 leading-relaxed font-medium">
                            Capture interactions and transform manual tasks into a{" "}
                            <strong>No-Code Script</strong> for infinite replay.
                          </p>
                          <div className="flex items-center gap-4 text-xs font-bold text-primary/40 uppercase tracking-widest bg-primary/[0.02] p-3 rounded-2xl border border-primary/5 inline-flex">
                            <div className="flex items-center gap-2">
                              <Smartphone className="h-3.5 w-3.5" />
                              Record
                            </div>
                            <div className="h-1 w-1 rounded-full bg-primary/20" />
                            <div className="flex items-center gap-2">
                              <ClipboardCheck className="h-3.5 w-3.5" />
                              Save
                            </div>
                            <div className="h-1 w-1 rounded-full bg-primary/20" />
                            <div className="flex items-center gap-2">
                              <RefreshCw className="h-3.5 w-3.5" />
                              Replay
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={toolkitOpen} onOpenChange={setToolkitOpen}>
        <DialogContent className="sm:max-w-[760px] max-h-[85vh] p-0 overflow-hidden">
          <div className="p-6 border-b border-border/60">
            <DialogHeader>
              <DialogTitle>Toolkit Installation</DialogTitle>
              <DialogDescription>
                Ensure the required tools are installed and available on your system.
              </DialogDescription>
            </DialogHeader>
          </div>
          <ScrollArea className="max-h-[calc(85vh-88px)] w-full">
            <div className="p-6">
              <Card className="bg-card/40 backdrop-blur-sm border-blue-500/20 shadow-lg overflow-hidden">
                <div className="p-6">
                  <div className="relative">
                    <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-blue-500/10 hidden sm:block" />
                    <div className="space-y-8">
                      <div className="relative sm:pl-12">
                        <div className="absolute left-0 top-0 h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm shadow-md z-10 hidden sm:flex">
                          1
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-blue-600 mb-2">
                            Install Node.js
                          </h4>
                          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                            Download LTS from{" "}
                            <a
                              href="https://nodejs.org/"
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-500 underline"
                            >
                              nodejs.org
                            </a>
                            .
                          </p>
                          <div className="p-3 bg-green-500/5 border border-green-500/10 rounded-lg flex items-center justify-between max-w-md">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              <span className="text-xs font-mono">node --version</span>
                            </div>
                            <span className="text-xs text-green-600 font-bold tracking-tighter uppercase">
                              Verify (v18+)
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="relative sm:pl-14">
                        <div className="absolute left-0 top-0 h-9 w-9 rounded-2xl bg-blue-500/20 text-blue-600 flex items-center justify-center font-bold text-sm border border-blue-500/30 z-10 hidden sm:flex">
                          2
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-blue-600 mb-2">
                            Core: Appium & ADB
                          </h4>
                          <div className="space-y-3 max-w-lg">
                            <div className="p-3 bg-muted/40 rounded-2xl border border-muted-foreground/10 flex items-center justify-between shadow-sm">
                              <code className="text-xs font-mono text-blue-600 font-bold">
                                npm install -g appium
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    "npm install -g appium"
                                  );
                                  toast.success("Copied");
                                }}
                              >
                                <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 bg-background/50 rounded-2xl text-center border border-muted-foreground/5 shadow-sm">
                                <p className="text-xs font-bold text-muted-foreground/50 uppercase mb-1 tracking-tighter">
                                  ADB Version
                                </p>
                                <code className="text-xs font-mono font-bold text-blue-500/70">
                                  adb version
                                </code>
                              </div>
                              <div className="p-3 bg-background/50 rounded-2xl text-center border border-muted-foreground/5 shadow-sm">
                                <p className="text-xs font-bold text-muted-foreground/50 uppercase mb-1 tracking-tighter">
                                  Appium Version
                                </p>
                                <code className="text-xs font-mono font-bold text-blue-500/70">
                                  appium -v
                                </code>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="relative sm:pl-14">
                        <div className="absolute left-0 top-0 h-9 w-9 rounded-2xl bg-blue-500/[0.05] text-blue-600/60 flex items-center justify-center font-bold text-sm border border-blue-500/10 z-10 hidden sm:flex">
                          3
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-blue-600 mb-2 font-bold tracking-tight">
                            Activation: Local Helper
                          </h4>
                          <div className="space-y-2 max-w-lg">
                            {[
                              {
                                label: "1. Open",
                                text: "Extract and open the folder, right-click and Open Terminal",
                              },
                              { label: "2. Install", cmd: "npm install" },
                              { label: "3. Start", cmd: "npm start" },
                            ].map((step, i) => (
                              <div
                                key={i}
                                className="p-3 bg-muted/30 rounded-xl border border-muted-foreground/5 flex items-center justify-between gap-4 shadow-sm group hover:border-primary/20 transition-all duration-300"
                              >
                                <div className="flex flex-col gap-1 min-w-0 flex-1">
                                  <span className="text-xs font-bold text-muted-foreground/40 uppercase tracking-widest">
                                    {step.label}
                                  </span>
                                  {step.cmd ? (
                                    <code className="text-xs font-mono text-primary/90 font-bold leading-none">
                                      {step.cmd}
                                    </code>
                                  ) : (
                                    <p className="text-xs text-foreground/80 font-medium leading-tight">
                                      {step.text}
                                    </p>
                                  )}
                                </div>
                                {step.cmd && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                                    onClick={() => {
                                      navigator.clipboard.writeText(step.cmd!);
                                      toast.success("Copied to clipboard");
                                    }}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 mt-6 border-t border-muted-foreground/10">
                    <div className="p-4 bg-amber-500/[0.03] border border-amber-500/10 rounded-2xl flex items-start gap-3">
                      <Info className="h-4 w-4 text-amber-500 mt-1" />
                      <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                        On <strong>Windows</strong>, use PowerShell Admin. On{" "}
                        <strong>macOS</strong>, ensure Xcode licenses are agreed.
                      </p>
                    </div>
                    <div className="p-4 bg-red-500/[0.03] border border-red-500/10 rounded-2xl flex items-start gap-3">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-1" />
                      <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                        If <code>adb</code> is missing, check your PATH variables
                        and restart the terminal.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="setup">
            <Settings className="mr-2 h-4 w-4" />
            Setup
          </TabsTrigger>

          <TabsTrigger value="recorder">
            <Circle className="mr-2 h-4 w-4" />
            Recorder
          </TabsTrigger>

          <TabsTrigger value="assistant">
            <Wand2 className="mr-2 h-4 w-4" />
            AI Assistant
          </TabsTrigger>
        </TabsList>


        {/* ================= SETUP ================= */}
        <TabsContent value="setup" forceMount className={activeTab !== "setup" ? "hidden" : "mt-6"}>
          <MobileSetupWizard
            setupState={setupState}
            setSetupState={setSetupState}
            selectedDevice={selectedDevice}
            setSelectedDevice={setSelectedDevice}
            setActiveTab={setActiveTab}
          />
        </TabsContent>

        {/* ================= RECORDER ================= */}
        <TabsContent value="recorder" forceMount className={activeTab !== "recorder" ? "hidden" : "mt-6"}>
          <MobileRecorder
            setupState={setupState}
            setSetupState={setSetupState}
            selectedDevice={selectedDevice}
            setSelectedDevice={setSelectedDevice}
            selectedDeviceFromSetup={selectedDevice?.device}
          />
        </TabsContent>

        {/* ================= AI ASSISTANT ================= */}
        <TabsContent value="assistant" forceMount className={activeTab !== "assistant" ? "hidden" : "mt-6"}>
          <MobileAIAssistant
            projectId={projectId}
            setupState={setupState}
            selectedDevice={selectedDevice}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
