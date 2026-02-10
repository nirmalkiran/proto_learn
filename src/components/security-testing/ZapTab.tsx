import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Server, Settings, Target, Shield } from "lucide-react";
import { ZapAgentManager } from "./zap/ZapAgentManager";
import { ZapScanProfiles } from "./zap/ZapScanProfiles";
import { ZapScanOrchestrator } from "./zap/ZapScanOrchestrator";
import { ZapFindingsView } from "./zap/ZapFindingsView";
import type { ZapScan } from "./zap/types";

interface ZapTabProps {
  projectId: string;
}

export const ZapTab = ({ projectId }: ZapTabProps) => {
  const [selectedScan, setSelectedScan] = useState<ZapScan | null>(null);
  const [activeTab, setActiveTab] = useState('scans');

  if (selectedScan) {
    return <ZapFindingsView scan={selectedScan} onBack={() => setSelectedScan(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-blue-500" />
        <div>
          <h2 className="text-xl font-bold">OWASP ZAP</h2>
          <p className="text-sm text-muted-foreground">
            Open-source web application security scanner
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="scans" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Scans
          </TabsTrigger>
          <TabsTrigger value="profiles" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Profiles
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Agents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scans" className="space-y-4">
          <ZapScanOrchestrator 
            projectId={projectId}
            onViewResults={(scan) => setSelectedScan(scan)}
          />
        </TabsContent>

        <TabsContent value="profiles" className="space-y-4">
          <ZapScanProfiles projectId={projectId} />
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <ZapAgentManager projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
