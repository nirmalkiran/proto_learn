import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MobileExecutionHistory() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution History</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Execution history will appear here once BrowserStack sessions complete.
        <br />
        Videos & logs are available in BrowserStack Dashboard.
      </CardContent>
    </Card>
  );
}