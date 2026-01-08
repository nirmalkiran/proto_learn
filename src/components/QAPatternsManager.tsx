import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Edit, Sparkles, Globe, Tag, Search, RefreshCw, CheckCircle2, XCircle, Download, Power, PowerOff } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";

interface QAPattern {
  id: string;
  pattern_name: string;
  pattern_type: string;
  pattern_content: any;
  description: string | null;
  is_global: boolean;
  project_ids: string[];
  tags: string[];
  success_count: number;
  failure_count: number;
  confidence_score: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface QAPatternsManagerProps {
  projectId: string;
  isEmbedded?: boolean;
}

const PATTERN_TYPES = [
  { value: "test_case", label: "Test Case Pattern" },
  { value: "automation_step", label: "Automation Step Pattern" },
  { value: "defect_template", label: "Defect Template" },
  { value: "assertion", label: "Assertion Pattern" },
  { value: "selector", label: "Selector Strategy" },
];

// Preset patterns that users can import
const PRESET_PATTERNS = [
  {
    pattern_name: "Login Authentication Flow",
    pattern_type: "test_case",
    description: "Standard test case pattern for login/authentication testing including positive, negative, and edge cases",
    pattern_content: {
      template: "Test login with valid/invalid credentials, session management, remember me, password visibility toggle",
      scenarios: ["Valid login", "Invalid password", "Invalid username", "Empty fields", "SQL injection", "Session timeout", "Concurrent logins"]
    },
    tags: ["login", "authentication", "security"],
    confidence_score: 0.85
  },
  {
    pattern_name: "Form Validation Pattern",
    pattern_type: "test_case",
    description: "Comprehensive form validation testing including field types, boundaries, and error messages",
    pattern_content: {
      template: "Test all form fields with valid/invalid data, boundary values, required field validation, error message display",
      scenarios: ["Required fields", "Email format", "Phone format", "Min/Max length", "Special characters", "Numeric only", "Copy-paste behavior"]
    },
    tags: ["form", "validation", "input"],
    confidence_score: 0.82
  },
  {
    pattern_name: "CRUD Operations Pattern",
    pattern_type: "test_case",
    description: "Standard CRUD (Create, Read, Update, Delete) testing pattern for data management features",
    pattern_content: {
      template: "Test create, read, update, delete operations with various data scenarios and permission checks",
      scenarios: ["Create with valid data", "Create with invalid data", "Read single/multiple", "Update existing", "Partial update", "Delete single", "Bulk delete", "Permission denied"]
    },
    tags: ["crud", "data", "operations"],
    confidence_score: 0.88
  },
  {
    pattern_name: "API Response Validation",
    pattern_type: "assertion",
    description: "Standard assertions for API testing including status codes, response structure, and error handling",
    pattern_content: {
      assertions: ["Status code 200/201/400/401/403/404/500", "Response time < threshold", "JSON schema validation", "Required fields present", "Data type validation", "Error message format"]
    },
    tags: ["api", "assertion", "validation"],
    confidence_score: 0.90
  },
  {
    pattern_name: "UI Element Selector Strategy",
    pattern_type: "selector",
    description: "Best practices for selecting UI elements in automation - prioritize data-testid, then aria-labels, then CSS",
    pattern_content: {
      priority: ["data-testid", "aria-label", "id", "name", "css selector", "xpath"],
      avoid: ["Absolute xpath", "Index-based selectors", "Generated class names"],
      examples: ["[data-testid='submit-btn']", "[aria-label='Close dialog']", "#login-form"]
    },
    tags: ["selector", "automation", "ui"],
    confidence_score: 0.92
  },
  {
    pattern_name: "Wait and Retry Strategy",
    pattern_type: "automation_step",
    description: "Robust waiting and retry patterns for handling async operations and flaky elements",
    pattern_content: {
      strategies: ["Explicit wait for element visible", "Wait for network idle", "Retry on stale element", "Polling with timeout"],
      maxRetries: 3,
      defaultTimeout: 30000
    },
    tags: ["wait", "retry", "stability"],
    confidence_score: 0.87
  },
  {
    pattern_name: "Defect Report Template",
    pattern_type: "defect_template",
    description: "Standardized defect report format with severity classification and reproduction steps",
    pattern_content: {
      sections: ["Summary", "Environment", "Steps to Reproduce", "Expected Result", "Actual Result", "Attachments"],
      severityLevels: ["Critical - System unusable", "High - Major feature broken", "Medium - Feature impaired", "Low - Minor issue"],
      requiredFields: ["Summary", "Steps to Reproduce", "Expected vs Actual"]
    },
    tags: ["defect", "bug", "template"],
    confidence_score: 0.85
  },
  {
    pattern_name: "Pagination Testing Pattern",
    pattern_type: "test_case",
    description: "Testing pattern for pagination functionality including navigation, page size, and edge cases",
    pattern_content: {
      scenarios: ["First page load", "Navigate to next/previous", "Go to specific page", "Change page size", "Empty results", "Single page", "Large dataset", "URL state sync"]
    },
    tags: ["pagination", "navigation", "ui"],
    confidence_score: 0.80
  },
  {
    pattern_name: "Search and Filter Pattern",
    pattern_type: "test_case",
    description: "Comprehensive testing pattern for search and filter functionality",
    pattern_content: {
      scenarios: ["Basic search", "Advanced filters", "Combined filters", "Clear filters", "No results", "Special characters", "Case sensitivity", "Search suggestions", "Filter persistence"]
    },
    tags: ["search", "filter", "query"],
    confidence_score: 0.83
  },
  {
    pattern_name: "File Upload Pattern",
    pattern_type: "test_case",
    description: "Testing pattern for file upload functionality including various file types and sizes",
    pattern_content: {
      scenarios: ["Valid file type", "Invalid file type", "Max file size", "Multiple files", "Drag and drop", "Cancel upload", "Progress indicator", "Error handling", "Virus scan"]
    },
    tags: ["upload", "file", "attachment"],
    confidence_score: 0.81
  }
];

export const QAPatternsManager = ({ projectId, isEmbedded = false }: QAPatternsManagerProps) => {
  const { toast } = useToast();
  const [patterns, setPatterns] = useState<QAPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showGlobalOnly, setShowGlobalOnly] = useState(false);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<QAPattern | null>(null);
  const [patternToDelete, setPatternToDelete] = useState<string | null>(null);

  // Import dialog states
  const [selectedPresets, setSelectedPresets] = useState<Set<number>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  // Form states
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("test_case");
  const [formDescription, setFormDescription] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formIsGlobal, setFormIsGlobal] = useState(false);
  const [formTags, setFormTags] = useState("");

  useEffect(() => {
    loadPatterns();
  }, [projectId]);

  const loadPatterns = async () => {
    setIsLoading(true);
    try {
      // TODO: qa_proven_patterns table does not exist yet - using empty array
      setPatterns([]);
    } catch (error) {
      console.error("Error loading patterns:", error);
      toast({
        title: "Error",
        description: "Failed to load patterns",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Check if pattern is active for current project
  const isPatternActiveForProject = (pattern: QAPattern) => {
    return pattern.is_global || pattern.project_ids?.includes(projectId);
  };

  // Toggle pattern active state for current project
  const handleTogglePatternActive = async (pattern: QAPattern) => {
    try {
      const isCurrentlyActive = pattern.project_ids?.includes(projectId);
      let newProjectIds: string[];

      if (isCurrentlyActive) {
        // Remove project from pattern
        newProjectIds = pattern.project_ids.filter(id => id !== projectId);
      } else {
        // Add project to pattern
        newProjectIds = [...(pattern.project_ids || []), projectId];
      }

      const { error } = await supabase
        .from("qa_proven_patterns")
        .update({ project_ids: newProjectIds })
        .eq("id", pattern.id);

      if (error) throw error;

      toast({
        title: isCurrentlyActive ? "Pattern Deactivated" : "Pattern Activated",
        description: isCurrentlyActive
          ? "Pattern will no longer be used for AI generation in this project"
          : "Pattern will now be used for AI generation in this project",
      });
      loadPatterns();
    } catch (error) {
      console.error("Error toggling pattern:", error);
      toast({
        title: "Error",
        description: "Failed to update pattern status",
        variant: "destructive",
      });
    }
  };

  // Import selected preset patterns
  const handleImportPresets = async () => {
    if (selectedPresets.size === 0) {
      toast({
        title: "No patterns selected",
        description: "Please select at least one pattern to import",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const patternsToImport = Array.from(selectedPresets).map(index => {
        const preset = PRESET_PATTERNS[index];
        return {
          pattern_name: preset.pattern_name,
          pattern_type: preset.pattern_type,
          pattern_content: preset.pattern_content,
          description: preset.description,
          is_global: false,
          project_ids: [projectId],
          tags: preset.tags,
          confidence_score: preset.confidence_score,
          created_by: user.id,
        };
      });

      const { error } = await supabase
        .from("qa_proven_patterns")
        .insert(patternsToImport);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Imported ${patternsToImport.length} pattern(s) successfully`,
      });
      setShowImportDialog(false);
      setSelectedPresets(new Set());
      loadPatterns();
    } catch (error) {
      console.error("Error importing patterns:", error);
      toast({
        title: "Error",
        description: "Failed to import patterns",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const togglePresetSelection = (index: number) => {
    const newSelection = new Set(selectedPresets);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedPresets(newSelection);
  };

  const selectAllPresets = () => {
    if (selectedPresets.size === PRESET_PATTERNS.length) {
      setSelectedPresets(new Set());
    } else {
      setSelectedPresets(new Set(PRESET_PATTERNS.map((_, i) => i)));
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormType("test_case");
    setFormDescription("");
    setFormContent("");
    setFormIsGlobal(false);
    setFormTags("");
  };

  const handleCreatePattern = async () => {
    if (!formName || !formContent) {
      toast({
        title: "Validation Error",
        description: "Please provide pattern name and content",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let parsedContent;
      try {
        parsedContent = JSON.parse(formContent);
      } catch {
        parsedContent = { raw: formContent };
      }

      const tagsArray = formTags.split(",").map(t => t.trim()).filter(Boolean);

      const { error } = await supabase.from("qa_proven_patterns").insert({
        pattern_name: formName,
        pattern_type: formType,
        pattern_content: parsedContent,
        description: formDescription || null,
        is_global: formIsGlobal,
        project_ids: [projectId],
        tags: tagsArray,
        created_by: user.id,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Pattern created successfully",
      });
      setShowCreateDialog(false);
      resetForm();
      loadPatterns();
    } catch (error) {
      console.error("Error creating pattern:", error);
      toast({
        title: "Error",
        description: "Failed to create pattern",
        variant: "destructive",
      });
    }
  };

  const handleEditPattern = (pattern: QAPattern) => {
    setSelectedPattern(pattern);
    setFormName(pattern.pattern_name);
    setFormType(pattern.pattern_type);
    setFormDescription(pattern.description || "");
    setFormContent(JSON.stringify(pattern.pattern_content, null, 2));
    setFormIsGlobal(pattern.is_global);
    setFormTags(pattern.tags?.join(", ") || "");
    setShowEditDialog(true);
  };

  const handleUpdatePattern = async () => {
    if (!selectedPattern || !formName || !formContent) {
      toast({
        title: "Validation Error",
        description: "Please provide pattern name and content",
        variant: "destructive",
      });
      return;
    }

    try {
      let parsedContent;
      try {
        parsedContent = JSON.parse(formContent);
      } catch {
        parsedContent = { raw: formContent };
      }

      const tagsArray = formTags.split(",").map(t => t.trim()).filter(Boolean);

      const { error } = await supabase
        .from("qa_proven_patterns")
        .update({
          pattern_name: formName,
          pattern_type: formType,
          pattern_content: parsedContent,
          description: formDescription || null,
          is_global: formIsGlobal,
          tags: tagsArray,
        })
        .eq("id", selectedPattern.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Pattern updated successfully",
      });
      setShowEditDialog(false);
      setSelectedPattern(null);
      resetForm();
      loadPatterns();
    } catch (error) {
      console.error("Error updating pattern:", error);
      toast({
        title: "Error",
        description: "Failed to update pattern",
        variant: "destructive",
      });
    }
  };

  const handleDeletePattern = async (patternId: string) => {
    try {
      const { error } = await supabase
        .from("qa_proven_patterns")
        .delete()
        .eq("id", patternId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Pattern deleted successfully",
      });
      loadPatterns();
    } catch (error) {
      console.error("Error deleting pattern:", error);
      toast({
        title: "Error",
        description: "Failed to delete pattern",
        variant: "destructive",
      });
    }
  };

  const filteredPatterns = patterns.filter(pattern => {
    // Only show patterns that are global OR belong to the current project
    const belongsToProject = pattern.is_global || pattern.project_ids?.includes(projectId);
    if (!belongsToProject) return false;

    const matchesSearch = pattern.pattern_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pattern.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pattern.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = filterType === "all" || pattern.pattern_type === filterType;
    const matchesGlobal = !showGlobalOnly || pattern.is_global;
    return matchesSearch && matchesType && matchesGlobal;
  });

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return "text-green-500";
    if (score >= 0.5) return "text-yellow-500";
    return "text-red-500";
  };

  const getTypeLabel = (type: string) => {
    return PATTERN_TYPES.find(t => t.value === type)?.label || type;
  };

  const content = (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patterns by name, description, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {PATTERN_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="global-filter"
            checked={showGlobalOnly}
            onCheckedChange={setShowGlobalOnly}
          />
          <Label htmlFor="global-filter" className="text-sm">Global only</Label>
        </div>
        <Button variant="outline" size="icon" onClick={loadPatterns}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={() => setShowImportDialog(true)}>
          <Download className="h-4 w-4 mr-2" />
          Import Presets
        </Button>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              New Pattern
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Pattern</DialogTitle>
              <DialogDescription>
                Define a reusable QA pattern for test cases, automation steps, or defect templates.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pattern Name *</Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Login Flow Test Pattern"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pattern Type</Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PATTERN_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Describe when and how to use this pattern..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Pattern Content (JSON or text) *</Label>
                <Textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder='{"steps": [...], "assertions": [...]}'
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Tags (comma-separated)</Label>
                <Input
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="e.g., login, authentication, security"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="is-global"
                  checked={formIsGlobal}
                  onCheckedChange={setFormIsGlobal}
                />
                <Label htmlFor="is-global">Make this pattern global (available to all projects)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button onClick={handleCreatePattern}>Create Pattern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Patterns List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredPatterns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {patterns.length === 0
                ? "No patterns yet. Create your first pattern to get started."
                : "No patterns match your filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className={isEmbedded ? "h-[400px]" : "h-[600px]"}>
          <div className="space-y-3">
            {filteredPatterns.map(pattern => {
              const totalUsage = pattern.success_count + pattern.failure_count;
              const successRate = totalUsage > 0 ? (pattern.success_count / totalUsage) * 100 : 0;

              return (
                <Card key={pattern.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{pattern.pattern_name}</h4>
                          {pattern.is_global ? (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              Global
                            </Badge>
                          ) : pattern.project_ids?.includes(projectId) ? (
                            <Badge className="flex items-center gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                              <Power className="h-3 w-3" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="flex items-center gap-1 text-muted-foreground">
                              <PowerOff className="h-3 w-3" />
                              Inactive
                            </Badge>
                          )}
                          <Badge variant="outline">{getTypeLabel(pattern.pattern_type)}</Badge>
                        </div>
                        {pattern.description && (
                          <p className="text-sm text-muted-foreground mb-2">{pattern.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {pattern.tags?.map((tag, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <span className={`font-medium ${getConfidenceColor(pattern.confidence_score)}`}>
                              {Math.round(pattern.confidence_score * 100)}%
                            </span>
                            <span className="text-muted-foreground">confidence</span>
                          </div>
                          <Separator orientation="vertical" className="h-4" />
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span>{pattern.success_count}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <XCircle className="h-4 w-4 text-red-500" />
                            <span>{pattern.failure_count}</span>
                          </div>
                          {totalUsage > 0 && (
                            <>
                              <Separator orientation="vertical" className="h-4" />
                              <div className="flex items-center gap-2 flex-1 max-w-[150px]">
                                <Progress value={successRate} className="h-2" />
                                <span className="text-xs text-muted-foreground">{Math.round(successRate)}%</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!pattern.is_global && (
                          <Button
                            variant={pattern.project_ids?.includes(projectId) ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleTogglePatternActive(pattern)}
                            className="gap-1"
                            title={pattern.project_ids?.includes(projectId) ? "Deactivate for this project" : "Activate for this project"}
                          >
                            {pattern.project_ids?.includes(projectId) ? (
                              <>
                                <Power className="h-3 w-3" />
                                Active
                              </>
                            ) : (
                              <>
                                <PowerOff className="h-3 w-3" />
                                Activate
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditPattern(pattern)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPatternToDelete(pattern.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Pattern</DialogTitle>
            <DialogDescription>
              Update the pattern details and content.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pattern Name *</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Pattern Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PATTERN_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Pattern Content (JSON or text) *</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={6}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Tags (comma-separated)</Label>
              <Input
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="edit-is-global"
                checked={formIsGlobal}
                onCheckedChange={setFormIsGlobal}
              />
              <Label htmlFor="edit-is-global">Make this pattern global</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setSelectedPattern(null); }}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePattern}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!patternToDelete} onOpenChange={() => setPatternToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pattern</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this pattern? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (patternToDelete) {
                  handleDeletePattern(patternToDelete);
                  setPatternToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Presets Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Import Preset Patterns
            </DialogTitle>
            <DialogDescription>
              Select preset QA patterns to import into your project. These patterns will be used by AI when generating test artifacts.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground">
                {selectedPresets.size} of {PRESET_PATTERNS.length} patterns selected
              </div>
              <Button variant="outline" size="sm" onClick={selectAllPresets}>
                {selectedPresets.size === PRESET_PATTERNS.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {PRESET_PATTERNS.map((preset, index) => (
                  <Card
                    key={index}
                    className={`cursor-pointer transition-all ${selectedPresets.has(index) ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/50'}`}
                    onClick={() => togglePresetSelection(index)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedPresets.has(index)}
                          onCheckedChange={() => togglePresetSelection(index)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{preset.pattern_name}</h4>
                            <Badge variant="outline">{getTypeLabel(preset.pattern_type)}</Badge>
                            <Badge variant="secondary" className="text-xs">
                              {Math.round(preset.confidence_score * 100)}% confidence
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{preset.description}</p>
                          <div className="flex flex-wrap gap-1">
                            {preset.tags.map((tag, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                <Tag className="h-3 w-3 mr-1" />
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportDialog(false); setSelectedPresets(new Set()); }}>
              Cancel
            </Button>
            <Button onClick={handleImportPresets} disabled={selectedPresets.size === 0 || isImporting}>
              {isImporting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Import {selectedPresets.size} Pattern{selectedPresets.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
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
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>QA Proven Patterns</CardTitle>
        </div>
        <CardDescription>
          Manage reusable patterns for test cases, automation, and defect templates
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
};
