import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TestCases } from "@/components/TestCases";
import { TestRuns } from "@/components/TestRuns";
import { FileText, Play } from "lucide-react";

interface TestCasesWithTabsProps {
  projectId: string;
}

export const TestCasesWithTabs = ({ projectId }: TestCasesWithTabsProps) => {
  const [activeTab, setActiveTab] = useState("test-cases");

  return (
    <div className="h-[calc(100vh-180px)] flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b border-border px-4">
          <TabsList className="h-12 bg-transparent p-0 gap-4">
            <TabsTrigger
              value="test-cases"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-3 gap-2"
            >
              <FileText className="h-4 w-4" />
              Test Cases
            </TabsTrigger>
            <TabsTrigger
              value="test-runs"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-3 gap-2"
            >
              <Play className="h-4 w-4" />
              Test Runs
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="test-cases" className="flex-1 mt-0 p-4">
          <TestCases projectId={projectId} />
        </TabsContent>
        
        <TabsContent value="test-runs" className="flex-1 mt-0 p-4">
          <TestRuns projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
