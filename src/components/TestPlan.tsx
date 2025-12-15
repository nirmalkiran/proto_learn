import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import mammoth from "mammoth";
import { 
  FileText, 
  Download, 
  Loader2, 
  Target,
  CheckCircle,
  Calendar,
  Users,
  Upload,
  Settings,
  X,
  ChevronDown,
  Check,
  Save,
  FolderOpen,
  Trash2,
  Clock
} from "lucide-react";

interface TestPlanProps {
  projectId: string;
}

export const TestPlan = ({ projectId }: TestPlanProps) => {
  const [loading, setLoading] = useState(false);
  const [testPlan, setTestPlan] = useState<string>("");
  const [projectName, setProjectName] = useState("");
  const [testingScope, setTestingScope] = useState<string[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [requirementsDoc, setRequirementsDoc] = useState("");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [testPlanTemplate, setTestPlanTemplate] = useState("");
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [userStories, setUserStories] = useState<any[]>([]);
  
  // Save functionality states
  const [savedTestPlans, setSavedTestPlans] = useState<any[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingSavedPlans, setLoadingSavedPlans] = useState(false);
  
  const { toast } = useToast();
  const { session } = useAuth();

  // Load user stories from database when component mounts
  useEffect(() => {
    const loadUserStories = async () => {
      if (!projectId) return;
      
      try {
        const { data, error } = await supabase
          .from('user_stories')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setUserStories(data || []);
      } catch (error) {
        console.error('Error loading user stories:', error);
        toast({
          title: "Error",
          description: "Failed to load user stories",
          variant: "destructive",
        });
      }
    };

    const loadSavedTestPlans = async () => {
      if (!projectId) return;
      
      setLoadingSavedPlans(true);
      try {
        const { data, error } = await supabase
          .from('saved_test_plans')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSavedTestPlans(data || []);
      } catch (error) {
        console.error('Error loading saved test plans:', error);
        toast({
          title: "Error",
          description: "Failed to load saved test plans",
          variant: "destructive",
        });
      } finally {
        setLoadingSavedPlans(false);
      }
    };

    loadUserStories();
    loadSavedTestPlans();
  }, [projectId, toast]);

  // Handle template file upload
  const handleTemplateUpload = async (file: File) => {
    if (!session?.user) return;
    
    const allowedTypes = ['text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Error",
        description: "Please upload a .txt, .doc, or .docx file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: "Error", 
        description: "File size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploadingTemplate(true);
    try {
      // Upload to Supabase Storage
      const fileName = `${session.user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('test-plan-templates')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Read file content based on type
      let text = '';
      if (file.type === 'text/plain') {
        text = await file.text();
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                 file.type === 'application/msword') {
        // Convert Word document to structured text preserving formatting
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        
        // Convert HTML to structured text while preserving formatting
        text = result.value
          .replace(/<h1[^>]*>/g, '\n# ')
          .replace(/<h2[^>]*>/g, '\n## ')
          .replace(/<h3[^>]*>/g, '\n### ')
          .replace(/<h4[^>]*>/g, '\n#### ')
          .replace(/<h5[^>]*>/g, '\n##### ')
          .replace(/<h6[^>]*>/g, '\n###### ')
          .replace(/<\/h[1-6]>/g, '\n')
          .replace(/<p[^>]*>/g, '\n')
          .replace(/<\/p>/g, '\n')
          .replace(/<strong[^>]*>|<b[^>]*>/g, '**')
          .replace(/<\/strong>|<\/b>/g, '**')
          .replace(/<em[^>]*>|<i[^>]*>/g, '*')
          .replace(/<\/em>|<\/i>/g, '*')
          .replace(/<ul[^>]*>/g, '\n')
          .replace(/<\/ul>/g, '\n')
          .replace(/<ol[^>]*>/g, '\n')
          .replace(/<\/ol>/g, '\n')
          .replace(/<li[^>]*>/g, '- ')
          .replace(/<\/li>/g, '\n')
          .replace(/<br\s*\/?>/g, '\n')
          .replace(/<div[^>]*>/g, '\n')
          .replace(/<\/div>/g, '\n')
          .replace(/<[^>]*>/g, '')
          .replace(/\n\s*\n\s*\n/g, '\n\n')
          .replace(/^\s+|\s+$/g, '')
          .trim();
      }
      
      setTestPlanTemplate(text);
      setTemplateFile(file);
      
      toast({
        title: "Success",
        description: "Template uploaded successfully",
      });
    } catch (error) {
      console.error('Error uploading template:', error);
      toast({
        title: "Error",
        description: "Failed to upload template",
        variant: "destructive",
      });
    } finally {
      setUploadingTemplate(false);
    }
  };

  const removeTemplate = () => {
    setTemplateFile(null);
    setTestPlanTemplate("");
  };

  // Load OpenAI config from database (from integrations)
  const loadOpenAIConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('integration_configs')
        .select('config')
        .eq('project_id', projectId)
        .eq('integration_id', 'openai')
        .eq('enabled', true)
        .single();

      if (error || !data) return null;
      
      // Cast the config to the expected type
      const config = data.config as Record<string, any>;
      return config;
    } catch {
      return null;
    }
  };

  const generateTestPlan = async () => {
    if (!projectName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a project name",
        variant: "destructive",
      });
      return;
    }

    // Validate session
    if (!session?.access_token) {
      toast({
        title: "Authentication Error",
        description: "Your session has expired. Please refresh the page and try again.",
        variant: "destructive",
      });
      return;
    }

    // Check if OpenAI is configured
    const openAIConfig = await loadOpenAIConfig();
    if (!openAIConfig?.endpoint || !openAIConfig?.apiKey || !openAIConfig?.deploymentId) {
      toast({
        title: "Error",
        description: "Please configure Azure OpenAI in the Integrations tab first",
        variant: "destructive",
      });
      return;
    }

    if (userStories.length === 0 && !requirementsDoc.trim()) {
      toast({
        title: "Error", 
        description: "Please add user stories or upload a requirements document",
        variant: "destructive",
      });
      return;
    }

    if (testingScope.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one testing scope",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-test-plan', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          userStories,
          projectName,
          testingScope,
          customPrompt: customPrompt.trim(),
          requirementsDoc: requirementsDoc.trim(),
          testPlanTemplate: testPlanTemplate.trim(),
          projectId,
          openAIConfig
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      setTestPlan(data.testPlan);
      toast({
        title: "Success",
        description: "Test plan generated successfully!",
      });
    } catch (error: any) {
      console.error('Error generating test plan:', error);
      
      const errorMessage = error?.message || "Failed to generate test plan. Please try again.";
      const isAuthError = errorMessage.toLowerCase().includes('unauthorized') || 
                         errorMessage.toLowerCase().includes('auth');
      
      toast({
        title: isAuthError ? "Authentication Error" : "Error",
        description: isAuthError 
          ? "Your session has expired. Please refresh the page and try again."
          : errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadTestPlan = async () => {
    if (!testPlan) return;
    
    try {
      // Parse the test plan content into structured sections
      const sections = testPlan.split('\n\n');
      const paragraphs: Paragraph[] = [];
      
      sections.forEach((section, index) => {
        const lines = section.trim().split('\n');
        if (lines.length === 0) return;
        
        const firstLine = lines[0].trim();
        
        // Check if it's a heading (starts with # or is all caps or has specific keywords)
        if (firstLine.startsWith('#') || 
            firstLine === firstLine.toUpperCase() && firstLine.length > 5 ||
            firstLine.toLowerCase().includes('test plan') ||
            firstLine.toLowerCase().includes('objective') ||
            firstLine.toLowerCase().includes('scope') ||
            firstLine.toLowerCase().includes('strategy')) {
          
          // Add heading
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: firstLine.replace(/^#+\s*/, ''), bold: true, size: 28 })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }));
          
          // Add remaining lines as regular paragraphs
          lines.slice(1).forEach(line => {
            if (line.trim()) {
              paragraphs.push(new Paragraph({
                children: [new TextRun({ text: line.trim() })],
                spacing: { after: 120 }
              }));
            }
          });
        } else {
          // Regular content
          lines.forEach(line => {
            if (line.trim()) {
              paragraphs.push(new Paragraph({
                children: [new TextRun({ text: line.trim() })],
                spacing: { after: 120 }
              }));
            }
          });
        }
        
        // Add spacing between sections
        if (index < sections.length - 1) {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: "" })],
            spacing: { after: 200 }
          }));
        }
      });

      // Create document
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [new TextRun({ 
                text: `${projectName || 'Project'} - Test Plan`,
                bold: true,
                size: 32
              })],
              heading: HeadingLevel.TITLE,
              spacing: { after: 400 }
            }),
            ...paragraphs
          ]
        }]
      });

      // Generate and download
      const blob = await Packer.toBlob(doc);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName || 'project'}-test-plan.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "Test plan downloaded as Word document",
      });
    } catch (error) {
      console.error('Error creating Word document:', error);
      toast({
        title: "Error",
        description: "Failed to create Word document. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Save test plan to database
  const saveTestPlan = async () => {
    if (!testPlan || !saveName.trim() || !session?.user) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('saved_test_plans')
        .insert({
          project_id: projectId,
          user_id: session.user.id,
          name: saveName.trim(),
          content: testPlan,
          testing_scope: testingScope,
          project_name: projectName
        });

      if (error) throw error;

      // Refresh saved test plans list
      const { data, error: fetchError } = await supabase
        .from('saved_test_plans')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (!fetchError) {
        setSavedTestPlans(data || []);
      }

      setSaveDialogOpen(false);
      setSaveName("");
      
      toast({
        title: "Success",
        description: "Test plan saved successfully",
      });
    } catch (error) {
      console.error('Error saving test plan:', error);
      toast({
        title: "Error",
        description: "Failed to save test plan. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Load a saved test plan
  const loadSavedTestPlan = (savedPlan: any) => {
    setTestPlan(savedPlan.content);
    setProjectName(savedPlan.project_name || "");
    setTestingScope(savedPlan.testing_scope || []);
    
    toast({
      title: "Success",
      description: `Loaded test plan: ${savedPlan.name}`,
    });
  };

  // Delete a saved test plan
  const deleteSavedTestPlan = async (planId: string) => {
    try {
      const { error } = await supabase
        .from('saved_test_plans')
        .delete()
        .eq('id', planId);

      if (error) throw error;

      // Refresh saved test plans list
      setSavedTestPlans(savedTestPlans.filter(plan => plan.id !== planId));
      
      toast({
        title: "Success",
        description: "Test plan deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting test plan:', error);
      toast({
        title: "Error",
        description: "Failed to delete test plan. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Test Plan Generator</h2>
          <p className="text-muted-foreground">
            Generate comprehensive test plans using AI
          </p>
        </div>
      </div>

      {/* Configuration */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Test Plan Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                placeholder="Enter project name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="testingScope">Testing Scope</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between bg-background"
                  >
                    {testingScope.length > 0
                      ? `${testingScope.length} testing type${testingScope.length > 1 ? 's' : ''} selected`
                      : "Select testing types"}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0 bg-background border border-border shadow-lg z-50">
                  <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
                    {[
                      'Functional Testing',
                      'API Testing', 
                      'Automation Testing',
                      'Performance Testing',
                      'Security Testing',
                      'Mobile Application Testing',
                      'Database/ETL Testing',
                      'Configuration Testing',
                      'UAT Testing'
                    ].map((scope) => (
                      <div key={scope} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded">
                        <Checkbox
                          id={scope}
                          checked={testingScope.includes(scope)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setTestingScope([...testingScope, scope]);
                            } else {
                              setTestingScope(testingScope.filter(s => s !== scope));
                            }
                          }}
                        />
                        <Label htmlFor={scope} className="text-sm font-normal cursor-pointer flex-1">
                          {scope}
                        </Label>
                        {testingScope.includes(scope) && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    ))}
                  </div>
                  {testingScope.length > 0 && (
                    <div className="border-t p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTestingScope([])}
                        className="w-full text-muted-foreground hover:text-foreground"
                      >
                        Clear all selections
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              {testingScope.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {testingScope.map((scope) => (
                    <Badge 
                      key={scope} 
                      variant="secondary" 
                      className="text-xs cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setTestingScope(testingScope.filter(s => s !== scope))}
                    >
                      {scope}
                      <X className="ml-1 h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="templateUpload">Test Plan Template (Optional)</Label>
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4">
              {!templateFile ? (
                <div className="text-center">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <div className="mt-2">
                    <Label 
                      htmlFor="templateUpload" 
                      className="cursor-pointer text-primary hover:text-primary/80"
                    >
                      Click to upload template file
                    </Label>
                    <Input
                      id="templateUpload"
                      type="file"
                      accept=".txt,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleTemplateUpload(file);
                      }}
                      className="hidden"
                      disabled={uploadingTemplate}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload .txt, .doc, or .docx files (max 5MB)
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{templateFile.name}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={removeTemplate}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {uploadingTemplate && (
                <div className="flex items-center justify-center mt-2">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm">Uploading template...</span>
                </div>
              )}
            </div>
            {testPlanTemplate && (
              <div className="mt-2">
                <Label className="text-xs text-muted-foreground">Template Preview:</Label>
                <div className="bg-muted/50 p-2 rounded text-xs max-h-20 overflow-y-auto">
                  {testPlanTemplate.substring(0, 200)}...
                </div>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="customPrompt">Custom Prompt (Optional)</Label>
            <Textarea
              id="customPrompt"
              placeholder="Enter specific requirements or constraints for the test plan generation..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="requirementsDoc">Requirements Document (Optional)</Label>
            <Textarea
              id="requirementsDoc"
              placeholder="Paste your requirements document content here as an alternative to user stories..."
              value={requirementsDoc}
              onChange={(e) => setRequirementsDoc(e.target.value)}
              rows={6}
            />
          </div>
          
          <div className="space-y-2">
            <Label>User Stories ({userStories.length} available)</Label>
            <div className="flex flex-wrap gap-2">
              {userStories.slice(0, 5).map((story, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {story.title}
                </Badge>
              ))}
              {userStories.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{userStories.length - 5} more
                </Badge>
              )}
            </div>
            {userStories.length === 0 && !requirementsDoc.trim() && (
              <p className="text-sm text-muted-foreground">
                Add user stories in the User Stories tab or paste requirements document above
              </p>
            )}
          </div>

          <Button 
            onClick={generateTestPlan} 
            disabled={loading}
            className="w-full md:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Test Plan...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Generate Test Plan
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Test Plan */}
      {testPlan && (
        <Card className="shadow-card">
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-success" />
                Generated Test Plan
              </CardTitle>
              <div className="flex gap-2">
                <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Save Test Plan</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="saveName">Test Plan Name</Label>
                        <Input
                          id="saveName"
                          placeholder="Enter a name for this test plan"
                          value={saveName}
                          onChange={(e) => setSaveName(e.target.value)}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={saveTestPlan} disabled={saving || !saveName.trim()}>
                          {saving ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              Save Test Plan
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button variant="outline" onClick={downloadTestPlan}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 p-4 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm font-mono overflow-auto max-h-96">
                {testPlan}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Test Plans */}
      {savedTestPlans.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              Saved Test Plans ({savedTestPlans.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSavedPlans ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading saved test plans...</span>
              </div>
            ) : (
              <div className="grid gap-4">
                {savedTestPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{plan.name}</h4>
                        {plan.testing_scope?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {plan.testing_scope.slice(0, 2).map((scope) => (
                              <Badge key={scope} variant="secondary" className="text-xs">
                                {scope}
                              </Badge>
                            ))}
                            {plan.testing_scope.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{plan.testing_scope.length - 2} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(plan.created_at).toLocaleDateString()}
                        </div>
                        {plan.project_name && (
                          <div>Project: {plan.project_name}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadSavedTestPlan(plan)}
                      >
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Load
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteSavedTestPlan(plan.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">User Stories</p>
                <p className="text-2xl font-bold">{userStories.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent" />
              <div>
                <p className="text-sm font-medium">Saved Test Plans</p>
                <p className="text-2xl font-bold">{savedTestPlans.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-success" />
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-sm font-semibold text-success">
                  {testPlan ? 'Generated' : 'Ready'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};