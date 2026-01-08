import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const QAInsights = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">QA Insights</h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive quality assurance metrics and analytics dashboard
        </p>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Quality Metrics Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full h-[800px] border rounded-lg overflow-hidden">
            <iframe
              src="https://app.powerbi.com/view?r=eyJrIjoiMTk0ZTg0ZGEtZmM1NS00OTMwLTg2NWEtNmIwYjdiMTRkMmYwIiwidCI6ImVhNmMwNTJjLWY5MTAtNGIwYS1hMmEwLTllNTE3OWMwZTlmYiIsImMiOjF9"
              className="w-full h-full border-0"
              title="QA Insights Dashboard"
              allowFullScreen
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};