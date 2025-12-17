import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

interface TerminalLine {
  id: number;
  type: "input" | "output" | "error";
  content: string;
  timestamp: Date;
}

const SAMPLE_COMMANDS = [
  { cmd: "adb devices", desc: "List connected devices" },
  { cmd: "adb shell pm list packages", desc: "List installed packages" },
  { cmd: "adb shell dumpsys window | grep mCurrentFocus", desc: "Get current activity" },
  { cmd: "appium:status", desc: "Check Appium server status" },
];

export default function TerminalPanel() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: 0, type: "output", content: "Mobile Automation Terminal v1.0", timestamp: new Date() },
    { id: 1, type: "output", content: "Type 'help' for available commands. Connect backend at localhost:3001", timestamp: new Date() },
  ]);
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const addLine = (type: TerminalLine["type"], content: string) => {
    setLines((prev) => [...prev, { id: Date.now(), type, content, timestamp: new Date() }]);
  };

  const executeCommand = async (cmd: string) => {
    addLine("input", `$ ${cmd}`);

    // Local commands
    if (cmd === "help") {
      addLine("output", "Available commands:\n  help - Show this help\n  clear - Clear terminal\n  adb <cmd> - Execute ADB command\n  appium:<action> - Appium commands (status, session, source)\n  connect - Test backend connection");
      return;
    }

    if (cmd === "clear") {
      setLines([]);
      return;
    }

    if (cmd === "connect") {
      try {
        const res = await fetch("http://localhost:3001/api/health");
        if (res.ok) {
          setIsConnected(true);
          addLine("output", "✓ Connected to backend server");
        }
      } catch {
        addLine("error", "✗ Backend not reachable. Start server with: node backend/server.js");
      }
      return;
    }

    // Proxy to backend
    try {
      const res = await fetch("http://localhost:3001/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      addLine(data.success ? "output" : "error", data.output || data.error);
    } catch {
      // Simulate response for demo
      if (cmd.startsWith("adb")) {
        addLine("error", "[Demo Mode] Backend not connected. Sample output:");
        if (cmd === "adb devices") {
          addLine("output", "List of devices attached\nemulator-5554\tdevice");
        } else {
          addLine("output", `Would execute: ${cmd}`);
        }
      } else if (cmd.startsWith("appium:")) {
        addLine("error", "[Demo Mode] Connect backend to execute Appium commands");
      } else {
        addLine("error", `Unknown command: ${cmd}`);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    executeCommand(input.trim());
    setInput("");
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Terminal Panel</h1>
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </div>

        <Card className="mb-4">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Quick Commands</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {SAMPLE_COMMANDS.map((s) => (
              <Button
                key={s.cmd}
                variant="outline"
                size="sm"
                onClick={() => executeCommand(s.cmd)}
                title={s.desc}
              >
                {s.cmd.length > 30 ? s.cmd.slice(0, 30) + "..." : s.cmd}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-0">
            <ScrollArea className="h-[500px] p-4 font-mono text-sm">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className={`py-0.5 ${
                    line.type === "input"
                      ? "text-green-400"
                      : line.type === "error"
                      ? "text-red-400"
                      : "text-zinc-300"
                  }`}
                >
                  <pre className="whitespace-pre-wrap">{line.content}</pre>
                </div>
              ))}
              <div ref={scrollRef} />
            </ScrollArea>

            <form onSubmit={handleSubmit} className="flex border-t border-zinc-800">
              <span className="px-4 py-3 text-green-400 font-mono">$</span>
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 border-0 bg-transparent font-mono text-zinc-100 focus-visible:ring-0 rounded-none"
                placeholder="Enter command..."
                autoFocus
              />
              <Button type="submit" variant="ghost" size="icon" className="text-zinc-400">
                <Send className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-zinc-400"
                onClick={() => setLines([])}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
