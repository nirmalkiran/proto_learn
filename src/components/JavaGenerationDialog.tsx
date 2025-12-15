import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Upload, Code2, ChevronLeft, FolderGit2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UIElement {
  name: string;
  xpath: string;
  tagName: string;
  locatorStrategy: string; // e.g., "id = 'username'" or "xpath = '//button'"
}

interface TestCase {
  id: string;
  title: string;
  description?: string;
}

export type OutputOption = 'repository' | 'download';

interface JavaGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (mockupFiles: File[], htmlDom: string, selectedElements?: UIElement[], selectedTestCases?: TestCase[], outputOption?: OutputOption) => void;
  isLoading?: boolean;
  projectId: string;
  userStoryId?: string;
}

export const JavaGenerationDialog = ({ 
  open, 
  onOpenChange, 
  onGenerate, 
  isLoading = false,
  projectId,
  userStoryId 
}: JavaGenerationDialogProps) => {
  const [mockupFiles, setMockupFiles] = useState<File[]>([]);
  const [htmlDom, setHtmlDom] = useState("");
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [parsedElements, setParsedElements] = useState<UIElement[]>([]);
  const [selectedElements, setSelectedElements] = useState<Set<number>>(new Set());
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [selectedTestCases, setSelectedTestCases] = useState<Set<string>>(new Set());
  const [isLoadingTestCases, setIsLoadingTestCases] = useState(false);
  const [outputOption, setOutputOption] = useState<OutputOption>('repository');

  useEffect(() => {
    if (open && userStoryId) {
      fetchTestCases();
    }
  }, [open, userStoryId]);

  const fetchTestCases = async () => {
    if (!userStoryId) return;
    
    setIsLoadingTestCases(true);
    try {
      const { data, error } = await supabase
        .from('test_cases')
        .select('id, title, description')
        .eq('user_story_id', userStoryId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setTestCases(data || []);
      // Select all test cases by default
      setSelectedTestCases(new Set(data?.map(tc => tc.id) || []));
    } catch (error) {
      console.error('Error fetching test cases:', error);
      toast.error('Failed to load test cases');
    } finally {
      setIsLoadingTestCases(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    // Validate max 5 files
    if (files.length > 5) {
      alert('You can upload up to 5 mockup images only');
      return;
    }
    
    // Validate all files are images
    const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      alert('Please select only image files for mockups');
      return;
    }
    
    setMockupFiles(files);
  };

  const removeFile = (index: number) => {
    setMockupFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle initial generate (use AI to extract elements)
  const handleGenerate = async () => {
    if (!htmlDom.trim() && mockupFiles.length === 0) {
      toast.error('Please provide at least a mockup image or HTML DOM structure');
      return;
    }

    setIsExtracting(true);
    setExtractionProgress(0);

    try {
      // Simulate progress steps
      setExtractionProgress(20);
      toast.info('Analyzing elements with AI...');

      // Fetch Azure OpenAI config from integrations
      const { data: azureConfig, error: configError } = await supabase
        .from('integration_configs')
        .select('config')
        .eq('project_id', projectId)
        .eq('integration_id', 'openai')
        .single();

      if (configError && configError.code !== 'PGRST116') {
        console.error('Error fetching Azure config:', configError);
      }

      setExtractionProgress(40);
      const azureOpenAIConfig = azureConfig?.config;

      // Convert mockup files to base64 if present
      const mockupImages: string[] = [];
      for (const file of mockupFiles) {
        const base64 = await fileToBase64(file);
        mockupImages.push(base64);
      }

      setExtractionProgress(60);

      // Call the edge function to extract elements using Azure OpenAI
      const { data, error } = await supabase.functions.invoke('extract-page-elements', {
        body: {
          htmlDom,
          mockupImages: mockupImages.length > 0 ? mockupImages : undefined,
          azureConfig: azureOpenAIConfig
        }
      });

      setExtractionProgress(90);

      if (error) {
        console.error('Error extracting elements:', error);
        const errorMessage = data?.message || data?.details || 'Failed to extract elements. Please check your Azure OpenAI configuration.';
        toast.error(errorMessage);
        setIsExtracting(false);
        setExtractionProgress(0);
        return;
      }

      const elements = data.elements || [];
      
      if (elements.length === 0) {
        toast.error('No interactive elements found in the HTML. Please provide valid HTML with buttons, inputs, or other interactive elements.');
        setIsExtracting(false);
        setExtractionProgress(0);
        return;
      }

      setExtractionProgress(100);
      setParsedElements(elements);
      setSelectedElements(new Set(elements.map((_, i) => i)));
      setCurrentStep(2);
      toast.success(`Successfully extracted ${elements.length} elements`);
      
      // Reset extraction state
      setTimeout(() => {
        setIsExtracting(false);
        setExtractionProgress(0);
      }, 500);
    } catch (error) {
      console.error('Error in handleGenerate:', error);
      toast.error('An error occurred while extracting elements');
      setIsExtracting(false);
      setExtractionProgress(0);
    }
  };

  const handleFinalGenerate = () => {
    const selected = parsedElements.filter((_, index) => selectedElements.has(index));
    const selectedTC = testCases.filter(tc => selectedTestCases.has(tc.id));
    onGenerate(mockupFiles, htmlDom, selected, selectedTC, outputOption);
  };

  const handleBack = () => {
    setCurrentStep(1);
  };

  const toggleElement = (index: number) => {
    setSelectedElements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedElements.size === parsedElements.length) {
      setSelectedElements(new Set());
    } else {
      setSelectedElements(new Set(parsedElements.map((_, i) => i)));
    }
  };

  const toggleTestCase = (testCaseId: string) => {
    setSelectedTestCases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(testCaseId)) {
        newSet.delete(testCaseId);
      } else {
        newSet.add(testCaseId);
      }
      return newSet;
    });
  };

  const toggleSelectAllTestCases = () => {
    if (selectedTestCases.size === testCases.length) {
      setSelectedTestCases(new Set());
    } else {
      setSelectedTestCases(new Set(testCases.map(tc => tc.id)));
    }
  };

  const resetForm = () => {
    setMockupFiles([]);
    setHtmlDom("");
    setCurrentStep(1);
    setParsedElements([]);
    setSelectedElements(new Set());
    setTestCases([]);
    setSelectedTestCases(new Set());
    setOutputOption('repository');
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            {currentStep === 1 ? 'Generate Java Automation Files' : 'Select Page Class Elements to Generate'}
          </DialogTitle>
        </DialogHeader>
        
        {currentStep === 1 ? (
          <>
            <div className="space-y-6 py-4 overflow-y-auto">
              {/* Mockup Upload Section */}
              <div className="space-y-2">
                <Label htmlFor="mockup-upload" className="text-sm font-medium">
                  Mockup/Design Files (Optional - Up to 5 images)
                </Label>
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <input
                    id="mockup-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label 
                    htmlFor="mockup-upload" 
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {mockupFiles.length > 0 
                        ? `${mockupFiles.length} file${mockupFiles.length > 1 ? 's' : ''} selected` 
                        : "Click to upload mockup images (max 5)"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PNG, JPG, GIF up to 10MB each
                    </span>
                  </label>
                </div>
                {mockupFiles.length > 0 && (
                  <div className="space-y-1">
                    {mockupFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-2">
                        <span className="text-success flex items-center gap-2">
                          ✓ {file.name}
                          <span className="text-xs text-muted-foreground">
                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                          className="h-6 px-2"
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* HTML DOM Section */}
              <div className="space-y-2">
                <Label htmlFor="html-dom" className="text-sm font-medium">
                  HTML DOM Structure (Optional)
                </Label>
                <Textarea
                  id="html-dom"
                  placeholder={`Paste your HTML DOM structure here...

Example:
<div class="login-form">
  <input id="username" name="username" type="text" placeholder="Username" />
  <input id="password" name="password" type="password" placeholder="Password" />
  <button id="login-btn" class="btn-primary">Login</button>
</div>

<div class="user-menu">
  <span data-testid="user-name">John Doe</span>
  <button class="logout-btn">Logout</button>
</div>`}
                  value={htmlDom}
                  onChange={(e) => setHtmlDom(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Provide HTML structure to generate more accurate element locators (IDs, classes, data-testid attributes, etc.)
                </p>
              </div>

              {/* Test Cases Selection Section */}
              {userStoryId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Select Test Cases to Automate
                    </Label>
                    {testCases.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleSelectAllTestCases}
                        className="h-7 text-xs"
                      >
                        {selectedTestCases.size === testCases.length ? 'Deselect All' : 'Select All'}
                      </Button>
                    )}
                  </div>
                  
                  {isLoadingTestCases ? (
                    <div className="border rounded-lg p-4 text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Loading test cases...</p>
                    </div>
                  ) : testCases.length === 0 ? (
                    <div className="border rounded-lg p-4 text-center">
                      <p className="text-sm text-muted-foreground">No test cases found for this user story</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[200px] border rounded-lg">
                      <div className="space-y-2 p-3">
                        {testCases.map((testCase) => (
                          <div
                            key={testCase.id}
                            className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                          >
                            <Checkbox
                              id={`tc-${testCase.id}`}
                              checked={selectedTestCases.has(testCase.id)}
                              onCheckedChange={() => toggleTestCase(testCase.id)}
                              className="mt-1"
                            />
                            <label
                              htmlFor={`tc-${testCase.id}`}
                              className="flex-1 cursor-pointer space-y-1"
                            >
                              <div className="font-medium text-sm">{testCase.title}</div>
                              {testCase.description && (
                                <div className="text-xs text-muted-foreground line-clamp-2">
                                  {testCase.description}
                                </div>
                              )}
                            </label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                  
                  {testCases.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedTestCases.size} of {testCases.length} test cases selected
                    </p>
                  )}
                </div>
              )}

              {/* Info Section */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-medium">How this helps:</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• <strong>Mockup Images:</strong> Upload multiple screens to help AI understand the complete UI flow and identify elements visually</li>
                  <li>• <strong>HTML DOM:</strong> Provides exact element selectors for reliable automation</li>
                  <li>• <strong>Combined:</strong> Creates more accurate and maintainable page object locators across multiple screens</li>
                </ul>
              </div>
            </div>

            {isExtracting && (
              <div className="space-y-2 py-4 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Extracting elements...</span>
                  <span className="font-medium">{extractionProgress}%</span>
                </div>
                <Progress value={extractionProgress} className="h-2" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => handleClose(false)}
                disabled={isLoading || isExtracting}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleGenerate}
                disabled={isLoading || isExtracting}
              >
                {isExtracting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                    Extracting...
                  </>
                ) : isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Code2 className="mr-2 h-4 w-4" />
                    Generate Files
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 min-h-0 flex flex-col py-4 overflow-hidden">
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <p className="text-sm text-muted-foreground">
                  Select the UI elements you want to include in your page class
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                >
                  {selectedElements.size === parsedElements.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              <ScrollArea className="flex-1 h-[500px]">
                <div className="space-y-3 pr-4">
                  {parsedElements.map((element, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`element-${index}`}
                        checked={selectedElements.has(index)}
                        onCheckedChange={() => toggleElement(index)}
                        className="mt-1"
                      />
                      <label
                        htmlFor={`element-${index}`}
                        className="flex-1 cursor-pointer space-y-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{element.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                            {element.tagName}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <code className="text-xs text-muted-foreground block font-mono">
                            @FindBy({typeof element.locatorStrategy === 'string' 
                              ? element.locatorStrategy.replace(/'/g, '"') 
                              : JSON.stringify(element.locatorStrategy)})
                          </code>
                          <code className="text-xs text-muted-foreground/60 block font-mono">
                            XPath: {element.xpath}
                          </code>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="mt-4 p-3 bg-muted/50 rounded-lg flex-shrink-0 space-y-4">
                <p className="text-sm">
                  <span className="font-medium">{selectedElements.size}</span> of {parsedElements.length} elements selected
                </p>
                
                {/* Output Option Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Output Option</Label>
                  <RadioGroup 
                    value={outputOption} 
                    onValueChange={(value) => setOutputOption(value as OutputOption)}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="repository" id="output-repo" />
                      <Label htmlFor="output-repo" className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <FolderGit2 className="h-4 w-4" />
                        Save to Repository
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="download" id="output-download" />
                      <Label htmlFor="output-download" className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <Download className="h-4 w-4" />
                        Download as ZIP
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-4 border-t flex-shrink-0">
              <Button 
                variant="outline" 
                onClick={handleBack}
                disabled={isLoading}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button 
                onClick={handleFinalGenerate}
                disabled={isLoading || selectedElements.size === 0}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Code2 className="mr-2 h-4 w-4" />
                    Final Generate
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};