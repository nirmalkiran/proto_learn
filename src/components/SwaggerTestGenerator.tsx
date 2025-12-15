import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Download, Upload, FileJson, Brain, Zap, Save, FolderOpen, Trash2, Play, Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

export const SwaggerTestGenerator = ({ projectId: initialProjectId }: { projectId?: string }) => {
  const [swaggerContent, setSwaggerContent] = useState("");
  const [additionalPrompt, setAdditionalPrompt] = useState("");
  const [testCases, setTestCases] = useState<string[][]>([]);
  const [postmanCollection, setPostmanCollection] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [aiProvider, setAiProvider] = useState<'google' | 'openai'>('openai');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Array<{id: string, name: string, hasOpenAI: boolean}>>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [savedTestCases, setSavedTestCases] = useState<Array<{id: string, name: string, created_at: string}>>([]);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [loadedTestCaseId, setLoadedTestCaseId] = useState<string | null>(null);
  
  // API Executor state
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiAuthToken, setApiAuthToken] = useState("");
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [isEditingApiConfig, setIsEditingApiConfig] = useState(true);
  const [executingTestCase, setExecutingTestCase] = useState<number | null>(null);
  const [testCaseResponses, setTestCaseResponses] = useState<{[key: number]: {status: number, statusText: string, headers: any, data: any}}>({});

  // Edit test case state
  const [editingTestCase, setEditingTestCase] = useState<number | null>(null);
  const [editedTestCase, setEditedTestCase] = useState<string[]>([]);
  const [editParams, setEditParams] = useState<Array<{key: string, value: string, description: string}>>([]);
  const [editHeaders, setEditHeaders] = useState<Array<{key: string, value: string, description: string}>>([]);
  const [editBody, setEditBody] = useState("");
  const [editAuth, setEditAuth] = useState<{type: string, token: string}>({type: 'none', token: ''});
  const [editAssertions, setEditAssertions] = useState<Array<{type: string, condition: string, value: string, description: string}>>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null);
  const [removeTestCaseIndex, setRemoveTestCaseIndex] = useState<number | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    const loadProjects = async () => {
      setIsLoadingProjects(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: userProjects } = await supabase
            .from('projects')
            .select(`
              id, 
              name,
              integration_configs!left(id, enabled)
            `)
            .eq('created_by', user.id)
            .eq('integration_configs.integration_id', 'openai');

          if (userProjects) {
            const projectsWithConfig = userProjects.map(p => ({
              id: p.id,
              name: p.name,
              hasOpenAI: p.integration_configs?.some((config: any) => config.enabled) || false
            }));

            setProjects(projectsWithConfig);

            if (initialProjectId) {
              setProjectId(initialProjectId);
            } else {
              const wisprProject = projectsWithConfig.find(p => p.name.toLowerCase().includes('wispr'));
              const projectWithOpenAI = projectsWithConfig.find(p => p.hasOpenAI);
              const selectedProject = wisprProject || projectWithOpenAI || projectsWithConfig[0];

              if (selectedProject) {
                setProjectId(selectedProject.id);
              }
            }
          }
        }
      } catch (error) {
        toast({
          title: "Error Loading Projects",
          description: "Failed to load project list",
          variant: "destructive"
        });
      } finally {
        setIsLoadingProjects(false);
      }
    };
    loadProjects();
  }, []);

  // Load saved auth token from project integration config on mount
  useEffect(() => {
    const loadSavedAuthToken = async () => {
      if (!projectId) return;
      
      try {
        const { data, error } = await supabase
          .from('integration_configs')
          .select('config')
          .eq('project_id', projectId)
          .eq('integration_id', 'api_test_auth')
          .maybeSingle();

        if (!error && data?.config) {
          const config = data.config as { auth_token?: string };
          if (config.auth_token) {
            setApiAuthToken(config.auth_token);
          }
        }
      } catch (err) {
        console.error('Error loading auth token:', err);
      }
    };

    loadSavedAuthToken();
  }, [projectId]);

  // Manual save auth token function
  const handleSaveAuthToken = async () => {
    if (!projectId || !apiAuthToken.trim()) {
      toast({
        title: "Missing Token",
        description: "Please enter an authorization token to save",
        variant: "destructive"
      });
      return;
    }

    setIsSavingToken(true);
    try {
      const { data: existing } = await supabase
        .from('integration_configs')
        .select('id')
        .eq('project_id', projectId)
        .eq('integration_id', 'api_test_auth')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('integration_configs')
          .update({ config: { auth_token: apiAuthToken }, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('integration_configs')
          .insert({
            project_id: projectId,
            integration_id: 'api_test_auth',
            config: { auth_token: apiAuthToken }
          });
      }

      toast({
        title: "Token Saved",
        description: "Authorization token has been saved successfully"
      });
    } catch (err) {
      console.error('Error saving auth token:', err);
      toast({
        title: "Save Failed",
        description: "Failed to save authorization token",
        variant: "destructive"
      });
    } finally {
      setIsSavingToken(false);
    }
  };

  useEffect(() => {
    const loadSavedTestCases = async () => {
      if (!projectId) return;
      
      try {
        const { data, error } = await supabase
          .from('saved_api_test_cases')
          .select('id, name, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSavedTestCases(data || []);
      } catch (error) {
        console.error('Error loading saved test cases:', error);
      }
    };

    loadSavedTestCases();
  }, [projectId]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setSwaggerContent(content);
      
      toast({
        title: "File uploaded successfully",
        description: "Swagger/OpenAPI specification loaded"
      });
    } catch (error) {
      toast({
        title: "Error reading file",
        description: "Please ensure the file is a valid Swagger/OpenAPI specification",
        variant: "destructive"
      });
    }
  };

  const generateTestCases = async () => {
    if (!swaggerContent.trim()) {
      toast({
        title: "Missing Input",
        description: "Please provide a Swagger/OpenAPI specification",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      let swaggerSpec;
      try {
        swaggerSpec = JSON.parse(swaggerContent);
      } catch (error) {
        throw new Error("Invalid JSON format in Swagger specification");
      }
      
      if (!swaggerSpec.paths || Object.keys(swaggerSpec.paths).length === 0) {
        throw new Error("No API paths found in the specification");
      }

      setProgress(30);

      const functionName = aiProvider === 'google' ? 'swagger-to-test-cases' : 'swagger-to-test-cases-openai';
      
      let requestBody: any = { 
        swaggerSpec,
        customPrompt: additionalPrompt.trim() || undefined
      };

      if (projectId) {
        requestBody.projectId = projectId;
      }

      if (aiProvider === 'openai') {
        if (!projectId) {
          toast({
            title: "Configuration Error",
            description: "No project selected. Please select a project to use Azure OpenAI.",
            variant: "destructive"
          });
          return;
        }

        try {
          const { data: configData, error: configError } = await supabase
            .from('integration_configs')
            .select('config')
            .eq('project_id', projectId)
            .eq('integration_id', 'openai')
            .single();

          if (configError || !configData) {
            throw new Error('Azure OpenAI not configured. Please configure it in the Integrations section.');
          }

          const azureConfig = configData.config as any;
          if (!azureConfig || typeof azureConfig !== 'object' || 
              !azureConfig.endpoint || !azureConfig.apiKey || !azureConfig.deploymentId) {
            throw new Error('Azure OpenAI configuration incomplete. Please check your settings in the Integrations section.');
          }

          requestBody.azureConfig = azureConfig;
        } catch (configError) {
          toast({
            title: "Configuration Error",
            description: configError instanceof Error ? configError.message : "Failed to load Azure OpenAI configuration",
            variant: "destructive"
          });
          return;
        }
      }
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: requestBody
      });

      if (error) throw error;

      setProgress(70);

      if (data.success) {
        setTestCases(data.csvData || []);
        setPostmanCollection(data.postmanCollection || null);
        setProgress(100);
        
        toast({
          title: "Test Cases Generated",
          description: `Generated ${(data.csvData?.length || 1) - 1} test cases`
        });
      } else {
        throw new Error(data.error || "Failed to generate test cases");
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate test cases",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadCSV = () => {
    if (!testCases || testCases.length === 0) return;
    
    const csvContent = testCases
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api-test-cases.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPostmanCollection = () => {
    if (!postmanCollection) return;
    
    const blob = new Blob([JSON.stringify(postmanCollection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'postman-collection.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveTestCases = async () => {
    if (!saveName.trim() || !projectId) {
      toast({
        title: "Missing Information",
        description: "Please provide a name for the saved test cases",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // If we have a loaded test case ID, update it; otherwise insert new
      if (loadedTestCaseId) {
        const { error } = await supabase
          .from('saved_api_test_cases')
          .update({
            name: saveName,
            swagger_content: swaggerContent,
            additional_prompt: additionalPrompt,
            test_cases: testCases,
            postman_collection: postmanCollection,
            base_url: apiBaseUrl,
            auth_token: apiAuthToken,
            updated_at: new Date().toISOString()
          })
          .eq('id', loadedTestCaseId);

        if (error) throw error;

        toast({
          title: "Test Cases Updated",
          description: `"${saveName}" has been updated successfully`
        });
      } else {
        const { error } = await supabase
          .from('saved_api_test_cases')
          .insert({
            project_id: projectId,
            user_id: user.id,
            name: saveName,
            swagger_content: swaggerContent,
            additional_prompt: additionalPrompt,
            test_cases: testCases,
            postman_collection: postmanCollection,
            base_url: apiBaseUrl,
            auth_token: apiAuthToken
          });

        if (error) throw error;

        toast({
          title: "Test Cases Saved",
          description: `"${saveName}" has been saved successfully`
        });
      }

      setIsSaveDialogOpen(false);
      setSaveName("");
      
      const { data } = await supabase
        .from('saved_api_test_cases')
        .select('id, name, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      
      setSavedTestCases(data || []);
    } catch (error) {
      console.error('Error saving test cases:', error);
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save test cases",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadTestCases = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('saved_api_test_cases')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setSwaggerContent(data.swagger_content || "");
      setAdditionalPrompt(data.additional_prompt || "");
      setTestCases((data.test_cases as string[][]) || []);
      setPostmanCollection(data.postman_collection || null);
      setApiBaseUrl(data.base_url || "");
      setApiAuthToken(data.auth_token || "");
      setLoadedTestCaseId(id);
      setSaveName(data.name || "");
      setIsEditingApiConfig(!data.base_url);

      toast({
        title: "Test Cases Loaded",
        description: `"${data.name}" has been loaded successfully`
      });
    } catch (error) {
      console.error('Error loading test cases:', error);
      toast({
        title: "Load Failed",
        description: error instanceof Error ? error.message : "Failed to load test cases",
        variant: "destructive"
      });
    }
  };

  const handleDeleteTestCases = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from('saved_api_test_cases')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Test Cases Deleted",
        description: `"${name}" has been deleted`
      });

      setSavedTestCases(prev => prev.filter(tc => tc.id !== id));
      setDeleteDialogOpen(null);
    } catch (error) {
      console.error('Error deleting test cases:', error);
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete test cases",
        variant: "destructive"
      });
    }
  };

  const parseSwaggerSpec = (spec: string) => {
    try {
      const parsedSpec = JSON.parse(spec);
      
      let baseUrl = "";
      if (parsedSpec.servers && parsedSpec.servers.length > 0) {
        baseUrl = parsedSpec.servers[0].url;
      } else if (parsedSpec.host) {
        const scheme = parsedSpec.schemes?.[0] || "https";
        baseUrl = `${scheme}://${parsedSpec.host}${parsedSpec.basePath || ""}`;
      }
      setApiBaseUrl(baseUrl);
    } catch (error) {
      console.error("Failed to parse Swagger spec:", error);
    }
  };

  const startEditTestCase = (index: number) => {
    setEditingTestCase(index);
    const testCase = [...testCases[index + 1]];
    
    let endpoint = testCase[5] || '';
    const method = testCase[6] || '';
    
    if (method && endpoint.toUpperCase().startsWith(method.toUpperCase())) {
      endpoint = endpoint.substring(method.length).trim();
    }
    
    try {
      if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
        const url = new URL(endpoint);
        endpoint = url.pathname + url.search;
      }
    } catch {}
    
    if (endpoint && !endpoint.startsWith('/')) {
      endpoint = '/' + endpoint;
    }
    
    testCase[5] = endpoint;
    setEditedTestCase(testCase);
    
    // Parse parameters (index 13)
    try {
      const paramsData = testCase[13];
      if (paramsData && paramsData !== '') {
        const parsed = JSON.parse(paramsData);
        setEditParams(Array.isArray(parsed) && parsed.length > 0 ? parsed : [{key: '', value: '', description: ''}]);
      } else {
        setEditParams([{key: '', value: '', description: ''}]);
      }
    } catch {
      setEditParams([{key: '', value: '', description: ''}]);
    }
    
    // Parse headers (index 14)
    try {
      const headersData = testCase[14];
      if (headersData && headersData !== '') {
        const parsed = JSON.parse(headersData);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          const headersArray = Object.entries(parsed).map(([key, value]) => ({
            key,
            value: String(value),
            description: ''
          }));
          setEditHeaders(headersArray.length > 0 ? headersArray : [{key: 'Content-Type', value: 'application/json', description: ''}]);
        } else {
          setEditHeaders([{key: 'Content-Type', value: 'application/json', description: ''}]);
        }
      } else {
        setEditHeaders([{key: 'Content-Type', value: 'application/json', description: ''}]);
      }
    } catch {
      setEditHeaders([{key: 'Content-Type', value: 'application/json', description: ''}]);
    }
    
    // Parse body (index 15)
    try {
      const bodyData = testCase[15];
      if (bodyData && bodyData !== '') {
        setEditBody(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData, null, 2));
      } else {
        setEditBody('');
      }
    } catch {
      setEditBody('');
    }
    
    // Parse authorization (index 16)
    try {
      const authData = testCase[16];
      if (authData && authData !== '') {
        const parsed = JSON.parse(authData);
        setEditAuth(parsed || {type: 'none', token: ''});
      } else {
        setEditAuth({type: 'none', token: ''});
      }
    } catch {
      setEditAuth({type: 'none', token: ''});
    }
    
    // Parse assertions (index 12)
    try {
      const assertionsData = testCase[12];
      if (assertionsData && assertionsData !== '') {
        const parsed = JSON.parse(assertionsData);
        setEditAssertions(Array.isArray(parsed) ? parsed : [{type: 'status_code', condition: 'equals', value: '200', description: 'Status code should be 200'}]);
      } else {
        setEditAssertions([{type: 'status_code', condition: 'equals', value: '200', description: 'Status code should be 200'}]);
      }
    } catch {
      setEditAssertions([{type: 'status_code', condition: 'equals', value: '200', description: 'Status code should be 200'}]);
    }
  };

  const cancelEditTestCase = () => {
    setEditingTestCase(null);
    setEditedTestCase([]);
    setEditParams([]);
    setEditHeaders([]);
    setEditBody('');
    setEditAuth({type: 'none', token: ''});
    setEditAssertions([]);
  };

  const saveEditedTestCase = () => {
    if (editingTestCase !== null) {
      const updatedTestCases = [...testCases];
      const updatedTestCase = [...editedTestCase];
      
      // Ensure the array has enough slots
      while (updatedTestCase.length < 17) {
        updatedTestCase.push('');
      }
      
      // Save assertions as JSON string in column 12
      updatedTestCase[12] = JSON.stringify(editAssertions);
      
      // Save parameters as JSON string in column 13
      updatedTestCase[13] = JSON.stringify(editParams.filter(p => p.key.trim() !== ''));
      
      // Save headers as JSON object in column 14
      const headersObj = editHeaders
        .filter(h => h.key.trim() !== '')
        .reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {});
      updatedTestCase[14] = JSON.stringify(headersObj);
      
      // Save body in column 15
      updatedTestCase[15] = editBody;
      
      // Save authorization as JSON string in column 16
      updatedTestCase[16] = JSON.stringify(editAuth);
      
      updatedTestCases[editingTestCase + 1] = updatedTestCase;
      setTestCases(updatedTestCases);
      
      toast({
        title: "Test Case Updated",
        description: "Your changes have been saved successfully"
      });
      
      cancelEditTestCase();
    }
  };

  const addNewTestCase = () => {
    const defaultAssertions = [{type: 'status_code', condition: 'equals', value: '200', description: 'Status code should be 200'}];
    const newTestCase = [
      `TC_${String(testCases.length).padStart(3, '0')}`,
      'New Test Case',
      'Description',
      'Functional',
      'Medium',
      '/api/endpoint',
      'GET',
      'Step 1: Execute request',
      '200 OK',
      '200',
      '',
      'API',
      JSON.stringify(defaultAssertions),
      JSON.stringify([]), // Parameters
      JSON.stringify({'Content-Type': 'application/json'}), // Headers
      '', // Body
      JSON.stringify({type: 'none', token: ''}) // Authorization
    ];
    
    const updatedTestCases = [...testCases, newTestCase];
    setTestCases(updatedTestCases);
    
    toast({
      title: "Test Case Added",
      description: "New test case has been added successfully"
    });
  };

  const removeTestCase = (index: number) => {
    const updatedTestCases = testCases.filter((_, i) => i !== index + 1);
    setTestCases(updatedTestCases);
    
    toast({
      title: "Test Case Deleted",
      description: "Test case has been removed successfully"
    });
    
    setRemoveTestCaseIndex(null);
  };

  const updateEditedField = (index: number, value: string) => {
    const updated = [...editedTestCase];
    updated[index] = value;
    setEditedTestCase(updated);
  };

  const addEditParam = () => {
    setEditParams([...editParams, {key: '', value: '', description: ''}]);
  };

  const updateEditParam = (index: number, field: 'key' | 'value' | 'description', value: string) => {
    const updated = [...editParams];
    updated[index][field] = value;
    setEditParams(updated);
  };

  const removeEditParam = (index: number) => {
    setEditParams(editParams.filter((_, i) => i !== index));
  };

  const addEditHeader = () => {
    setEditHeaders([...editHeaders, {key: '', value: '', description: ''}]);
  };

  const updateEditHeader = (index: number, field: 'key' | 'value' | 'description', value: string) => {
    const updated = [...editHeaders];
    updated[index][field] = value;
    setEditHeaders(updated);
  };

  const removeEditHeader = (index: number) => {
    setEditHeaders(editHeaders.filter((_, i) => i !== index));
  };

  const addEditAssertion = () => {
    setEditAssertions([...editAssertions, {type: 'status_code', condition: 'equals', value: '', description: ''}]);
  };

  const updateEditAssertion = (index: number, field: 'type' | 'condition' | 'value' | 'description', value: string) => {
    const updated = [...editAssertions];
    updated[index][field] = value;
    setEditAssertions(updated);
  };

  const removeEditAssertion = (index: number) => {
    setEditAssertions(editAssertions.filter((_, i) => i !== index));
  };

  const executeTestCase = async (testCaseIndex: number, endpoint: string, method: string) => {
    if (!apiBaseUrl) {
      toast({
        title: "Missing Base URL",
        description: "Please enter the API base URL first",
        variant: "destructive"
      });
      return;
    }

    setExecutingTestCase(testCaseIndex);

    try {
      let cleanEndpoint = endpoint;
      if (method && cleanEndpoint.toUpperCase().startsWith(method.toUpperCase())) {
        cleanEndpoint = cleanEndpoint.substring(method.length).trim();
      }
      
      if (cleanEndpoint && !cleanEndpoint.startsWith('/')) {
        cleanEndpoint = '/' + cleanEndpoint;
      }
      
      const baseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
      const targetUrl = `${baseUrl}${cleanEndpoint}`;
      
      // Use edge function proxy to avoid CORS issues
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiAuthToken) {
        const trimmedToken = apiAuthToken.trim();
        // Check if token already includes "Bearer" prefix to avoid double-wrapping
        if (trimmedToken.toLowerCase().startsWith('bearer ')) {
          headers["Authorization"] = trimmedToken;
        } else {
          headers["Authorization"] = `Bearer ${trimmedToken}`;
        }
      }
      
      const { data: proxyResponse, error } = await supabase.functions.invoke('api-proxy', {
        body: {
          url: targetUrl,
          method: method,
          headers: headers
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      const result = {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: proxyResponse.headers,
        data: proxyResponse.data
      };

      setTestCaseResponses(prev => ({
        ...prev,
        [testCaseIndex]: result
      }));

      toast({
        title: "API Executed",
        description: `Response: ${proxyResponse.status} ${proxyResponse.statusText}`
      });
    } catch (error) {
      const errorResult = {
        status: 0,
        statusText: "Error",
        headers: {},
        data: error instanceof Error ? error.message : "Unknown error"
      };
      
      setTestCaseResponses(prev => ({
        ...prev,
        [testCaseIndex]: errorResult
      }));
      
      toast({
        title: "Execution Failed",
        description: error instanceof Error ? error.message : "Failed to execute API",
        variant: "destructive"
      });
    } finally {
      setExecutingTestCase(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Brain className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">AI-Powered API Test Generator</h1>
      </div>
      <p className="text-muted-foreground">
        Upload your Swagger/OpenAPI specification and choose your AI provider to generate comprehensive test cases including CSV exports and Postman collections
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Swagger/OpenAPI Specification</CardTitle>
          <CardDescription>Upload or paste your API specification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="fileUpload">Upload File</Label>
            <Input
              id="fileUpload"
              type="file"
              accept=".json,.yaml,.yml"
              onChange={handleFileUpload}
              className="cursor-pointer"
            />
          </div>

          <div>
            <Label htmlFor="swaggerContent">Or Paste Content</Label>
            <Textarea
              id="swaggerContent"
              value={swaggerContent}
              onChange={(e) => setSwaggerContent(e.target.value)}
              placeholder="Paste your Swagger/OpenAPI specification here..."
              className="min-h-[300px] font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="additionalPrompt">Additional Prompt Details</Label>
            <Textarea
              id="additionalPrompt"
              value={additionalPrompt}
              onChange={(e) => setAdditionalPrompt(e.target.value)}
              placeholder="Enter any additional requirements or specifications for test case generation..."
              className="min-h-[120px]"
            />
            <p className="text-sm text-muted-foreground mt-1">
              These details will be combined with the AI prompt to customize test case generation according to your specific needs.
            </p>
          </div>

          <Button 
            onClick={generateTestCases} 
            disabled={isProcessing || !swaggerContent.trim()}
            className="w-full"
          >
            {aiProvider === 'google' ? <Brain className="mr-2 h-4 w-4" /> : <Zap className="mr-2 h-4 w-4" />}
            {isProcessing ? 'Generating...' : 'Generate Test Cases'}
          </Button>

          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground text-center">
                {progress < 30 ? "Analyzing Swagger specification..." :
                 progress < 70 ? "Generating test cases..." :
                 "Finalizing results..."}
              </p>
            </div>
          )}

          {testCases && testCases.length > 0 && (
            <div className="flex gap-2 mt-4 flex-wrap">
              <Button variant="outline" size="sm" onClick={addNewTestCase}>
                <Plus className="mr-2 h-4 w-4" />
                Add New Test Case
              </Button>
              
              <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Save className="mr-2 h-4 w-4" />
                    Save Test Cases
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save Test Cases</DialogTitle>
                    <DialogDescription>
                      Give your test cases a name to save them for later use
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="saveName">Name</Label>
                      <Input
                        id="saveName"
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        placeholder="e.g., User API Tests v1"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsSaveDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveTestCases}
                      disabled={isSaving || !saveName.trim()}
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button 
                onClick={downloadCSV} 
                variant="outline"
                size="sm"
              >
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </Button>
              
              <Button 
                onClick={downloadPostmanCollection} 
                disabled={!postmanCollection}
                variant="outline"
                size="sm"
              >
                <FileJson className="mr-2 h-4 w-4" />
                Download Postman
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {savedTestCases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saved Test Cases</CardTitle>
            <CardDescription>Load previously generated test cases</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {savedTestCases.map((saved) => (
                  <div key={saved.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent">
                    <div className="flex-1">
                      <p className="font-medium">{saved.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(saved.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleLoadTestCases(saved.id)}
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                      <AlertDialog open={deleteDialogOpen === saved.id} onOpenChange={(open) => setDeleteDialogOpen(open ? saved.id : null)}>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Test Cases</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{saved.name}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteTestCases(saved.id, saved.name)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {testCases && testCases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Test Cases</CardTitle>
            <CardDescription>Preview of AI-generated test cases and exports</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="preview" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="preview">UI Preview</TabsTrigger>
                <TabsTrigger value="postman">Postman Collection</TabsTrigger>
              </TabsList>

              <TabsContent value="postman" className="mt-4">
                <Textarea
                  value={postmanCollection ? JSON.stringify(postmanCollection, null, 2) : ''}
                  readOnly
                  className="min-h-[400px] font-mono text-sm"
                />
              </TabsContent>

              <TabsContent value="preview" className="mt-4">
                <div className="space-y-4">
                  {isEditingApiConfig && (
                    <div className="mb-4 space-y-3">
                      <div>
                        <Label htmlFor="baseUrl">API Base URL</Label>
                        <Input
                          id="baseUrl"
                          value={apiBaseUrl}
                          onChange={(e) => setApiBaseUrl(e.target.value)}
                          placeholder="https://api.example.com"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter the base URL to enable API execution
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="authToken">Authorization Token (Optional)</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            id="authToken"
                            type="password"
                            value={apiAuthToken}
                            onChange={(e) => setApiAuthToken(e.target.value)}
                            placeholder="Enter Bearer token"
                            className="flex-1"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSaveAuthToken}
                            disabled={isSavingToken || !apiAuthToken.trim()}
                          >
                            <Save className="h-4 w-4 mr-1" />
                            {isSavingToken ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Token will be sent as Bearer authorization header. Click Save to store for future use.
                        </p>
                      </div>
                      {apiBaseUrl && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => setIsEditingApiConfig(false)}
                        >
                          Done
                        </Button>
                      )}
                    </div>
                  )}
                  
                  {!isEditingApiConfig && apiBaseUrl && (
                    <div className="mb-4 p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs">Base URL</Label>
                            <p className="text-sm font-mono">{apiBaseUrl}</p>
                          </div>
                          {apiAuthToken && (
                            <div>
                              <Label className="text-xs">Auth Token</Label>
                              <p className="text-sm font-mono">••••••••{apiAuthToken.slice(-4)}</p>
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsEditingApiConfig(true)}
                        >
                          Change
                        </Button>
                      </div>
                    </div>
                  )}

                  {testCases?.slice(1).map((row, index) => {
                    const response = testCaseResponses[index];
                    const isExecuting = executingTestCase === index;
                    const isEditing = editingTestCase === index;
                    
                    return (
                      <div key={index} className="border rounded-lg p-4">
                        {isEditing ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-semibold">Edit Test Case</h4>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={cancelEditTestCase}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={saveEditedTestCase}
                                >
                                  Save
                                </Button>
                              </div>
                            </div>

                            <div className="grid gap-3 pb-3 border-b">
                              <div>
                                <Label className="text-xs">Test Case Name</Label>
                                <Input
                                  value={editedTestCase[1] || ''}
                                  onChange={(e) => updateEditedField(1, e.target.value)}
                                  className="mt-1"
                                />
                              </div>

                              <div className="flex gap-3">
                                <Select
                                  value={editedTestCase[6] || ''}
                                  onValueChange={(value) => updateEditedField(6, value)}
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="GET">GET</SelectItem>
                                    <SelectItem value="POST">POST</SelectItem>
                                    <SelectItem value="PUT">PUT</SelectItem>
                                    <SelectItem value="DELETE">DELETE</SelectItem>
                                    <SelectItem value="PATCH">PATCH</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input
                                  value={editedTestCase[5] || ''}
                                  onChange={(e) => {
                                    let value = e.target.value;
                                    if (value && !value.startsWith('/')) {
                                      value = '/' + value;
                                    }
                                    updateEditedField(5, value);
                                  }}
                                  placeholder="/api/endpoint"
                                  className="flex-1"
                                />
                              </div>
                            </div>

                            <Tabs defaultValue="params" className="w-full">
                              <TabsList className="grid w-full grid-cols-5">
                                <TabsTrigger value="params">Parameters</TabsTrigger>
                                <TabsTrigger value="body">Body</TabsTrigger>
                                <TabsTrigger value="headers">Headers</TabsTrigger>
                                <TabsTrigger value="auth">Authorization</TabsTrigger>
                                <TabsTrigger value="assertions">Assertions</TabsTrigger>
                              </TabsList>

                              <TabsContent value="params" className="space-y-2">
                                <div className="text-sm font-medium mb-2">Query Parameters</div>
                                {editParams.map((param, paramIndex) => (
                                  <div key={paramIndex} className="flex gap-2 items-start">
                                    <Input
                                      value={param.key}
                                      onChange={(e) => updateEditParam(paramIndex, 'key', e.target.value)}
                                      placeholder="Key"
                                      className="flex-1"
                                    />
                                    <Input
                                      value={param.value}
                                      onChange={(e) => updateEditParam(paramIndex, 'value', e.target.value)}
                                      placeholder="Value"
                                      className="flex-1"
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => removeEditParam(paramIndex)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={addEditParam}
                                  className="w-full"
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add Parameter
                                </Button>
                              </TabsContent>

                              <TabsContent value="body" className="space-y-2">
                                <div className="text-sm font-medium mb-2">Request Body</div>
                                <Textarea
                                  value={editBody}
                                  onChange={(e) => setEditBody(e.target.value)}
                                  placeholder="Enter request body (JSON)"
                                  className="min-h-[200px] font-mono text-xs"
                                />
                              </TabsContent>

                              <TabsContent value="headers" className="space-y-2">
                                <div className="text-sm font-medium mb-2">Headers</div>
                                {editHeaders.map((header, headerIndex) => (
                                  <div key={headerIndex} className="flex gap-2 items-start">
                                    <Input
                                      value={header.key}
                                      onChange={(e) => updateEditHeader(headerIndex, 'key', e.target.value)}
                                      placeholder="Header Name"
                                      className="flex-1"
                                    />
                                    <Input
                                      value={header.value}
                                      onChange={(e) => updateEditHeader(headerIndex, 'value', e.target.value)}
                                      placeholder="Header Value"
                                      className="flex-1"
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => removeEditHeader(headerIndex)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={addEditHeader}
                                  className="w-full"
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add Header
                                </Button>
                              </TabsContent>

                              <TabsContent value="auth" className="space-y-3">
                                <div className="text-sm font-medium mb-2">Authorization</div>
                                <div>
                                  <Label className="text-xs">Type</Label>
                                  <Select
                                    value={editAuth.type}
                                    onValueChange={(value) => setEditAuth({...editAuth, type: value})}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No Auth</SelectItem>
                                      <SelectItem value="bearer">Bearer Token</SelectItem>
                                      <SelectItem value="basic">Basic Auth</SelectItem>
                                      <SelectItem value="apikey">API Key</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {editAuth.type !== 'none' && (
                                  <div>
                                    <Label className="text-xs">Token/Key</Label>
                                    <Input
                                      value={editAuth.token}
                                      onChange={(e) => setEditAuth({...editAuth, token: e.target.value})}
                                      placeholder="Enter your token"
                                      className="mt-1"
                                      type="password"
                                    />
                                  </div>
                                )}
                              </TabsContent>

                              <TabsContent value="assertions" className="space-y-3">
                                <div className="text-sm font-medium mb-2">Test Assertions</div>
                                {editAssertions.map((assertion, assertionIndex) => (
                                  <div key={assertionIndex} className="p-3 border rounded-lg space-y-2">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-medium">Assertion {assertionIndex + 1}</span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => removeEditAssertion(assertionIndex)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-xs">Type</Label>
                                        <Select
                                          value={assertion.type}
                                          onValueChange={(value) => updateEditAssertion(assertionIndex, 'type', value)}
                                        >
                                          <SelectTrigger className="mt-1">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="status_code">Status Code</SelectItem>
                                            <SelectItem value="response_body">Response Body</SelectItem>
                                            <SelectItem value="response_header">Response Header</SelectItem>
                                            <SelectItem value="response_time">Response Time</SelectItem>
                                            <SelectItem value="json_path">JSON Path</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label className="text-xs">Condition</Label>
                                        <Select
                                          value={assertion.condition}
                                          onValueChange={(value) => updateEditAssertion(assertionIndex, 'condition', value)}
                                        >
                                          <SelectTrigger className="mt-1">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="equals">Equals</SelectItem>
                                            <SelectItem value="not_equals">Not Equals</SelectItem>
                                            <SelectItem value="contains">Contains</SelectItem>
                                            <SelectItem value="not_contains">Not Contains</SelectItem>
                                            <SelectItem value="greater_than">Greater Than</SelectItem>
                                            <SelectItem value="less_than">Less Than</SelectItem>
                                            <SelectItem value="exists">Exists</SelectItem>
                                            <SelectItem value="not_exists">Not Exists</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                    <div>
                                      <Label className="text-xs">Expected Value</Label>
                                      <Input
                                        value={assertion.value}
                                        onChange={(e) => updateEditAssertion(assertionIndex, 'value', e.target.value)}
                                        placeholder="Enter expected value"
                                        className="mt-1"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">Description</Label>
                                      <Input
                                        value={assertion.description}
                                        onChange={(e) => updateEditAssertion(assertionIndex, 'description', e.target.value)}
                                        placeholder="Describe this assertion"
                                        className="mt-1"
                                      />
                                    </div>
                                  </div>
                                ))}
                                <div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={addEditAssertion}
                                    className="w-full"
                                  >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Assertion
                                  </Button>
                                </div>
                              </TabsContent>
                            </Tabs>

                            <div className="pt-3 border-t">
                              <div>
                                <Label className="text-xs">Expected Result</Label>
                                <Textarea
                                  value={editedTestCase[8] || ''}
                                  onChange={(e) => updateEditedField(8, e.target.value)}
                                  className="mt-1 min-h-[80px]"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-medium">{row[1]}</h4>
                              <div className="flex gap-2 items-center">
                                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                                  {row[6]}
                                </span>
                                <span className={`text-xs px-2 py-1 rounded ${
                                  row[3] === 'Positive' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                                }`}>
                                  {row[3]}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => startEditTestCase(index)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => executeTestCase(index, row[5], row[6])}
                                  disabled={!apiBaseUrl || isExecuting}
                                >
                                  <Play className="mr-1 h-3 w-3" />
                                  {isExecuting ? 'Executing...' : 'Execute'}
                                </Button>
                                <AlertDialog open={removeTestCaseIndex === index} onOpenChange={(open) => setRemoveTestCaseIndex(open ? index : null)}>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Test Case</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete this test case? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => removeTestCase(index)}>
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                            
                            <div className="space-y-2 text-sm mt-3">
                              <div>
                                <span className="font-medium">Endpoint: </span>
                                <code className="bg-muted px-2 py-1 rounded text-xs">{row[5]}</code>
                              </div>
                              <div>
                                <span className="font-medium">Expected: </span>
                                <span className="text-muted-foreground">{row[8]}</span>
                              </div>
                              
                              {row[12] && (() => {
                                try {
                                  const assertions = JSON.parse(row[12]);
                                  if (Array.isArray(assertions) && assertions.length > 0) {
                                    return (
                                      <div>
                                        <span className="font-medium">Assertions:</span>
                                        <div className="mt-1 space-y-1">
                                          {assertions.map((assertion: any, idx: number) => (
                                            <div key={idx} className="text-xs bg-muted px-2 py-1 rounded">
                                              <span className="font-medium">{assertion.type}</span>
                                              {' '}{assertion.condition}{' '}
                                              <span className="text-primary">{assertion.value}</span>
                                              {assertion.description && (
                                                <span className="text-muted-foreground ml-2">
                                                  - {assertion.description}
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  }
                                } catch {}
                                return null;
                              })()}
                            </div>

                            {response && (
                              <div className="mt-4 space-y-3 border-t pt-3">
                                <div>
                                  <Label className="text-xs">Response Status</Label>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant={response.status >= 200 && response.status < 300 ? 'default' : 'destructive'}>
                                      {response.status} {response.statusText}
                                    </Badge>
                                  </div>
                                </div>

                                <div>
                                  <Label className="text-xs">Response Body</Label>
                                  <Textarea
                                    value={typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2)}
                                    readOnly
                                    className="min-h-[150px] font-mono text-xs mt-1"
                                  />
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
