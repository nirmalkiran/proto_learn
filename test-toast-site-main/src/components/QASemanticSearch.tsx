import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, FileText, TestTube, Code, Loader2, ExternalLink, ThumbsUp } from "lucide-react";

interface SearchResult {
  id: string;
  project_id: string;
  artifact_type: string;
  artifact_id: string;
  content: string;
  metadata: any;
  is_approved: boolean;
  similarity: number;
}

interface QASemanticSearchProps {
  projectId: string;
  isEmbedded?: boolean;
}

export const QASemanticSearch = ({ projectId, isEmbedded }: QASemanticSearchProps) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [threshold, setThreshold] = useState([0.7]);
  const [maxResults, setMaxResults] = useState("10");
  const [artifactFilter, setArtifactFilter] = useState("all");

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Search Query Required",
        description: "Please enter a search query",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('semantic-search', {
        body: {
          query: searchQuery,
          projectId,
          threshold: threshold[0],
          maxResults: parseInt(maxResults),
          artifactType: artifactFilter === "all" ? undefined : artifactFilter,
        },
      });

      if (error) throw error;

      if (data.success && data.results) {
        setResults(data.results);
        if (data.results.length === 0) {
          toast({
            title: "No Results",
            description: "No matching artifacts found. Try adjusting your search query or lowering the similarity threshold.",
          });
        }
      } else {
        throw new Error(data.error || "Search failed");
      }
    } catch (error: any) {
      console.error("Search error:", error);
      toast({
        title: "Search Failed",
        description: error.message || "Failed to perform semantic search",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case "test_case":
        return <TestTube className="h-4 w-4" />;
      case "automation":
        return <Code className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getArtifactColor = (type: string) => {
    switch (type) {
      case "test_case":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "automation":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.8) return "text-green-500";
    if (similarity >= 0.6) return "text-yellow-500";
    return "text-orange-500";
  };

  const content = (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search QA artifacts using natural language..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button onClick={handleSearch} disabled={isSearching}>
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-2">Search</span>
          </Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Artifact Type</Label>
            <Select value={artifactFilter} onValueChange={setArtifactFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="test_case">Test Cases</SelectItem>
                <SelectItem value="automation">Automation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Max Results</Label>
            <Select value={maxResults} onValueChange={setMaxResults}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 results</SelectItem>
                <SelectItem value="10">10 results</SelectItem>
                <SelectItem value="20">20 results</SelectItem>
                <SelectItem value="50">50 results</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Similarity Threshold: {(threshold[0] * 100).toFixed(0)}%</Label>
            <Slider
              value={threshold}
              onValueChange={setThreshold}
              min={0.5}
              max={0.95}
              step={0.05}
              className="py-2"
            />
            <p className="text-xs text-muted-foreground">
              Higher = more relevant results only
            </p>
          </div>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Results ({results.length})
            </h3>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {results.map((result) => (
              <Card key={result.id} className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge 
                          variant="outline" 
                          className={`flex items-center gap-1 ${getArtifactColor(result.artifact_type)}`}
                        >
                          {getArtifactIcon(result.artifact_type)}
                          {result.artifact_type.replace("_", " ")}
                        </Badge>
                        {result.is_approved && (
                          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                            <ThumbsUp className="h-3 w-3 mr-1" />
                            Approved
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                        {result.content}
                      </p>

                      {result.metadata && Object.keys(result.metadata).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {result.metadata.title && (
                            <Badge variant="secondary" className="text-xs">
                              {result.metadata.title}
                            </Badge>
                          )}
                          {result.metadata.priority && (
                            <Badge variant="secondary" className="text-xs">
                              {result.metadata.priority}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className={`text-lg font-bold ${getSimilarityColor(result.similarity)}`}>
                        {(result.similarity * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs text-muted-foreground">match</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {results.length === 0 && !isSearching && searchQuery && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No results found. Try a different search query.</p>
        </div>
      )}

      {/* Initial State */}
      {results.length === 0 && !searchQuery && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">Semantic Search</p>
          <p className="text-sm">
            Search across all approved QA artifacts using natural language.
            <br />
            Find similar test cases, automation patterns, and more.
          </p>
        </div>
      )}
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
          <CardTitle>Semantic Search</CardTitle>
        </div>
        <CardDescription>
          Search across approved QA artifacts using natural language
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
};
