import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Server, Settings, Target, Shield } from "lucide-react";
import { BurpAgentManager } from "./burp/BurpAgentManager";
import { BurpScanProfiles } from "./burp/BurpScanProfiles";
import { BurpScanOrchestrator } from "./burp/BurpScanOrchestrator";
import { BurpFindingsView } from "./burp/BurpFindingsView";
import type { BurpScan } from "./burp/types";

interface BurpSuiteTabProps {
  projectId: string;
}

export const BurpSuiteTab = ({ projectId }: BurpSuiteTabProps) => {
  const [selectedScan, setSelectedScan] = useState<BurpScan | null>(null);
  const [activeTab, setActiveTab] = useState('scans');

  // If viewing scan results, show the findings view
  if (selectedScan) {
    return (
      <BurpFindingsView 
        scan={selectedScan}
        onBack={() => setSelectedScan(null)}
        onRefresh={() => {}}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-orange-500" />
        <div>
          <h2 className="text-xl font-bold">Burp Suite Professional</h2>
          <p className="text-sm text-muted-foreground">
            Enterprise-grade vulnerability scanning with self-hosted agents
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
          <BurpScanOrchestrator 
            projectId={projectId}
            onViewResults={(scan) => setSelectedScan(scan)}
          />
        </TabsContent>

        <TabsContent value="profiles" className="space-y-4">
          <BurpScanProfiles projectId={projectId} />
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <BurpAgentManager projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
