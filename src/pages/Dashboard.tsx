import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Smartphone, Terminal, Play, Search, FileCode, Settings } from "lucide-react";
import { Link } from "react-router-dom";

const features = [
  {
    title: "Terminal Panel",
    description: "Execute ADB and Appium commands directly",
    icon: Terminal,
    href: "/terminal",
    status: "ready"
  },
  {
    title: "Record & Playback",
    description: "Capture actions and replay as automated tests",
    icon: Play,
    href: "/recorder",
    status: "ready"
  },
  {
    title: "Locator Finder",
    description: "Inspect UI hierarchy and find element locators",
    icon: Search,
    href: "/inspector",
    status: "ready"
  },
  {
    title: "Test Generator",
    description: "Generate test scripts from natural language prompts",
    icon: FileCode,
    href: "/generator",
    status: "ready"
  },
  {
    title: "Configuration",
    description: "Manage Appium and device settings",
    icon: Settings,
    href: "/config",
    status: "ready"
  }
];

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <Smartphone className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Mobile Automation Panel</h1>
              <p className="text-muted-foreground">Android Appium Control Center</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Status Banner */}
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                  Backend Required
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Start local backend server to enable device connections
                </span>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/config">Setup Guide</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Feature Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Link key={feature.title} to={feature.href}>
              <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <feature.icon className="h-10 w-10 text-primary" />
                    <Badge variant="secondary">{feature.status}</Badge>
                  </div>
                  <CardTitle className="mt-4">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>

        {/* Quick Start */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Quick Start</CardTitle>
            <CardDescription>Get your automation environment running in minutes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="font-medium">1. Prerequisites</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Java JDK 11+</li>
                  <li>• Android SDK with platform-tools</li>
                  <li>• Node.js 18+</li>
                  <li>• Appium 2.x</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">2. Start Services</h4>
                <code className="block bg-muted p-3 rounded text-xs">
                  # Terminal 1: Start Appium<br />
                  appium --port 4723<br /><br />
                  # Terminal 2: Start backend<br />
                  node backend/server.js
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
