import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Search, Sparkles, BookOpen, FileText, Code, Bug, RefreshCw, Eye, Copy, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface QASearchResult {
  id: string;
  content_type: string;
  title: string;
  content: string;
  metadata: any;
  similarity_score: number;
  created_at: string;
  project_id: string;
}

interface QASemanticSearchProps {
  projectId: string;
  isEmbedded?: boolean;
}

const CONTENT_TYPES = [
  { value: "test_case", label: "Test Cases", icon: FileText },
  { value: "automation_script", label: "Automation Scripts", icon: Code },
  { value: "defect_report", label: "Defect Reports", icon: Bug },
  { value: "pattern", label: "QA Patterns", icon: Sparkles },
  { value: "standard", label: "QA Standards", icon: BookOpen },
];

export const QASemanticSearch = ({ projectId, isEmbedded = false }: QASemanticSearchProps) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("all");
  const [searchResults, setSearchResults] = useState<QASearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<QASearchResult | null>(null);
  const [showResultDialog, setShowResultDialog] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Search query required",
        description: "Please enter a search query",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      // Call the semantic search function
      const { data, error } = await supabase.functions.invoke('semantic-search', {
        body: {
          query: searchQuery,
          project_id: projectId,
          content_type: contentTypeFilter === "all" ? null : contentTypeFilter,
          limit: 20,
        },
      });

      if (error) throw error;
      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Error performing semantic search:", error);
      toast({
        title: "Search failed",
        description: "Failed to perform semantic search",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const getContentTypeIcon = (type: string) => {
    const contentType = CONTENT_TYPES.find(ct => ct.value === type);
    return contentType ? contentType.icon : FileText;
  };

  const getContentTypeLabel = (type: string) => {
    const contentType = CONTENT_TYPES.find(ct => ct.value === type);
    return contentType ? contentType.label : type;
  };

  const getSimilarityColor = (score: number) => {
    if (score >= 0.8) return "text-green-600 bg-green-50";
    if (score >= 0.6) return "text-blue-600 bg-blue-50";
    if (score >= 0.4) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  const truncateContent = (content: string, maxLength: number = 200) => {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "...";
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: "Content copied successfully",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const renderResultContent = (result: QASearchResult) => {
    switch (result.content_type) {
      case "test_case":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Test Case Title</Label>
              <p className="text-sm">{result.title}</p>
            </div>
            {result.metadata?.steps && (
              <div>
                <Label className="text-sm font-medium">Steps</Label>
                <ol className="text-sm list-decimal list-inside space-y-1 mt-1">
                  {result.metadata.steps.map((step: string, idx: number) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
            {result.metadata?.expected_result && (
              <div>
                <Label className="text-sm font-medium">Expected Result</Label>
                <p className="text-sm">{result.metadata.expected_result}</p>
              </div>
            )}
          </div>
        );

      case "automation_script":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Script Title</Label>
              <p className="text-sm">{result.title}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Language</Label>
              <p className="text-sm">{result.metadata?.language || "Unknown"}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Code</Label>
              <pre className="text-sm bg-muted p-3 rounded-md overflow-x-auto max-h-60">
                {result.content}
              </pre>
            </div>
          </div>
        );

      case "defect_report":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Defect Title</Label>
              <p className="text-sm">{result.title}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Severity</Label>
              <Badge variant="outline">{result.metadata?.severity || "Unknown"}</Badge>
            </div>
            <div>
              <Label className="text-sm font-medium">Description</Label>
              <p className="text-sm">{result.content}</p>
            </div>
            {result.metadata?.steps_to_reproduce && (
              <div>
                <Label className="text-sm font-medium">Steps to Reproduce</Label>
                <ol className="text-sm list-decimal list-inside space-y-1 mt-1">
                  {result.metadata.steps_to_reproduce.map((step: string, idx: number) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        );

      case "pattern":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Pattern Name</Label>
              <p className="text-sm">{result.title}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Type</Label>
              <Badge variant="outline">{result.metadata?.pattern_type || "Unknown"}</Badge>
            </div>
            <div>
              <Label className="text-sm font-medium">Pattern Content</Label>
              <pre className="text-sm bg-muted p-3 rounded-md overflow-x-auto max-h-60">
                {typeof result.content === "string" ? result.content : JSON.stringify(result.content, null, 2)}
              </pre>
            </div>
          </div>
        );

      case "standard":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Standard Name</Label>
              <p className="text-sm">{result.title}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Category</Label>
              <Badge variant="outline">{result.metadata?.category || "Unknown"}</Badge>
            </div>
            <div>
              <Label className="text-sm font-medium">Description</Label>
              <p className="text-sm">{result.content}</p>
            </div>
          </div>
        );

      default:
        return (
          <div>
            <Label className="text-sm font-medium">Content</Label>
            <pre className="text-sm bg-muted p-3 rounded-md overflow-x-auto max-h-60 mt-1">
              {typeof result.content === "string" ? result.content : JSON.stringify(result.content, null, 2)}
            </pre>
          </div>
        );
    }
  };

  const content = (
    <div className="space-y-4">
      {/* Search Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search QA content semantically (e.g., 'login validation', 'API error handling')..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            className="pl-9"
          />
        </div>
        <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Content type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {CONTENT_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>
                <div className="flex items-center gap-2">
                  <type.icon className="h-4 w-4" />
                  {type.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
          {isSearching ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Search
            </>
          )}
        </Button>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 ? (
        <ScrollArea className={isEmbedded ? "h-[400px]" : "h-[600px]"}>
          <div className="space-y-3">
            {searchResults.map(result => {
              const IconComponent = getContentTypeIcon(result.content_type);
              return (
                <Card key={result.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <IconComponent className="h-4 w-4 text-primary" />
                          <h4 className="font-medium">{result.title}</h4>
                          <Badge variant="outline">{getContentTypeLabel(result.content_type)}</Badge>
                          <Badge className={getSimilarityColor(result.similarity_score)}>
                            {Math.round(result.similarity_score * 100)}% match
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {truncateContent(result.content)}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Created {format(new Date(result.created_at), "MMM d, yyyy")}</span>
                          {result.metadata?.tags && result.metadata.tags.length > 0 && (
                            <>
                              <Separator orientation="vertical" className="h-3" />
                              <div className="flex gap-1">
                                {result.metadata.tags.slice(0, 3).map((tag: string, idx: number) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {result.metadata.tags.length > 3 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{result.metadata.tags.length - 3}
                                  </Badge>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedResult(result);
                            setShowResultDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(result.content)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      ) : searchQuery && !isSearching ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No results found for "{searchQuery}"
            </p>
            <p className="text-sm text-muted-foreground text-center mt-2">
              Try adjusting your search query or content type filter
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Enter a search query to find relevant QA content
            </p>
            <p className="text-sm text-muted-foreground text-center mt-2">
              Use natural language to search through test cases, automation scripts, defect reports, and QA patterns
            </p>
          </CardContent>
        </Card>
      )}

      {/* Result Detail Dialog */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedResult && (
                <>
                  {React.createElement(getContentTypeIcon(selectedResult.content_type), { className: "h-5 w-5" })}
                  {selectedResult.title}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedResult && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline">{getContentTypeLabel(selectedResult.content_type)}</Badge>
                  <Badge className={getSimilarityColor(selectedResult.similarity_score)}>
                    {Math.round(selectedResult.similarity_score * 100)}% similarity match
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Created {format(new Date(selectedResult.created_at), "PPP")}
                  </span>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {selectedResult && renderResultContent(selectedResult)}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResultDialog(false)}>
              Close
            </Button>
            {selectedResult && (
              <Button onClick={() => copyToClipboard(selectedResult.content)}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Content
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (isEmbedded) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          <CardTitle>QA Semantic Search</CardTitle>
        </div>
        <CardDescription>
          Search through QA content using natural language and AI-powered semantic matching
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
};
