import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Terminal, Download, CheckCircle } from "lucide-react";

export default function SelfHosting() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Server className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Self-Hosting Guide</h1>
          <p className="text-muted-foreground">
            Deploy and manage your own mobile automation infrastructure
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Prerequisites
            </CardTitle>
            <CardDescription>
              Required tools and dependencies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Node.js 18+ installed</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Android SDK / ADB configured</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Appium 2.0+ installed globally</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Android Emulator or physical device</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Quick Start
            </CardTitle>
            <CardDescription>
              Start the mobile automation agent
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted rounded-lg p-4 font-mono text-sm">
              <p className="text-muted-foreground"># Navigate to agent folder</p>
              <p>cd tools/mobile-automation-helper</p>
              <p className="text-muted-foreground mt-2"># Install dependencies</p>
              <p>npm install</p>
              <p className="text-muted-foreground mt-2"># Start the agent</p>
              <p>npm start</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Once the agent is running on port 3001, return to the Setup tab
              and click "One-Tap Start All Services".
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
