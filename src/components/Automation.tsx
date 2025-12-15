import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Upload, FileCode, Download, Github, RefreshCw, Folder, File } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UserStory {
  id: string;
  title: string;
  description: string;
}

interface TestCase {
  id: string;
  title: string;
  description: string;
  steps: string;
  expected_result: string;
  priority: string;
  test_data: string;
}

interface AutomationProps {
  projectId: string;
}

export const Automation = ({ projectId }: AutomationProps) => {
  const [userStories, setUserStories] = useState<UserStory[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [selectedUserStory, setSelectedUserStory] = useState<string>('');
  const [programmingLanguage, setProgrammingLanguage] = useState<string>('');
  const [domSourceCode, setDomSourceCode] = useState('');
  const [optionalInstructions, setOptionalInstructions] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingTestCases, setIsLoadingTestCases] = useState(false);
  const [frameworkFiles, setFrameworkFiles] = useState<File[]>([]);
  const [frameworkCode, setFrameworkCode] = useState('');
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchUserStories();
  }, [projectId]);

  useEffect(() => {
    if (selectedUserStory) {
      fetchTestCases();
    } else {
      setTestCases([]);
    }
  }, [selectedUserStory]);

  const fetchUserStories = async () => {
    try {
      const { data, error } = await supabase
        .from('user_stories')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUserStories(data || []);
    } catch (error) {
      console.error('Error fetching user stories:', error);
      toast({
        title: "Error",
        description: "Failed to fetch user stories",
        variant: "destructive",
      });
    }
  };

  const fetchTestCases = async () => {
    setIsLoadingTestCases(true);
    try {
      const { data, error } = await supabase
        .from('test_cases')
        .select('*')
        .eq('user_story_id', selectedUserStory)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTestCases(data || []);
      
      if (data && data.length > 0) {
        toast({
          title: "Test Cases Loaded",
          description: `Found ${data.length} test case(s) for this user story`,
        });
      }
    } catch (error) {
      console.error('Error fetching test cases:', error);
      toast({
        title: "Error", 
        description: "Failed to fetch test cases",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTestCases(false);
    }
  };

  const handleFrameworkUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      setFrameworkFiles(Array.from(files));
    }
  };

  const handleScreenshotUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      setScreenshots(Array.from(files));
    }
  };

  const generateAutomationCode = async () => {
    if (!selectedUserStory || !programmingLanguage) {
      toast({
        title: "Missing Information",
        description: "Please select a user story and programming language",
        variant: "destructive",
      });
      return;
    }

    // Load Azure OpenAI configuration from localStorage (same as Integrations module)
    const savedConfigs = (() => {
      try {
        const saved = localStorage.getItem(`integration-configs-${projectId}`);
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    })();

    const azureConfig = savedConfigs.openai;
    if (!azureConfig?.endpoint || !azureConfig?.apiKey || !azureConfig?.deploymentId) {
      toast({
        title: "Azure OpenAI Not Configured",
        description: "Please configure Azure OpenAI in the Integrations module first",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      // Prepare form data for comprehensive automation generation
      const formData = new FormData();
      
      // Add basic parameters
      formData.append('domSourceCode', domSourceCode);
      formData.append('programmingLanguage', programmingLanguage);
      formData.append('optionalInstructions', optionalInstructions);
      
      // Add Azure OpenAI configuration from Integrations module
      formData.append('azureConfig', JSON.stringify(azureConfig));
      
      // Add user story and test cases
      const userStory = userStories.find(us => us.id === selectedUserStory);
      formData.append('userStory', JSON.stringify(userStory));
      formData.append('testCases', JSON.stringify(testCases));
      
      // Add framework skeleton if uploaded, otherwise use framework code
      if (frameworkFiles.length > 0) {
        formData.append('frameworkSkeleton', frameworkFiles[0]);
      } else if (frameworkCode.trim()) {
        formData.append('frameworkCode', frameworkCode);
      }
      
      // Add screenshots
      screenshots.forEach((screenshot, index) => {
        formData.append('screenshots', screenshot);
      });

      const { data, error } = await supabase.functions.invoke('automation-generator', {
        body: formData
      });

      if (error) throw error;

      if (data.success) {
        setGeneratedCode(data.generatedCode || '');
        toast({
          title: "Success",
          description: "Comprehensive automation framework generated successfully",
        });
      } else {
        throw new Error(data.error || 'Failed to generate automation code');
      }
    } catch (error) {
      console.error('Error generating automation code:', error);
      toast({
        title: "Error",
        description: "Failed to generate automation code",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadFramework = () => {
    if (!generatedCode) {
      toast({
        title: "No Code",
        description: "Generate automation code first",
        variant: "destructive",
      });
      return;
    }

    const blob = new Blob([generatedCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `automation-framework.${programmingLanguage === 'Java' ? 'java' : programmingLanguage === 'Python' ? 'py' : programmingLanguage === 'JavaScript' ? 'js' : 'cs'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-foreground">⚙️ Automation Module</h1>
        <p className="text-muted-foreground text-lg">
          Generate test automation code directly inside your hybrid framework skeleton
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Input Section */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Framework & Assets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Framework Skeleton Upload */}
              <div>
                <label className="block text-sm font-medium mb-2">Upload Framework Skeleton (ZIP)</label>
                <input
                  type="file"
                  accept=".zip"
                  multiple
                  onChange={handleFrameworkUpload}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
                {frameworkFiles.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {frameworkFiles.length} file(s) selected
                  </p>
                )}
              </div>

              {/* Optional: Paste Full Framework Code */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Optional: Paste full framework code
                  <span className="text-xs text-muted-foreground ml-2">
                    (Ignored if ZIP is uploaded)
                  </span>
                </label>
                <Textarea
                  placeholder="Paste your complete framework code here as an alternative to ZIP upload..."
                  value={frameworkCode}
                  onChange={(e) => setFrameworkCode(e.target.value)}
                  disabled={frameworkFiles.length > 0}
                  className="min-h-[120px]"
                />
                {frameworkFiles.length > 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Framework code input disabled - ZIP file takes precedence
                  </p>
                )}
              </div>

              {/* Screenshots Upload */}
              <div>
                <label className="block text-sm font-medium mb-2">Upload Screenshots</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleScreenshotUpload}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
                {screenshots.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {screenshots.length} screenshot(s) selected
                  </p>
                )}
              </div>

              {/* DOM Source Code */}
              <div>
                <label className="block text-sm font-medium mb-2">Paste DOM Source Code</label>
                <Textarea
                  placeholder="Paste HTML / JSON source code here..."
                  value={domSourceCode}
                  onChange={(e) => setDomSourceCode(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Programming Language */}
              <div>
                <label className="block text-sm font-medium mb-2">Select Programming Language</label>
                <Select value={programmingLanguage} onValueChange={setProgrammingLanguage}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose language..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Java">Java</SelectItem>
                    <SelectItem value="Python">Python</SelectItem>
                    <SelectItem value="JavaScript">JavaScript</SelectItem>
                    <SelectItem value="C#">C#</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* User Story Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Select User Story
                  <span className="text-xs text-muted-foreground ml-2">
                    (Test cases will load automatically)
                  </span>
                </label>
                <Select value={selectedUserStory} onValueChange={setSelectedUserStory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose user story to load test cases..." />
                  </SelectTrigger>
                  <SelectContent>
                    {userStories.map((story) => (
                      <SelectItem key={story.id} value={story.id}>
                        {story.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Test Cases Preview - Enhanced */}
              {selectedUserStory && (
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    📋 Linked Test Cases
                    {isLoadingTestCases && <RefreshCw className="h-3 w-3 animate-spin" />}
                  </label>
                  
                  {isLoadingTestCases ? (
                    <div className="p-4 bg-muted rounded-md text-center text-sm text-muted-foreground">
                      Loading test cases...
                    </div>
                  ) : testCases.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                      <div className="text-xs text-muted-foreground mb-2">
                        Found {testCases.length} test case(s) for this user story
                      </div>
                      {testCases.map((testCase) => (
                        <div key={testCase.id} className="flex items-center justify-between p-2 bg-background border rounded-sm">
                          <span className="text-sm truncate flex-1">{testCase.title}</span>
                          <Badge variant="secondary" className="text-xs ml-2">
                            {testCase.priority}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-muted rounded-md text-center text-sm text-muted-foreground">
                      No test cases found for this user story
                    </div>
                  )}
                </div>
              )}

              {/* Optional Instructions */}
              <div>
                <label className="block text-sm font-medium mb-2">Optional Instructions</label>
                <Textarea
                  placeholder="Add extra AI hints or prompts..."
                  value={optionalInstructions}
                  onChange={(e) => setOptionalInstructions(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>

              {/* Generate Button */}
              <Button 
                onClick={generateAutomationCode}
                disabled={isGenerating || !selectedUserStory || !programmingLanguage}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    🔵 Generate Code
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - AI & Output Section */}
        <div className="space-y-4">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                🤖 AI Generated Code
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Code Editor Area */}
              <div className="bg-slate-900 rounded-md p-4 min-h-[400px]">
                {generatedCode ? (
                  <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap overflow-auto max-h-[400px]">
                    {generatedCode}
                  </pre>
                ) : (
                  <div className="text-slate-400 text-center py-20">
                    Generated automation code will appear here...
                  </div>
                )}
              </div>

              {/* Folder/File Tree View */}
              {generatedCode && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Folder className="h-4 w-4" />
                    Framework Structure
                  </h4>
                  <div className="bg-muted rounded-md p-3 space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Folder className="h-3 w-3" />
                      src/test/java
                    </div>
                    <div className="flex items-center gap-2 text-sm ml-4">
                      <File className="h-3 w-3" />
                      {selectedUserStory ? userStories.find(us => us.id === selectedUserStory)?.title.replace(/\s+/g, '') + 'Test.java' : 'AutomationTest.java'}
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              {/* Output Action Buttons */}
              <div className="grid grid-cols-1 gap-3">
                <Button 
                  variant="gradient"
                  onClick={() => window.open('https://sharepoint.com/framework-download', '_blank')}
                  className="w-full"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Pre-existing Framework
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={generateAutomationCode}
                  disabled={isGenerating || !selectedUserStory || !programmingLanguage}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate Code
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={downloadFramework}
                  disabled={!generatedCode}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Full Framework (ZIP)
                </Button>
                
                <Button 
                  variant="outline" 
                  disabled={!generatedCode}
                >
                  <Github className="mr-2 h-4 w-4" />
                  Export to GitHub / Jira
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};