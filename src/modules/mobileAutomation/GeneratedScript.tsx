import { Copy, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GeneratedScriptProps {
  script: string;
  onCopy: () => void;
  onDownload: () => void;
}

export default function GeneratedScript({ script, onCopy, onDownload }: GeneratedScriptProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Generated Script</CardTitle>
        {script && (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onCopy}>
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={onDownload}>
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {script ? (
          <ScrollArea className="h-[300px]">
            <pre className="bg-black text-green-400 p-4 rounded text-xs overflow-x-auto font-mono">
              {script}
            </pre>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>Script will appear after recording</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
