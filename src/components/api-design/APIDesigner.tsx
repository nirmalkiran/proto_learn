import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plus, 
  Trash2, 
  FileJson, 
  Download, 
  Upload, 
  Copy, 
  Eye,
  Code,
  Wand2,
  PenTool,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  Link2,
  FileUp,
  Settings,
  Save,
  FolderOpen,
  Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAISafetyControls } from "@/hooks/useAISafetyControls";
import { AIContentApprovalDialog } from "@/components/AIContentApprovalDialog";
import { 
  APIEndpoint, 
  SchemaRef, 
  SchemaObject, 
  APISpecification, 
  GeneratedTestCase,
  APIFlow,
  TestExecutionResult,
  AssertionResult,
  FlowExecutionResult,
  FlowStepResult
} from "./types";
import { EndpointEditor } from "./EndpointEditor";
import { SchemaRefManager } from "./SchemaRefManager";
import { TestCasePanel } from "./TestCasePanel";
import { ExecutionResultsPanel } from "./ExecutionResultsPanel";
import { APIFlowEditor } from "./APIFlowEditor";
import { 
  EnvironmentVariablesManager, 
  Environment, 
  EnvVariable,
  injectEnvironmentVariables,
  injectVariablesIntoObject,
  createDefaultEnvironment 
} from "./EnvironmentVariablesManager";
import { 
  createNewEndpoint, 
  endpointsToOpenAPISpec, 
  openAPISpecToEndpoints,
  generateSampleFromSchema 
} from "./utils";
import jsYaml from 'js-yaml';

interface SavedAPITestCase {
  id: string;
  name: string;
  swagger_content: string | null;
  test_cases: any;
  base_url: string | null;
  auth_token: string | null;
  created_at: string;
  updated_at: string;
}

interface APIDesignerProps {
  projectId?: string;
}

export const APIDesigner = ({ projectId }: APIDesignerProps) => {
  const [endpoints, setEndpoints] = useState<APIEndpoint[]>([]);
  const [schemaRefs, setSchemaRefs] = useState<SchemaRef[]>([]);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [apiInfo, setApiInfo] = useState({
    title: 'My API',
    version: '1.0.0',
    description: ''
  });
  const [servers, setServers] = useState<Array<{ url: string; description?: string }>>([
    { url: 'https://api.example.com/v1', description: 'Production' }
  ]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'testcases' | 'results'>('basic');
  const [isGeneratingTests, setIsGeneratingTests] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingTestCaseId, setExecutingTestCaseId] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiAuthToken, setApiAuthToken] = useState("");
  const [flows, setFlows] = useState<APIFlow[]>([]);
  const [mainTab, setMainTab] = useState<'endpoints' | 'flows'>('endpoints');
  
  // Environment Variables state
  const [environments, setEnvironments] = useState<Environment[]>([createDefaultEnvironment()]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string | null>('env-default');
  
  // Save/Load state
  const [savedConfigs, setSavedConfigs] = useState<SavedAPITestCase[]>([]);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSaveId, setCurrentSaveId] = useState<string | null>(null);
  
  // Approval flow state
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [pendingTestCases, setPendingTestCases] = useState<Record<string, GeneratedTestCase[]>>({});
  const [pendingApprovalConfidence, setPendingApprovalConfidence] = useState<number>(0);
  
  const { toast } = useToast();
  const safetyControls = useAISafetyControls(projectId);

  // Load saved auth token from project integration config on mount
  useEffect(() => {
    const loadSavedAuthToken = async () => {
      if (!projectId) return;
      
      try {
        // NOTE: Supabase client generics can sometimes hit TS instantiation depth limits
        // in large apps; for this narrow query we safely fall back to an untyped client.
        const client = supabase as any;

        const { data, error } = await client
          .from('integration_configs')
          .select('config')
          .eq('project_id', projectId)
          .eq('integration_type', 'api_test_auth')
          .maybeSingle();

        if (!error && data?.config) {
          const config = data.config as { auth_token?: string; base_url?: string };
          if (config.auth_token) setApiAuthToken(config.auth_token);
          if (config.base_url) setApiBaseUrl(config.base_url);
        }
      } catch (err) {
        console.error('Error loading auth token:', err);
      }
    };

    loadSavedAuthToken();
  }, [projectId]);

  // Load saved API configurations
  useEffect(() => {
    const loadSavedConfigs = async () => {
      if (!projectId) return;
      
      try {
        const { data, error } = await supabase
          .from('saved_api_test_cases')
          .select('id, name, swagger_content, test_cases, base_url, auth_token, created_at, updated_at')
          .eq('project_id', projectId)
          .order('updated_at', { ascending: false });

        if (!error && data) {
          setSavedConfigs(data);
        }
      } catch (err) {
        console.error('Error loading saved configs:', err);
      }
    };

    loadSavedConfigs();
  }, [projectId]);

  // Save API configuration to database
  const handleSaveConfig = async () => {
    if (!projectId || !saveName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for this configuration",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const spec = generateSpec();
      const testCasesData = endpoints.reduce((acc, ep) => {
        if (ep.testCases && ep.testCases.length > 0) {
          acc[ep.id] = ep.testCases;
        }
        return acc;
      }, {} as Record<string, GeneratedTestCase[]>);

      const saveData = {
        name: saveName.trim(),
        project_id: projectId,
        user_id: user.id,
        swagger_content: JSON.stringify(spec),
        test_cases: JSON.parse(JSON.stringify({ endpoints, schemaRefs, apiInfo, servers, flows, testCasesData, environments, activeEnvironmentId })),
        base_url: apiBaseUrl || null,
        auth_token: apiAuthToken || null,
        updated_at: new Date().toISOString()
      };

      if (currentSaveId) {
        // Update existing
        const { error } = await supabase
          .from('saved_api_test_cases')
          .update(saveData)
          .eq('id', currentSaveId);
        
        if (error) throw error;
        
        setSavedConfigs(prev => prev.map(c => 
          c.id === currentSaveId ? { ...c, ...saveData } : c
        ));
      } else {
        // Create new
        const { data, error } = await supabase
          .from('saved_api_test_cases')
          .insert(saveData)
          .select()
          .single();
        
        if (error) throw error;
        
        setSavedConfigs(prev => [data, ...prev]);
        setCurrentSaveId(data.id);
      }

      toast({ title: "Configuration Saved" });
      setIsSaveDialogOpen(false);
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save configuration",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Load API configuration from database
  const handleLoadConfig = async (config: SavedAPITestCase) => {
    setIsLoading(true);
    try {
      const testCasesData = config.test_cases as any;
      
      if (testCasesData.endpoints) {
        setEndpoints(testCasesData.endpoints);
      }
      if (testCasesData.schemaRefs) {
        setSchemaRefs(testCasesData.schemaRefs);
      }
      if (testCasesData.apiInfo) {
        setApiInfo(testCasesData.apiInfo);
      }
      if (testCasesData.servers) {
        setServers(testCasesData.servers);
      }
      if (testCasesData.flows) {
        setFlows(testCasesData.flows);
      }
      if (testCasesData.environments) {
        setEnvironments(testCasesData.environments);
      }
      if (testCasesData.activeEnvironmentId) {
        setActiveEnvironmentId(testCasesData.activeEnvironmentId);
      }
      
      if (config.base_url) setApiBaseUrl(config.base_url);
      if (config.auth_token) setApiAuthToken(config.auth_token);
      
      setCurrentSaveId(config.id);
      setSaveName(config.name);
      
      if (testCasesData.endpoints?.length > 0) {
        setSelectedEndpointId(testCasesData.endpoints[0].id);
      }

      toast({
        title: "Configuration Loaded",
        description: `Loaded "${config.name}" with ${testCasesData.endpoints?.length || 0} endpoints`
      });
      setIsLoadDialogOpen(false);
    } catch (error) {
      toast({
        title: "Load Failed",
        description: "Failed to load configuration",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Delete saved configuration
  const handleDeleteConfig = async (configId: string) => {
    try {
      const { error } = await supabase
        .from('saved_api_test_cases')
        .delete()
        .eq('id', configId);
      
      if (error) throw error;
      
      setSavedConfigs(prev => prev.filter(c => c.id !== configId));
      
      if (currentSaveId === configId) {
        setCurrentSaveId(null);
        setSaveName("");
      }

      toast({ title: "Configuration Deleted" });
    } catch (error) {
      toast({
        title: "Delete Failed",
        variant: "destructive"
      });
    }
  };

  const methodColors: Record<string, string> = {
    GET: 'bg-emerald-500 text-white',
    POST: 'bg-blue-500 text-white',
    PUT: 'bg-amber-500 text-white',
    DELETE: 'bg-red-500 text-white',
    PATCH: 'bg-purple-500 text-white',
  };

  const parseSpec = (content: string): any => {
    // Try JSON first
    try {
      return JSON.parse(content);
    } catch {
      // Try YAML
      try {
        return jsYaml.load(content);
      } catch {
        throw new Error("Invalid specification format. Please provide valid JSON or YAML.");
      }
    }
  };

  const handleImportSpec = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const spec = parseSpec(content);
      
      const { endpoints: parsedEndpoints, schemaRefs: parsedRefs, info, servers: parsedServers } = 
        openAPISpecToEndpoints(spec);
      
      // Mark all endpoints as selected by default
      const endpointsWithSelection = parsedEndpoints.map(ep => ({ ...ep, isSelected: true }));
      
      setEndpoints(endpointsWithSelection);
      setSchemaRefs(parsedRefs);
      setApiInfo({ ...info, description: info.description || '' });
      if (parsedServers && parsedServers.length > 0) {
        setServers(parsedServers);
        setApiBaseUrl(parsedServers[0].url);
      }
      if (endpointsWithSelection.length > 0) {
        setSelectedEndpointId(endpointsWithSelection[0].id);
      }

      toast({
        title: "Specification Imported",
        description: `Loaded ${parsedEndpoints.length} endpoints and ${parsedRefs.length} schemas`
      });
    } catch (error) {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Invalid specification file",
        variant: "destructive"
      });
    }
    event.target.value = '';
  };

  const handleAddEndpoint = () => {
    const newEndpoint = createNewEndpoint();
    newEndpoint.isSelected = true;
    setEndpoints([...endpoints, newEndpoint]);
    setSelectedEndpointId(newEndpoint.id);
  };

  const handleUpdateEndpoint = (updated: APIEndpoint) => {
    setEndpoints(endpoints.map(e => e.id === updated.id ? updated : e));
  };

  const handleDeleteEndpoint = (id: string) => {
    setEndpoints(endpoints.filter(e => e.id !== id));
    if (selectedEndpointId === id) {
      setSelectedEndpointId(endpoints.length > 1 ? endpoints[0].id : null);
    }
  };

  const handleDuplicateEndpoint = (endpoint: APIEndpoint) => {
    const newEndpoint = {
      ...endpoint,
      id: crypto.randomUUID(),
      path: `${endpoint.path}_copy`,
      summary: `${endpoint.summary} (Copy)`,
      isSelected: true,
      testCases: undefined
    };
    setEndpoints([...endpoints, newEndpoint]);
    setSelectedEndpointId(newEndpoint.id);
  };

  const toggleEndpointSelection = (id: string) => {
    setEndpoints(endpoints.map(e => 
      e.id === id ? { ...e, isSelected: !e.isSelected } : e
    ));
  };

  const selectAllEndpoints = () => {
    setEndpoints(endpoints.map(e => ({ ...e, isSelected: true })));
  };

  const deselectAllEndpoints = () => {
    setEndpoints(endpoints.map(e => ({ ...e, isSelected: false })));
  };

  const resolveRef = (refPath: string): SchemaObject | undefined => {
    const refName = refPath.replace('#/components/schemas/', '');
    return schemaRefs.find(r => r.name === refName)?.schema;
  };

  const generateSpec = (): APISpecification => {
    return endpointsToOpenAPISpec(endpoints, schemaRefs, apiInfo, servers);
  };

  // Build a spec with only selected endpoints for test generation
  const buildSelectedEndpointsSpec = (selectedEndpoints: APIEndpoint[]): APISpecification => {
    return endpointsToOpenAPISpec(selectedEndpoints, schemaRefs, apiInfo, servers);
  };

  const handleExportSpec = () => {
    const spec = generateSpec();
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${apiInfo.title.replace(/\s+/g, '_').toLowerCase()}_openapi.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Specification Exported",
      description: "OpenAPI specification downloaded as JSON"
    });
  };

  const handleCopySpec = () => {
    const spec = generateSpec();
    navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
    toast({
      title: "Copied to Clipboard",
      description: "OpenAPI specification copied"
    });
  };

  const generateTestCases = async () => {
    const selectedEndpoints = endpoints.filter(e => e.isSelected);
    if (selectedEndpoints.length === 0) {
      toast({
        title: "No Endpoints Selected",
        description: "Please select at least one endpoint to generate test cases",
        variant: "destructive"
      });
      return;
    }

    // Check rate limit before proceeding
    if (projectId) {
      const rate = safetyControls.checkRateLimit();
      const canProceed = rate.allowed;
      if (!canProceed) {
        toast({
          title: "Rate limit reached",
          description: "Daily AI generation limit reached. Try again tomorrow.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsGeneratingTests(true);
    setGenerationProgress(0);

    try {
      // Get Azure OpenAI configuration
      if (!projectId) {
        throw new Error('Project ID is required for test case generation');
      }

      const { data: configData, error: configError } = await (supabase as any)
        .from('integration_configs')
        .select('config')
        .eq('project_id', projectId)
        .eq('integration_type', 'openai')
        .single();

      if (configError || !configData) {
        throw new Error('Azure OpenAI not configured. Please configure it in the Integrations section.');
      }

      const azureConfig = configData.config as any;
      if (!azureConfig?.endpoint || !azureConfig?.apiKey || !azureConfig?.deploymentId) {
        throw new Error('Azure OpenAI configuration incomplete.');
      }

      // Batch endpoints into smaller groups to avoid token limits
      const BATCH_SIZE = 15; // Process 15 endpoints at a time
      const batches: APIEndpoint[][] = [];
      for (let i = 0; i < selectedEndpoints.length; i += BATCH_SIZE) {
        batches.push(selectedEndpoints.slice(i, i + BATCH_SIZE));
      }

      const allTestCasesByEndpoint: Record<string, GeneratedTestCase[]> = {};
      let processedBatches = 0;

      for (const batch of batches) {
        // Build a spec with ONLY the batch endpoints
        const batchSpec = buildSelectedEndpointsSpec(batch);
        
        const progressPercentage = Math.round((processedBatches / batches.length) * 80) + 10;
        setGenerationProgress(progressPercentage);

        const { data, error } = await supabase.functions.invoke('swagger-to-test-cases-openai', {
          body: {
            swaggerSpec: batchSpec,
            projectId,
            azureConfig,
            endpointCount: batch.length
          }
        });

        if (error) {
          console.error('Batch generation error:', error);
          // Continue with other batches even if one fails
        } else if (data.success && data.csvData) {
          // Parse CSV data into test cases for this batch
          const batchTestCases = parseTestCasesToEndpoints(data.csvData, batch);
          
          // Merge results
          Object.entries(batchTestCases).forEach(([endpointId, testCases]) => {
            allTestCasesByEndpoint[endpointId] = testCases;
          });
        }

        processedBatches++;
      }

      const totalGenerated = Object.values(allTestCasesByEndpoint).reduce((acc, tc) => acc + tc.length, 0);
      setGenerationProgress(100);

      // Check if approval is required for API test cases
      const requiresApproval = safetyControls.safetyConfig.requireApprovalForAPITestCases;
      
      if (requiresApproval && totalGenerated > 0) {
        // Store pending test cases for approval
        setPendingTestCases(allTestCasesByEndpoint);
        setPendingApprovalConfidence(0.85); // Default confidence for API test cases
        setShowApprovalDialog(true);
        
        toast({
          title: "Test Cases Ready for Review",
          description: `${totalGenerated} test cases generated and waiting for approval`
        });
      } else {
        // Auto-approve - update endpoints directly
        setEndpoints(endpoints.map(ep => ({
          ...ep,
          testCases: ep.isSelected ? (allTestCasesByEndpoint[ep.id] || []) : ep.testCases
        })));

        toast({
          title: "Test Cases Generated",
          description: `Generated ${totalGenerated} test cases for ${selectedEndpoints.length} endpoints (${batches.length} batches)`
        });

        // Switch to test cases tab for selected endpoint
        setActiveTab('testcases');
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate test cases",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingTests(false);
      setGenerationProgress(0);
    }
  };

  const parseTestCasesToEndpoints = (
    csvData: string[][], 
    selectedEndpoints: APIEndpoint[]
  ): Record<string, GeneratedTestCase[]> => {
    const result: Record<string, GeneratedTestCase[]> = {};
    
    // Initialize result for all selected endpoints
    selectedEndpoints.forEach(ep => {
      result[ep.id] = [];
    });
    
    // Helper to normalize paths for comparison
    const normalizePath = (path: string): string => {
      return path
        .replace(/\{[^}]+\}/g, '{param}')  // Replace all path params with {param}
        .replace(/\/+/g, '/')               // Normalize multiple slashes
        .replace(/\/$/, '')                 // Remove trailing slash
        .toLowerCase();
    };
    
    // Skip header row
    for (let i = 1; i < csvData.length; i++) {
      const row = csvData[i];
      const rawEndpoint = row[5] || ''; // Endpoint column - now contains just the path
      const method = (row[6] || 'GET').toUpperCase();
      
      // Clean the endpoint path (remove method prefix if present)
      const endpointPath = rawEndpoint.replace(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+/i, '').trim();
      const normalizedTestPath = normalizePath(endpointPath);
      
      // Match to an endpoint - improved matching logic with scoring
      let bestMatch: APIEndpoint | null = null;
      let bestScore = 0;
      
      for (const ep of selectedEndpoints) {
        let score = 0;
        
        // Method must match for any consideration
        if (ep.method !== method) continue;
        
        const normalizedEpPath = normalizePath(ep.path);
        
        // Exact match - highest priority
        if (normalizedEpPath === normalizedTestPath) {
          score = 100;
        } 
        // Path segments match
        else {
          const epSegments = normalizedEpPath.split('/').filter(Boolean);
          const testSegments = normalizedTestPath.split('/').filter(Boolean);
          
          // Same number of segments is a good sign
          if (epSegments.length === testSegments.length) {
            let matchingSegments = 0;
            for (let j = 0; j < epSegments.length; j++) {
              if (epSegments[j] === testSegments[j] || epSegments[j] === '{param}' || testSegments[j] === '{param}') {
                matchingSegments++;
              }
            }
            score = (matchingSegments / epSegments.length) * 80;
          }
          
          // Partial path match
          if (normalizedTestPath.includes(normalizedEpPath)) {
            score = Math.max(score, 50);
          }
          if (normalizedEpPath.includes(normalizedTestPath)) {
            score = Math.max(score, 50);
          }
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = ep;
        }
      }

      // Only require a minimum match threshold (50%)
      if (bestMatch && bestScore >= 50) {
        const testCase: GeneratedTestCase = {
          id: crypto.randomUUID(),
          name: row[1] || 'Test Case',
          description: row[2] || '',
          type: determineTestType(row[3] || ''),
          priority: (row[4] as 'High' | 'Medium' | 'Low') || 'Medium',
          method: method,
          endpoint: bestMatch.path, // Use the actual endpoint path for consistency
          expectedStatus: parseInt(row[9]) || 200,
          assertions: parseAssertions(row[12]),
          parameters: parseJsonSafe(row[13]),
          headers: parseJsonSafe(row[14]),
          body: row[15] ? parseJsonSafe(row[15]) : undefined
        };

        result[bestMatch.id].push(testCase);
      } else {
        // Log unmatched test cases for debugging
        console.warn(`Could not match test case: ${method} ${endpointPath} (score: ${bestScore})`);
      }
    }

    return result;
  };

  const determineTestType = (typeStr: string): GeneratedTestCase['type'] => {
    const lower = typeStr.toLowerCase();
    if (lower.includes('negative')) return 'negative';
    if (lower.includes('edge')) return 'edge';
    if (lower.includes('security')) return 'security';
    return 'positive';
  };

  const parseAssertions = (assertionStr: string): GeneratedTestCase['assertions'] => {
    try {
      const parsed = JSON.parse(assertionStr);
      if (Array.isArray(parsed)) {
        return parsed.map(a => ({
          type: a.type || 'status_code',
          condition: a.condition || 'equals',
          value: String(a.value || ''),
          description: a.description || ''
        }));
      }
    } catch {}
    return [{ type: 'status_code', condition: 'equals', value: '200', description: 'Status code check' }];
  };

  const parseJsonSafe = (str: string): any => {
    if (!str) return undefined;
    try {
      return JSON.parse(str);
    } catch {
      return undefined;
    }
  };

  const executeTestCase = async (testCase: GeneratedTestCase): Promise<void> => {
    if (!apiBaseUrl) {
      toast({
        title: "Missing Base URL",
        description: "Please configure the API base URL in Settings",
        variant: "destructive"
      });
      return;
    }

    setExecutingTestCaseId(testCase.id);
    const startTime = Date.now();

    // Get active environment variables for injection
    const activeEnv = environments.find(e => e.id === activeEnvironmentId);
    const envVariables = activeEnv?.variables.filter(v => v.enabled) || [];

    try {
      // Inject environment variables into base URL and endpoint
      const injectedBaseUrl = injectEnvironmentVariables(apiBaseUrl, envVariables);
      const baseUrl = injectedBaseUrl.endsWith('/') ? injectedBaseUrl.slice(0, -1) : injectedBaseUrl;
      let endpoint = injectEnvironmentVariables(testCase.endpoint, envVariables);
      if (!endpoint.startsWith('/')) endpoint = '/' + endpoint;
      const targetUrl = `${baseUrl}${endpoint}`;

      // Inject variables into headers
      const injectedTestHeaders = injectVariablesIntoObject(testCase.headers || {}, envVariables);
      const headers: Record<string, string> = { 
        "Content-Type": "application/json",
        ...injectedTestHeaders
      };
      
      // Inject variables into auth token
      const injectedAuthToken = injectEnvironmentVariables(apiAuthToken, envVariables);
      if (injectedAuthToken) {
        const trimmedToken = injectedAuthToken.trim();
        headers["Authorization"] = trimmedToken.toLowerCase().startsWith('bearer ') 
          ? trimmedToken 
          : `Bearer ${trimmedToken}`;
      }
      
      // Inject variables into body
      const injectedBody = testCase.body ? injectVariablesIntoObject(testCase.body, envVariables) : undefined;

      const { data: proxyResponse, error } = await supabase.functions.invoke('api-proxy', {
        body: {
          url: targetUrl,
          method: testCase.method,
          headers,
          body: injectedBody ? JSON.stringify(injectedBody) : undefined
        }
      });

      if (error) throw error;

      const responseTime = Date.now() - startTime;
      const assertionResults = evaluateAssertions(testCase.assertions, proxyResponse);
      const allPassed = assertionResults.every(r => r.passed);

      const executionResult: TestExecutionResult = {
        timestamp: new Date().toISOString(),
        status: allPassed ? 'passed' : 'failed',
        responseStatus: proxyResponse.status,
        responseTime,
        responseData: proxyResponse.data,
        responseHeaders: proxyResponse.headers,
        assertionResults
      };

      // Update the endpoint with the test result - add to history
      setEndpoints(prev => prev.map(ep => ({
        ...ep,
        testCases: ep.testCases?.map(tc => 
          tc.id === testCase.id ? { 
            ...tc, 
            lastExecution: executionResult,
            executionHistory: [executionResult, ...(tc.executionHistory || [])].slice(0, 50) // Keep last 50
          } : tc
        )
      })));

      toast({
        title: allPassed ? "Test Passed" : "Test Failed",
        description: `${testCase.name}: ${proxyResponse.status} (${responseTime}ms)`,
        variant: allPassed ? "default" : "destructive"
      });
    } catch (error) {
      const executionResult: TestExecutionResult = {
        timestamp: new Date().toISOString(),
        status: 'error',
        responseStatus: 0,
        responseTime: Date.now() - startTime,
        assertionResults: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      setEndpoints(prev => prev.map(ep => ({
        ...ep,
        testCases: ep.testCases?.map(tc => 
          tc.id === testCase.id ? { 
            ...tc, 
            lastExecution: executionResult,
            executionHistory: [executionResult, ...(tc.executionHistory || [])].slice(0, 50)
          } : tc
        )
      })));

      toast({
        title: "Execution Error",
        description: error instanceof Error ? error.message : "Failed to execute test",
        variant: "destructive"
      });
    } finally {
      setExecutingTestCaseId(null);
    }
  };

  const evaluateAssertions = (
    assertions: GeneratedTestCase['assertions'], 
    response: any
  ): AssertionResult[] => {
    return assertions.map(assertion => {
      let passed = false;
      let actualValue: any;

      switch (assertion.type) {
        case 'status_code':
          actualValue = response.status;
          passed = evaluateCondition(actualValue, assertion.condition, assertion.value);
          break;
        case 'response_body':
          actualValue = JSON.stringify(response.data);
          passed = evaluateCondition(actualValue, assertion.condition, assertion.value);
          break;
        case 'response_time':
          actualValue = response.responseTime || 0;
          passed = evaluateCondition(actualValue, assertion.condition, assertion.value);
          break;
        case 'json_path':
          actualValue = extractJsonPath(response.data, assertion.path || '');
          passed = evaluateCondition(actualValue, assertion.condition, assertion.value);
          break;
      }

      return {
        assertion,
        passed,
        actualValue,
        message: passed ? 'Assertion passed' : `Expected ${assertion.condition} ${assertion.value}, got ${actualValue}`
      };
    });
  };

  const evaluateCondition = (actual: any, condition: string, expected: string): boolean => {
    const actualStr = String(actual);
    const expectedNum = parseFloat(expected);
    const actualNum = typeof actual === 'number' ? actual : parseFloat(actualStr);

    switch (condition) {
      case 'equals':
        return actualStr === expected || actualNum === expectedNum;
      case 'not_equals':
        return actualStr !== expected && actualNum !== expectedNum;
      case 'contains':
        return actualStr.includes(expected);
      case 'greater_than':
        return actualNum > expectedNum;
      case 'less_than':
        return actualNum < expectedNum;
      case 'exists':
        return actual !== undefined && actual !== null;
      case 'not_exists':
        return actual === undefined || actual === null;
      default:
        return false;
    }
  };

  const extractJsonPath = (data: any, path: string): any => {
    if (!path || !path.startsWith('$.')) return undefined;
    const parts = path.slice(2).split('.');
    let current = data;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      if (part.includes('[') && part.includes(']')) {
        const [key, indexStr] = part.split('[');
        const index = parseInt(indexStr.replace(']', ''));
        current = current[key]?.[index];
      } else {
        current = current[part];
      }
    }
    return current;
  };

  const updateTestCase = (updatedTestCase: GeneratedTestCase) => {
    setEndpoints(prev => prev.map(endpoint => {
      if (endpoint.id === selectedEndpointId && endpoint.testCases) {
        return {
          ...endpoint,
          testCases: endpoint.testCases.map(tc => 
            tc.id === updatedTestCase.id ? updatedTestCase : tc
          )
        };
      }
      return endpoint;
    }));
    toast({
      title: "Test Case Updated",
      description: "Your changes have been saved"
    });
  };

  const addTestCase = (newTestCase: GeneratedTestCase) => {
    setEndpoints(prev => prev.map(endpoint => {
      if (endpoint.id === selectedEndpointId) {
        return {
          ...endpoint,
          testCases: [...(endpoint.testCases || []), newTestCase]
        };
      }
      return endpoint;
    }));
    toast({
      title: "Test Case Added",
      description: "New test case has been created"
    });
  };

  const deleteTestCase = (testCaseId: string) => {
    setEndpoints(prev => prev.map(endpoint => {
      if (endpoint.id === selectedEndpointId && endpoint.testCases) {
        return {
          ...endpoint,
          testCases: endpoint.testCases.filter(tc => tc.id !== testCaseId)
        };
      }
      return endpoint;
    }));
    toast({
      title: "Test Case Deleted",
      description: "Test case has been removed"
    });
  };

  const executeSelectedTestCases = async (selectedIds: string[]) => {
    const selectedEndpoint = endpoints.find(e => e.id === selectedEndpointId);
    if (!selectedEndpoint?.testCases) return;

    const selectedTestCases = selectedEndpoint.testCases.filter(tc => selectedIds.includes(tc.id));
    if (selectedTestCases.length === 0) return;

    setIsExecuting(true);
    for (const testCase of selectedTestCases) {
      await executeTestCase(testCase);
    }
    setIsExecuting(false);
  };

  const executeFlow = async (flow: APIFlow): Promise<FlowExecutionResult | undefined> => {
    if (!apiBaseUrl) {
      toast({
        title: "Missing Base URL",
        description: "Please configure the API base URL",
        variant: "destructive"
      });
      return undefined;
    }

    setIsExecuting(true);
    const variables: Record<string, any> = {};
    const stepResults: FlowStepResult[] = [];
    const flowStartTime = Date.now();

    try {
      for (const step of flow.steps.sort((a, b) => a.order - b.order)) {
        const endpoint = endpoints.find(e => e.id === step.endpointId);
        const testCase = endpoint?.testCases?.find(tc => tc.id === step.testCaseId);
        
        if (!endpoint || !testCase) {
          stepResults.push({
            stepId: step.id,
            stepOrder: step.order,
            endpointPath: 'Unknown',
            method: 'GET',
            testCaseName: 'Unknown',
            status: 'skipped',
            responseStatus: 0,
            responseTime: 0,
            error: 'Endpoint or test case not found'
          });
          continue;
        }

        // Inject variables into request
        let modifiedTestCase = { ...testCase };
        if (step.injectVariables?.length) {
          modifiedTestCase = injectVariables(modifiedTestCase, step.injectVariables, variables);
        }

        const stepStartTime = Date.now();
        
        // Execute the test case
        await executeTestCase(modifiedTestCase);

        // Get the result from the executed test case
        const executedEndpoint = endpoints.find(e => e.id === step.endpointId);
        const executedTestCase = executedEndpoint?.testCases?.find(tc => tc.id === step.testCaseId);
        const lastExecution = executedTestCase?.lastExecution;
        
        const extractedVars: Record<string, any> = {};
        
        if (lastExecution && step.extractVariables?.length) {
          for (const extraction of step.extractVariables) {
            if (extraction.source === 'response_body' && extraction.jsonPath) {
              const value = extractJsonPath(lastExecution.responseData, extraction.jsonPath);
              variables[extraction.variableName] = value;
              extractedVars[extraction.variableName] = value;
            } else if (extraction.source === 'response_header' && extraction.headerName) {
              const value = lastExecution.responseHeaders?.[extraction.headerName];
              variables[extraction.variableName] = value;
              extractedVars[extraction.variableName] = value;
            }
          }
        }

        stepResults.push({
          stepId: step.id,
          stepOrder: step.order,
          endpointPath: endpoint.path,
          method: endpoint.method,
          testCaseName: testCase.name,
          status: lastExecution?.status || 'error',
          responseStatus: lastExecution?.responseStatus || 0,
          responseTime: lastExecution?.responseTime || (Date.now() - stepStartTime),
          responseData: lastExecution?.responseData,
          extractedVariables: Object.keys(extractedVars).length > 0 ? extractedVars : undefined,
          error: lastExecution?.error
        });
      }

      const passedSteps = stepResults.filter(r => r.status === 'passed').length;
      const failedSteps = stepResults.filter(r => r.status === 'failed' || r.status === 'error').length;
      
      const flowResult: FlowExecutionResult = {
        id: crypto.randomUUID(),
        flowId: flow.id,
        flowName: flow.name,
        timestamp: new Date().toISOString(),
        status: failedSteps > 0 ? 'failed' : 'passed',
        totalSteps: stepResults.length,
        passedSteps,
        failedSteps,
        totalDuration: Date.now() - flowStartTime,
        stepResults
      };

      // Update the flow with execution result
      setFlows(prev => prev.map(f => 
        f.id === flow.id ? { ...f, lastExecution: flowResult } : f
      ));

      toast({
        title: failedSteps > 0 ? "Flow Completed with Failures" : "Flow Completed Successfully",
        description: `${passedSteps}/${stepResults.length} steps passed (${flowResult.totalDuration}ms)`,
        variant: failedSteps > 0 ? "destructive" : "default"
      });

      return flowResult;
    } catch (error) {
      const flowResult: FlowExecutionResult = {
        id: crypto.randomUUID(),
        flowId: flow.id,
        flowName: flow.name,
        timestamp: new Date().toISOString(),
        status: 'error',
        totalSteps: flow.steps.length,
        passedSteps: stepResults.filter(r => r.status === 'passed').length,
        failedSteps: stepResults.filter(r => r.status !== 'passed').length,
        totalDuration: Date.now() - flowStartTime,
        stepResults
      };

      setFlows(prev => prev.map(f => 
        f.id === flow.id ? { ...f, lastExecution: flowResult } : f
      ));

      toast({
        title: "Flow Error",
        description: error instanceof Error ? error.message : "Flow execution failed",
        variant: "destructive"
      });

      return flowResult;
    } finally {
      setIsExecuting(false);
    }
  };

  const injectVariables = (
    testCase: GeneratedTestCase, 
    injections: any[], 
    variables: Record<string, any>
  ): GeneratedTestCase => {
    let modified = { ...testCase };
    
    for (const injection of injections) {
      const value = variables[injection.variableName];
      if (value === undefined) continue;

      switch (injection.target) {
        case 'path':
          modified.endpoint = modified.endpoint.replace(`{${injection.paramName}}`, String(value));
          break;
        case 'query':
          // Add to parameters
          break;
        case 'header':
          modified.headers = { ...modified.headers, [injection.paramName!]: String(value) };
          break;
        case 'body':
          // Would need to modify body at jsonPath
          break;
      }
    }

    return modified;
  };

  const handleAddServer = () => {
    setServers([...servers, { url: 'https://api.example.com', description: '' }]);
  };

  const handleRemoveServer = (index: number) => {
    setServers(servers.filter((_, i) => i !== index));
  };

  const saveApiConfig = async () => {
    if (!projectId) return;

    try {
      const { data: existing } = await (supabase as any)
        .from('integration_configs')
        .select('id')
        .eq('project_id', projectId)
        .eq('integration_type', 'api_test_auth')
        .maybeSingle();

      const config = { auth_token: apiAuthToken, base_url: apiBaseUrl };

      if (existing) {
        await (supabase as any)
          .from('integration_configs')
          .update({ config, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        await (supabase as any)
          .from('integration_configs')
          .insert([
            {
              project_id: projectId,
              user_id: user.id,
              integration_type: 'api_test_auth',
              enabled: true,
              config,
              updated_at: new Date().toISOString(),
            },
          ]);
      }

      toast({ title: "Configuration Saved" });
    } catch (err) {
      toast({ title: "Save Failed", variant: "destructive" });
    }
  };

  // Handle approval of pending API test cases
  const handleApproveTestCases = async (approvedItems: any[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Convert approved items back to test cases by endpoint
      const approvedTestCases: Record<string, GeneratedTestCase[]> = {};
      approvedItems.forEach((item: any) => {
        // Find which endpoint this test case belongs to
        for (const [endpointId, testCases] of Object.entries(pendingTestCases)) {
          const found = (testCases as GeneratedTestCase[]).find(tc => tc.id === item.id);
          if (found) {
            if (!approvedTestCases[endpointId]) {
              approvedTestCases[endpointId] = [];
            }
            approvedTestCases[endpointId].push({ ...found, ...item });
            break;
          }
        }
      });

      // Update endpoints with approved test cases
      setEndpoints(endpoints.map(ep => ({
        ...ep,
        testCases: approvedTestCases[ep.id] || ep.testCases
      })));

       // Log approval to audit
       if (user && projectId) {
         const totalApproved = approvedItems.length;
         const originalContent = JSON.stringify(pendingTestCases);

         await (supabase as any).from('qa_ai_feedback').insert([
           {
             user_id: user.id,
             project_id: projectId,
             feature_type: 'api_test_case',
             feedback_type: 'approved',
             comment: `Approved ${totalApproved} API test cases`,
             ai_output: {
               original_content: originalContent,
               edited_content: JSON.stringify(approvedTestCases),
             },
           },
         ]);
       }

      toast({
        title: "API Test Cases Approved",
        description: `${approvedItems.length} test cases added to endpoints`
      });

      // Switch to test cases tab
      setActiveTab('testcases');
    } catch (error) {
      console.error('Approval error:', error);
      toast({
        title: "Approval Failed",
        description: "Failed to save approved test cases",
        variant: "destructive"
      });
    } finally {
      setPendingTestCases({});
      setShowApprovalDialog(false);
    }
  };

  // Handle rejection of pending API test cases
  const handleRejectTestCases = async (reason: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

       // Log rejection to audit
       if (user && projectId) {
         await (supabase as any).from('qa_ai_feedback').insert([
           {
             user_id: user.id,
             project_id: projectId,
             feature_type: 'api_test_case',
             feedback_type: 'rejected',
             comment: reason || 'Rejected API test cases',
             ai_output: {
               original_content: JSON.stringify(pendingTestCases),
             },
           },
         ]);
       }

      toast({
        title: "API Test Cases Rejected",
        description: "The generated test cases were not saved"
      });
    } catch (error) {
      console.error('Rejection error:', error);
    } finally {
      setPendingTestCases({});
      setShowApprovalDialog(false);
    }
  };

  const selectedEndpoint = endpoints.find(e => e.id === selectedEndpointId);
  const selectedCount = endpoints.filter(e => e.isSelected).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PenTool className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">API Testing</h1>
        </div>
        <div className="flex gap-2 items-center">
          <EnvironmentVariablesManager
            environments={environments}
            activeEnvironmentId={activeEnvironmentId}
            onEnvironmentsChange={setEnvironments}
            onActiveEnvironmentChange={setActiveEnvironmentId}
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsLoadDialogOpen(true)}
            disabled={savedConfigs.length === 0}
          >
            <FolderOpen className="h-4 w-4 mr-1" />
            Load ({savedConfigs.length})
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              if (!currentSaveId) setSaveName(apiInfo.title || 'API Configuration');
              setIsSaveDialogOpen(true);
            }}
            disabled={endpoints.length === 0}
          >
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>
          <label>
            <input
              type="file"
              accept=".json,.yaml,.yml,.html,.htm"
              onChange={handleImportSpec}
              className="hidden"
            />
            <Button variant="outline" size="sm" asChild>
              <span className="cursor-pointer">
                <Upload className="h-4 w-4 mr-1" />
                Import
              </span>
            </Button>
          </label>
          <Button variant="outline" size="sm" onClick={handleExportSpec} disabled={endpoints.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsPreviewOpen(true)} disabled={endpoints.length === 0}>
            <Eye className="h-4 w-4 mr-1" />
            Preview
          </Button>
          <Button 
            size="sm" 
            onClick={generateTestCases}
            disabled={isGeneratingTests || selectedCount === 0}
          >
            {isGeneratingTests ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-1" />
            )}
            Generate Tests ({selectedCount})
          </Button>
        </div>
      </div>

      {isGeneratingTests && (
        <div className="space-y-2">
          <Progress value={generationProgress} />
          <p className="text-sm text-muted-foreground text-center">
            Generating test cases for {selectedCount} endpoints...
          </p>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'endpoints' | 'flows')}>
        <TabsList>
          <TabsTrigger value="endpoints" className="gap-2">
            <FileJson className="h-4 w-4" />
            Endpoints ({endpoints.length})
          </TabsTrigger>
          <TabsTrigger value="flows" className="gap-2">
            <Link2 className="h-4 w-4" />
            E2E Flows ({flows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints" className="mt-4">
          <div className="grid grid-cols-12 gap-4">
            {/* Endpoint List */}
            <div className="col-span-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Endpoints</CardTitle>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={selectAllEndpoints}>
                        All
                      </Button>
                      <Button variant="ghost" size="sm" onClick={deselectAllEndpoints}>
                        None
                      </Button>
                      <Button size="sm" onClick={handleAddEndpoint}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {endpoints.length === 0 ? (
                      <div className="text-center py-8">
                        <FileUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground mb-4">
                          Import a Swagger/OpenAPI spec or create endpoints manually
                        </p>
                        <label>
                          <input
                            type="file"
                            accept=".json,.yaml,.yml"
                            onChange={handleImportSpec}
                            className="hidden"
                          />
                          <Button variant="outline" asChild>
                            <span className="cursor-pointer">
                              <Upload className="h-4 w-4 mr-1" />
                              Import Specification
                            </span>
                          </Button>
                        </label>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {endpoints.map(endpoint => (
                          <div
                            key={endpoint.id}
                            className={`p-3 border rounded-lg cursor-pointer transition-all ${
                              selectedEndpointId === endpoint.id 
                                ? 'border-primary bg-primary/5' 
                                : 'hover:bg-muted/50'
                            }`}
                            onClick={() => setSelectedEndpointId(endpoint.id)}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Checkbox
                                checked={endpoint.isSelected}
                                onCheckedChange={() => toggleEndpointSelection(endpoint.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <Badge className={`${methodColors[endpoint.method]} text-xs px-1.5`}>
                                {endpoint.method}
                              </Badge>
                              <span className="text-sm font-mono truncate flex-1">
                                {endpoint.path}
                              </span>
                              {endpoint.testCases && endpoint.testCases.length > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {endpoint.testCases.length} tests
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate ml-6">
                              {endpoint.summary || 'No description'}
                            </p>
                            <div className="flex gap-1 mt-2 ml-6">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateEndpoint(endpoint);
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteEndpoint(endpoint.id);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Endpoint Editor / Test Cases */}
            <div className="col-span-8">
              {selectedEndpoint ? (
                <div className="space-y-4">
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'basic' | 'testcases' | 'results')}>
                    <TabsList>
                      <TabsTrigger value="basic">Basic Information</TabsTrigger>
                      <TabsTrigger value="testcases" className="gap-2">
                        Test Cases
                        {selectedEndpoint.testCases && (
                          <Badge variant="secondary" className="ml-1">
                            {selectedEndpoint.testCases.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="results" className="gap-2">
                        Execution Results
                        {selectedEndpoint.testCases && (
                          <Badge variant="secondary" className="ml-1">
                            {selectedEndpoint.testCases.reduce((sum, tc) => 
                              sum + (tc.executionHistory?.length || (tc.lastExecution ? 1 : 0)), 0
                            )}
                          </Badge>
                        )}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="basic" className="mt-4">
                      <ScrollArea className="h-[550px] pr-4">
                        <EndpointEditor
                          endpoint={selectedEndpoint}
                          onChange={handleUpdateEndpoint}
                          schemaRefs={schemaRefs}
                          onResolveRef={resolveRef}
                        />
                      </ScrollArea>
                    </TabsContent>

                    <TabsContent value="testcases" className="mt-4">
                      {selectedEndpoint.testCases && selectedEndpoint.testCases.length > 0 ? (
                        <TestCasePanel
                          testCases={selectedEndpoint.testCases}
                          endpointMethod={selectedEndpoint.method}
                          endpointPath={selectedEndpoint.path}
                          onExecuteTestCase={executeTestCase}
                          onExecuteSelected={executeSelectedTestCases}
                          onUpdateTestCase={updateTestCase}
                          onAddTestCase={addTestCase}
                          onDeleteTestCase={deleteTestCase}
                          isExecuting={isExecuting}
                          executingTestCaseId={executingTestCaseId || ''}
                        />
                      ) : (
                        <Card className="h-[400px] flex items-center justify-center">
                          <div className="text-center">
                            <Wand2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground mb-4">
                              No test cases generated yet
                            </p>
                            <Button onClick={generateTestCases} disabled={isGeneratingTests}>
                              {isGeneratingTests ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Wand2 className="h-4 w-4 mr-1" />
                              )}
                              Generate Test Cases
                            </Button>
                          </div>
                        </Card>
                      )}
                    </TabsContent>

                    <TabsContent value="results" className="mt-4">
                      <ExecutionResultsPanel
                        testCases={selectedEndpoint.testCases || []}
                        endpointMethod={selectedEndpoint.method}
                        endpointPath={selectedEndpoint.path}
                        projectId={projectId}
                        onClearHistory={() => {
                          // Clear execution history from test cases
                          const updatedEndpoint = {
                            ...selectedEndpoint,
                            testCases: selectedEndpoint.testCases?.map(tc => ({
                              ...tc,
                              lastExecution: undefined,
                              executionHistory: []
                            }))
                          };
                          handleUpdateEndpoint(updatedEndpoint);
                        }}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <Card className="h-[500px] flex items-center justify-center">
                  <div className="text-center">
                    <FileJson className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      Select an endpoint to edit or create a new one
                    </p>
                  </div>
                </Card>
              )}
            </div>
          </div>

          {/* API Configuration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                API Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm mb-1.5 block">Base URL</Label>
                  <Input
                    value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                    placeholder="https://api.example.com/v1"
                  />
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Authorization Token</Label>
                  <Input
                    value={apiAuthToken}
                    onChange={(e) => setApiAuthToken(e.target.value)}
                    placeholder="Bearer token..."
                    type="password"
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={saveApiConfig} variant="outline">
                    Save Configuration
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flows" className="mt-4">
          <APIFlowEditor
            endpoints={endpoints}
            flows={flows}
            onFlowsChange={setFlows}
            onExecuteFlow={executeFlow}
            isExecuting={isExecuting}
            projectId={projectId}
          />
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              OpenAPI Specification Preview
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] border rounded-md">
            <pre className="p-4 text-xs font-mono">
              {JSON.stringify(generateSpec(), null, 2)}
            </pre>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={handleCopySpec}>
              <Copy className="h-4 w-4 mr-1" />
              Copy to Clipboard
            </Button>
            <Button onClick={handleExportSpec}>
              <Download className="h-4 w-4 mr-1" />
              Download JSON
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-5 w-5" />
              Save API Configuration
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Configuration Name</Label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Enter a name for this configuration..."
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p>This will save:</p>
              <ul className="list-disc list-inside mt-1">
                <li>{endpoints.length} endpoints</li>
                <li>{endpoints.filter(e => e.testCases?.length).reduce((acc, e) => acc + (e.testCases?.length || 0), 0)} test cases</li>
                <li>{flows.length} E2E flows</li>
                <li>API configuration (base URL, auth token)</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfig} disabled={isSaving || !saveName.trim()}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              {currentSaveId ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Dialog */}
      <Dialog open={isLoadDialogOpen} onOpenChange={setIsLoadDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Load Saved Configuration
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2 pr-4">
              {savedConfigs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No saved configurations found
                </div>
              ) : (
                savedConfigs.map(config => {
                  const testCasesData = config.test_cases as any;
                  const endpointsCount = testCasesData?.endpoints?.length || 0;
                  const testCount = testCasesData?.endpoints?.reduce((acc: number, e: any) => 
                    acc + (e.testCases?.length || 0), 0) || 0;
                  
                  return (
                    <div
                      key={config.id}
                      className={`p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
                        currentSaveId === config.id ? 'border-primary bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{config.name}</h4>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <FileJson className="h-3 w-3" />
                              {endpointsCount} endpoints
                            </span>
                            <span>{testCount} tests</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(config.updated_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleLoadConfig(config)}
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Load'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteConfig(config.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLoadDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Test Cases Approval Dialog */}
      <AIContentApprovalDialog
        open={showApprovalDialog}
        onOpenChange={setShowApprovalDialog}
        artifactType="api_test_case"
        items={Object.values(pendingTestCases).flat().map((tc: any) => ({
          id: tc.id,
          name: tc.name,
          description: tc.description || '',
          content: `${tc.method} ${tc.endpoint}\nExpected Status: ${tc.expectedStatus}\nType: ${tc.type}\nPriority: ${tc.priority}`,
          method: tc.method,
          endpoint: tc.endpoint,
          expectedStatus: tc.expectedStatus,
          type: tc.type,
          priority: tc.priority,
          assertions: tc.assertions,
          parameters: tc.parameters,
          headers: tc.headers,
          body: tc.body
        }))}
        confidence={pendingApprovalConfidence}
        warnings={[]}
        onApprove={handleApproveTestCases}
        onReject={handleRejectTestCases}
      />
    </div>
  );
};
