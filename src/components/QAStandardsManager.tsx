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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Edit, BookOpen, Search, RefreshCw, CheckCircle, XCircle, FileText, Download, Library, TrendingUp, Zap, Target, Link2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface QAStandard {
  id: string;
  name: string;
  standard_type: string;
  rules: any;
  examples: any[] | null;
  is_active: boolean | null;
  project_id: string | null;
  description?: string | null;
  version?: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface QAStandardsManagerProps {
  projectId: string;
  isEmbedded?: boolean;
}

const STANDARD_TYPES = [
  { value: "test_case_format", label: "Test Case Format" },
  { value: "naming_convention", label: "Naming Convention" },
  { value: "step_structure", label: "Step Structure" },
  { value: "assertion_rules", label: "Assertion Rules" },
  { value: "coverage_criteria", label: "Coverage Criteria" },
  { value: "defect_template", label: "Defect Template" },
];

interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  standard_type: string;
  rules: any[];
  examples: any[];
  qualityImpact: {
    consistency: number; // 0-100
    coverage: number; // 0-100
    clarity: number; // 0-100
    traceability: number; // 0-100
    description: string;
  };
}

const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: "bdd-format",
    name: "BDD Format (Given-When-Then)",
    description: "Behavior Driven Development format for writing test scenarios",
    category: "Format",
    standard_type: "step_structure",
    qualityImpact: {
      consistency: 95,
      coverage: 70,
      clarity: 90,
      traceability: 60,
      description: "Dramatically improves test readability and stakeholder communication. Best for user-facing features.",
    },
    rules: [
      { rule: "Each scenario must start with 'Given' to set up preconditions" },
      { rule: "Use 'When' to describe the action being tested" },
      { rule: "Use 'Then' to describe the expected outcome" },
      { rule: "Use 'And' or 'But' for additional steps within each section" },
      { rule: "Keep scenarios focused on a single behavior" },
      { rule: "Use concrete examples, not abstract descriptions" },
      { rule: "Avoid technical implementation details in scenarios" },
    ],
    examples: [
      { type: "good", example: "Given a registered user is on the login page\nWhen they enter valid credentials\nThen they should be redirected to the dashboard" },
      { type: "good", example: "Given a shopping cart with 3 items\nWhen the user removes one item\nThen the cart should show 2 items" },
      { type: "bad", example: "Test login functionality" },
      { type: "bad", example: "Click button and check result" },
    ],
  },
  {
    id: "ieee-829",
    name: "IEEE 829 Test Documentation",
    description: "IEEE standard for software and system test documentation",
    category: "Documentation",
    standard_type: "test_case_format",
    qualityImpact: {
      consistency: 85,
      coverage: 80,
      clarity: 85,
      traceability: 95,
      description: "Industry standard ensuring comprehensive documentation. Essential for regulated environments and audits.",
    },
    rules: [
      { rule: "Each test case must have a unique identifier" },
      { rule: "Include test case title that clearly describes the test objective" },
      { rule: "Document preconditions and setup requirements" },
      { rule: "List all test inputs and their sources" },
      { rule: "Define expected results for each test step" },
      { rule: "Specify pass/fail criteria explicitly" },
      { rule: "Include environmental requirements if applicable" },
      { rule: "Document any dependencies on other tests" },
      { rule: "Include traceability to requirements" },
    ],
    examples: [
      { type: "good", example: "TC-001: Verify successful user login with valid credentials\nPrecondition: User account exists in system\nInput: Username='testuser', Password='valid123'\nExpected: User redirected to dashboard, session created\nPass Criteria: Dashboard displayed within 3 seconds" },
      { type: "bad", example: "Test the login" },
    ],
  },
  {
    id: "iso-9001-90003",
    name: "ISO 9001/ISO 90003 Quality Management",
    description: "Quality management principles applied to software testing",
    category: "Quality",
    standard_type: "coverage_criteria",
    qualityImpact: {
      consistency: 80,
      coverage: 85,
      clarity: 75,
      traceability: 100,
      description: "Ensures full requirements traceability and audit compliance. Critical for enterprise and regulated industries.",
    },
    rules: [
      { rule: "All test cases must be traceable to documented requirements" },
      { rule: "Test procedures must be documented and version controlled" },
      { rule: "Non-conformities must be recorded and tracked to resolution" },
      { rule: "Test evidence must be preserved and accessible" },
      { rule: "Regular review of test effectiveness required" },
      { rule: "Continuous improvement through defect analysis" },
      { rule: "Customer requirements must drive test prioritization" },
      { rule: "Risk-based approach to test coverage" },
    ],
    examples: [
      { type: "good", example: "Test case linked to REQ-001 with traceability matrix updated\nDefect DEF-123 traced to root cause with corrective action\nTest results archived with audit trail" },
      { type: "bad", example: "Ad-hoc testing without documentation\nDefects fixed without root cause analysis" },
    ],
  },
  {
    id: "iso-25000-square",
    name: "ISO/IEC 25000 SQuaRE",
    description: "Software product Quality Requirements and Evaluation",
    category: "Quality",
    standard_type: "coverage_criteria",
    qualityImpact: {
      consistency: 75,
      coverage: 100,
      clarity: 80,
      traceability: 85,
      description: "Comprehensive quality model covering all 8 product quality characteristics. Maximizes test coverage breadth.",
    },
    rules: [
      { rule: "Evaluate functional suitability: completeness, correctness, appropriateness" },
      { rule: "Test performance efficiency: time behavior, resource utilization, capacity" },
      { rule: "Verify compatibility: co-existence, interoperability" },
      { rule: "Assess usability: learnability, operability, error protection, accessibility" },
      { rule: "Test reliability: maturity, availability, fault tolerance, recoverability" },
      { rule: "Evaluate security: confidentiality, integrity, non-repudiation, authenticity" },
      { rule: "Check maintainability: modularity, reusability, analyzability, modifiability" },
      { rule: "Assess portability: adaptability, installability, replaceability" },
    ],
    examples: [
      { type: "category", name: "Functional Suitability", example: "Verify all specified functions are implemented and produce correct results" },
      { type: "category", name: "Performance", example: "Response time under load, memory usage during operations" },
      { type: "category", name: "Security", example: "Authentication bypass attempts, data encryption verification" },
    ],
  },
  {
    id: "cmmi",
    name: "CMMI (Capability Maturity Model Integration)",
    description: "Process improvement approach for developing and maintaining products",
    category: "Process",
    standard_type: "coverage_criteria",
    qualityImpact: {
      consistency: 90,
      coverage: 85,
      clarity: 70,
      traceability: 90,
      description: "Establishes mature, measurable processes. Improves defect detection rates and process predictability.",
    },
    rules: [
      { rule: "Define and document test process with clear entry/exit criteria" },
      { rule: "Establish measurable quality objectives for testing" },
      { rule: "Implement peer reviews for test cases before execution" },
      { rule: "Track and analyze defect metrics (density, removal efficiency)" },
      { rule: "Maintain test case repository with version control" },
      { rule: "Conduct root cause analysis for escaped defects" },
      { rule: "Define test coverage metrics and track achievement" },
      { rule: "Implement lessons learned process after each test cycle" },
      { rule: "Establish quantitative process management for testing" },
      { rule: "Test automation strategy aligned with business goals" },
    ],
    examples: [
      { type: "metric", name: "Defect Density", example: "Defects per KLOC or per function point" },
      { type: "metric", name: "Test Coverage", example: "Requirements coverage, code coverage percentages" },
      { type: "metric", name: "Defect Removal Efficiency", example: "(Defects found in testing / Total defects) * 100" },
    ],
  },
  {
    id: "tmmi",
    name: "TMMi (Test Maturity Model Integration)",
    description: "Test process improvement model aligned with CMMI",
    category: "Process",
    standard_type: "test_case_format",
    qualityImpact: {
      consistency: 85,
      coverage: 90,
      clarity: 80,
      traceability: 85,
      description: "Test-specific maturity model. Optimizes test automation strategy and overall testing effectiveness.",
    },
    rules: [
      { rule: "Test policy and strategy must be documented and communicated" },
      { rule: "Test planning integrated with project planning" },
      { rule: "Test design techniques applied systematically" },
      { rule: "Test environment managed and controlled" },
      { rule: "Defect lifecycle defined with clear states and transitions" },
      { rule: "Test metrics defined, collected, and analyzed" },
      { rule: "Test process optimized through statistical process control" },
      { rule: "Continuous process improvement based on quantitative data" },
      { rule: "Test automation strategy aligned with business goals" },
    ],
    examples: [
      { type: "level", name: "Level 2 - Managed", example: "Test planning, monitoring, design, execution defined per project" },
      { type: "level", name: "Level 3 - Defined", example: "Organization-wide test process, training, peer reviews" },
      { type: "level", name: "Level 4 - Measured", example: "Quantitative test process management, quality evaluation" },
      { type: "level", name: "Level 5 - Optimization", example: "Defect prevention, continuous process improvement" },
    ],
  },
];
export const QAStandardsManager = ({ projectId, isEmbedded = false }: QAStandardsManagerProps) => {
  const { toast } = useToast();
  const [standards, setStandards] = useState<QAStandard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);
  const [selectedStandard, setSelectedStandard] = useState<QAStandard | null>(null);
  const [standardToDelete, setStandardToDelete] = useState<string | null>(null);
  const [importingTemplate, setImportingTemplate] = useState<string | null>(null);
  
  // Form states
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("test_case_format");
  const [formRules, setFormRules] = useState("");
  const [formExamples, setFormExamples] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  useEffect(() => {
    loadStandards();
  }, [projectId]);

  const loadStandards = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("qa_standards")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setStandards((data || []) as QAStandard[]);
    } catch (error) {
      console.error("Error loading standards:", error);
      toast({
        title: "Error",
        description: "Failed to load standards",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormType("test_case_format");
    setFormRules("");
    setFormExamples("");
    setFormIsActive(true);
  };

  const handleCreateStandard = async () => {
    if (!formName || !formRules) {
      toast({
        title: "Validation Error",
        description: "Please provide standard name and rules",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let parsedRules;
      try {
        parsedRules = JSON.parse(formRules);
      } catch {
        // If not valid JSON, wrap as an array of rule strings
        parsedRules = formRules.split("\n").filter(r => r.trim()).map(r => ({ rule: r.trim() }));
      }

      let parsedExamples: any[] = [];
      if (formExamples.trim()) {
        try {
          parsedExamples = JSON.parse(formExamples);
          if (!Array.isArray(parsedExamples)) {
            parsedExamples = [parsedExamples];
          }
        } catch {
          parsedExamples = formExamples.split("\n").filter(e => e.trim()).map(e => ({ example: e.trim() }));
        }
      }

      const { error } = await supabase.from("qa_standards").insert({
        name: formName,
        standard_type: formType,
        rules: parsedRules,
        examples: parsedExamples,
        is_active: formIsActive,
        project_id: projectId,
        user_id: user.id,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Standard created successfully",
      });
      setShowCreateDialog(false);
      resetForm();
      loadStandards();
    } catch (error) {
      console.error("Error creating standard:", error);
      toast({
        title: "Error",
        description: "Failed to create standard",
        variant: "destructive",
      });
    }
  };

  const handleEditStandard = (standard: QAStandard) => {
    setSelectedStandard(standard);
    setFormName(standard.name);
    setFormType(standard.standard_type);
    setFormRules(JSON.stringify(standard.rules, null, 2));
    setFormExamples(JSON.stringify(standard.examples || [], null, 2));
    setFormIsActive(standard.is_active);
    setShowEditDialog(true);
  };

  const handleUpdateStandard = async () => {
    if (!selectedStandard || !formName || !formRules) {
      toast({
        title: "Validation Error",
        description: "Please provide standard name and rules",
        variant: "destructive",
      });
      return;
    }

    try {
      let parsedRules;
      try {
        parsedRules = JSON.parse(formRules);
      } catch {
        parsedRules = formRules.split("\n").filter(r => r.trim()).map(r => ({ rule: r.trim() }));
      }

      let parsedExamples: any[] = [];
      if (formExamples.trim()) {
        try {
          parsedExamples = JSON.parse(formExamples);
          if (!Array.isArray(parsedExamples)) {
            parsedExamples = [parsedExamples];
          }
        } catch {
          parsedExamples = formExamples.split("\n").filter(e => e.trim()).map(e => ({ example: e.trim() }));
        }
      }

      const { error } = await supabase
        .from("qa_standards")
        .update({
          name: formName,
          standard_type: formType,
          rules: parsedRules,
          examples: parsedExamples,
          is_active: formIsActive,
        })
        .eq("id", selectedStandard.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Standard updated successfully",
      });
      setShowEditDialog(false);
      setSelectedStandard(null);
      resetForm();
      loadStandards();
    } catch (error) {
      console.error("Error updating standard:", error);
      toast({
        title: "Error",
        description: "Failed to update standard",
        variant: "destructive",
      });
    }
  };

  const handleDeleteStandard = async (standardId: string) => {
    try {
      const { error } = await supabase
        .from("qa_standards")
        .delete()
        .eq("id", standardId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Standard deleted successfully",
      });
      setStandardToDelete(null);
      loadStandards();
    } catch (error) {
      console.error("Error deleting standard:", error);
      toast({
        title: "Error",
        description: "Failed to delete standard",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (standard: QAStandard) => {
    try {
      const { error } = await supabase
        .from("qa_standards")
        .update({ is_active: !standard.is_active })
        .eq("id", standard.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Standard ${standard.is_active ? "deactivated" : "activated"}`,
      });
      loadStandards();
    } catch (error) {
      console.error("Error toggling standard:", error);
      toast({
        title: "Error",
        description: "Failed to update standard",
        variant: "destructive",
      });
    }
  };

  const handleImportTemplate = async (template: PresetTemplate) => {
    setImportingTemplate(template.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if template already exists
      const existingStandard = standards.find(s => s.name === template.name);
      if (existingStandard) {
        toast({
          title: "Already Imported",
          description: `"${template.name}" is already in your standards`,
          variant: "destructive",
        });
        setImportingTemplate(null);
        return;
      }

      const { error } = await supabase.from("qa_standards").insert({
        name: template.name,
        standard_type: template.standard_type,
        rules: template.rules,
        examples: template.examples,
        is_active: true,
        project_id: projectId,
        user_id: user.id,
      });

      if (error) throw error;

      toast({
        title: "Template Imported",
        description: `"${template.name}" has been added to your standards`,
      });
      loadStandards();
    } catch (error) {
      console.error("Error importing template:", error);
      toast({
        title: "Error",
        description: "Failed to import template",
        variant: "destructive",
      });
    } finally {
      setImportingTemplate(null);
    }
  };

  const isTemplateImported = (templateId: string) => {
    const template = PRESET_TEMPLATES.find(t => t.id === templateId);
    return template && standards.some(s => s.name === template.name);
  };

  const getImportedStandard = (templateId: string): QAStandard | undefined => {
    const template = PRESET_TEMPLATES.find(t => t.id === templateId);
    return template ? standards.find(s => s.name === template.name) : undefined;
  };

  const getActiveTemplatesCount = () => {
    return PRESET_TEMPLATES.filter(t => {
      const standard = getImportedStandard(t.id);
      return standard?.is_active;
    }).length;
  };

  const calculateAverageImpact = () => {
    const activeTemplates = PRESET_TEMPLATES.filter(t => {
      const standard = getImportedStandard(t.id);
      return standard?.is_active;
    });
    
    if (activeTemplates.length === 0) return null;
    
    const sum = activeTemplates.reduce((acc, t) => ({
      consistency: acc.consistency + t.qualityImpact.consistency,
      coverage: acc.coverage + t.qualityImpact.coverage,
      clarity: acc.clarity + t.qualityImpact.clarity,
      traceability: acc.traceability + t.qualityImpact.traceability,
    }), { consistency: 0, coverage: 0, clarity: 0, traceability: 0 });
    
    return {
      consistency: Math.round(sum.consistency / activeTemplates.length),
      coverage: Math.round(sum.coverage / activeTemplates.length),
      clarity: Math.round(sum.clarity / activeTemplates.length),
      traceability: Math.round(sum.traceability / activeTemplates.length),
    };
  };

  const filteredStandards = standards.filter(standard => {
    const matchesSearch = standard.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || standard.standard_type === filterType;
    const matchesActive = !showActiveOnly || standard.is_active;
    return matchesSearch && matchesType && matchesActive;
  });

  const getTypeLabel = (type: string) => {
    return STANDARD_TYPES.find(t => t.value === type)?.label || type;
  };

  const getRulesPreview = (rules: any): string => {
    if (Array.isArray(rules)) {
      return rules.slice(0, 3).map(r => r.rule || JSON.stringify(r)).join(", ");
    }
    if (typeof rules === "object") {
      return Object.keys(rules).slice(0, 3).join(", ");
    }
    return String(rules).slice(0, 100);
  };

  const content = (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search standards by name..."
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
            {STANDARD_TYPES.map(type => (
              <SelectItem key={type.value} value={type.label}>{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="active-filter"
            checked={showActiveOnly}
            onCheckedChange={setShowActiveOnly}
          />
          <Label htmlFor="active-filter" className="text-sm">Active only</Label>
        </div>
        <Button variant="outline" size="icon" onClick={loadStandards}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Dialog open={showTemplatesDialog} onOpenChange={setShowTemplatesDialog}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Library className="h-4 w-4 mr-2" />
              Import Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Import Standard Templates</DialogTitle>
              <DialogDescription>
                Choose from industry-standard templates to quickly set up QA standards for your project.
              </DialogDescription>
            </DialogHeader>
            
            {/* Active Templates Summary */}
            {getActiveTemplatesCount() > 0 && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Active Standards Impact</p>
                      <p className="text-xs text-muted-foreground">{getActiveTemplatesCount()} templates actively influencing AI generation</p>
                    </div>
                  </div>
                  {(() => {
                    const avgImpact = calculateAverageImpact();
                    if (!avgImpact) return null;
                    return (
                      <div className="grid grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Consistency</span>
                            <span className="font-medium">{avgImpact.consistency}%</span>
                          </div>
                          <Progress value={avgImpact.consistency} className="h-1.5" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1"><Target className="h-3 w-3" /> Coverage</span>
                            <span className="font-medium">{avgImpact.coverage}%</span>
                          </div>
                          <Progress value={avgImpact.coverage} className="h-1.5" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> Clarity</span>
                            <span className="font-medium">{avgImpact.clarity}%</span>
                          </div>
                          <Progress value={avgImpact.clarity} className="h-1.5" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1"><Link2 className="h-3 w-3" /> Traceability</span>
                            <span className="font-medium">{avgImpact.traceability}%</span>
                          </div>
                          <Progress value={avgImpact.traceability} className="h-1.5" />
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
            
            <ScrollArea className="h-[450px] pr-4">
              <div className="space-y-4 py-2">
                {PRESET_TEMPLATES.map(template => {
                  const imported = isTemplateImported(template.id);
                  const importing = importingTemplate === template.id;
                  const importedStandard = getImportedStandard(template.id);
                  const isActive = importedStandard?.is_active ?? false;
                  
                  return (
                    <Card key={template.id} className={`transition-all ${imported ? isActive ? "border-primary/50 bg-primary/5" : "opacity-70" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium">{template.name}</h4>
                              <Badge variant="outline">{template.category}</Badge>
                              <Badge variant="secondary">{getTypeLabel(template.standard_type)}</Badge>
                              {imported && (
                                isActive ? (
                                  <Badge variant="default" className="bg-green-600">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Inactive
                                  </Badge>
                                )
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{template.description}</p>
                            
                            {/* Quality Impact Metrics */}
                            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <TrendingUp className="h-3 w-3" />
                                Quality Impact
                              </div>
                              <div className="grid grid-cols-4 gap-2">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span>Consistency</span>
                                    <span className="font-medium">{template.qualityImpact.consistency}%</span>
                                  </div>
                                  <Progress value={template.qualityImpact.consistency} className="h-1" />
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span>Coverage</span>
                                    <span className="font-medium">{template.qualityImpact.coverage}%</span>
                                  </div>
                                  <Progress value={template.qualityImpact.coverage} className="h-1" />
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span>Clarity</span>
                                    <span className="font-medium">{template.qualityImpact.clarity}%</span>
                                  </div>
                                  <Progress value={template.qualityImpact.clarity} className="h-1" />
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <span>Traceability</span>
                                    <span className="font-medium">{template.qualityImpact.traceability}%</span>
                                  </div>
                                  <Progress value={template.qualityImpact.traceability} className="h-1" />
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground italic">{template.qualityImpact.description}</p>
                            </div>
                            
                            <Collapsible>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                  <FileText className="h-3 w-3 mr-1" />
                                  View {template.rules.length} rules & {template.examples.length} examples
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-2">
                                <div className="bg-muted/50 rounded-md p-3">
                                  <p className="text-xs font-medium mb-2">Rules:</p>
                                  <ul className="text-xs text-muted-foreground space-y-1">
                                    {template.rules.slice(0, 5).map((r, i) => (
                                      <li key={i} className="flex gap-2">
                                        <span className="text-primary">•</span>
                                        <span>{r.rule}</span>
                                      </li>
                                    ))}
                                    {template.rules.length > 5 && (
                                      <li className="text-muted-foreground italic">
                                        ...and {template.rules.length - 5} more rules
                                      </li>
                                    )}
                                  </ul>
                                </div>
                                {template.examples.length > 0 && (
                                  <div className="bg-muted/50 rounded-md p-3">
                                    <p className="text-xs font-medium mb-2">Examples:</p>
                                    <ul className="text-xs text-muted-foreground space-y-1">
                                      {template.examples.slice(0, 3).map((ex, i) => (
                                        <li key={i} className="flex gap-2">
                                          {ex.type === "good" && <Badge variant="outline" className="text-green-500 h-4 text-[10px]">Good</Badge>}
                                          {ex.type === "bad" && <Badge variant="outline" className="text-red-500 h-4 text-[10px]">Bad</Badge>}
                                          {ex.type === "category" && <Badge variant="outline" className="h-4 text-[10px]">{ex.name}</Badge>}
                                          {ex.type === "metric" && <Badge variant="outline" className="h-4 text-[10px]">{ex.name}</Badge>}
                                          {ex.type === "level" && <Badge variant="outline" className="h-4 text-[10px]">{ex.name}</Badge>}
                                          <span className="truncate">{ex.example}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              disabled={imported || importing}
                              onClick={() => handleImportTemplate(template)}
                            >
                              {importing ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : imported ? (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Imported
                                </>
                              ) : (
                                <>
                                  <Download className="h-4 w-4 mr-1" />
                                  Import
                                </>
                              )}
                            </Button>
                            {imported && importedStandard && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleToggleActive(importedStandard)}
                                className={isActive ? "text-amber-500 hover:text-amber-600" : "text-green-500 hover:text-green-600"}
                              >
                                {isActive ? "Deactivate" : "Activate"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              New Standard
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create QA Standard</DialogTitle>
              <DialogDescription>
                Define rules and examples that AI will follow when generating test cases and automation steps.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Standard Name *</Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Test Case Naming Rules"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Standard Type</Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STANDARD_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.label}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Rules (JSON or one per line) *</Label>
                <Textarea
                  value={formRules}
                  onChange={(e) => setFormRules(e.target.value)}
                  placeholder="Test case titles must start with a verb\nEach step must have expected result"
                  rows={5}
                />
              </div>
              <div className="space-y-2">
                <Label>Examples (JSON array, optional)</Label>
                <Textarea
                  value={formExamples}
                  onChange={(e) => setFormExamples(e.target.value)}
                  placeholder='[{"input": "example", "output": "result"}]'
                  rows={3}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={formIsActive}
                  onCheckedChange={setFormIsActive}
                />
                <Label htmlFor="active">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateStandard} disabled={!formName || !formRules}>
                Create Standard
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );

  if (isEmbedded) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          QA Standards Manager
        </CardTitle>
        <CardDescription>
          Define and manage QA standards for AI-assisted test generation
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
