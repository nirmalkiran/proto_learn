import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, History, Sparkles, Search, BookOpen } from "lucide-react";
import { SafetyControlsConfig } from "./SafetyControlsConfig";
import { AIAuditDashboard } from "./AIAuditDashboard";
import { QAPatternsManager } from "./QAPatternsManager";
import { QASemanticSearch } from "./QASemanticSearch";
import { QAStandardsManager } from "./QAStandardsManager";

interface AIGovernanceProps {
  projectId: string;
}

export const AIGovernance = ({ projectId }: AIGovernanceProps) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>AI Governance</CardTitle>
        </div>
        <CardDescription>
          Configure AI safety controls, review audit history, and manage proven QA patterns
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="safety" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="safety" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Safety
            </TabsTrigger>
            <TabsTrigger value="standards" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Standards
            </TabsTrigger>
            <TabsTrigger value="patterns" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Patterns
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Search
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Audit
            </TabsTrigger>
          </TabsList>
          <TabsContent value="safety" className="mt-0">
            <SafetyControlsConfig projectId={projectId} isEmbedded />
          </TabsContent>
          <TabsContent value="standards" className="mt-0">
            <QAStandardsManager projectId={projectId} isEmbedded />
          </TabsContent>
          <TabsContent value="patterns" className="mt-0">
            <QAPatternsManager projectId={projectId} isEmbedded />
          </TabsContent>
          <TabsContent value="search" className="mt-0">
            <QASemanticSearch projectId={projectId} isEmbedded />
          </TabsContent>
          <TabsContent value="audit" className="mt-0">
            <AIAuditDashboard projectId={projectId} isEmbedded />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
